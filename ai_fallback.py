"""AI provider fallback helpers.

The application decides which articles matter before calling this module.
This module only chooses the text-generation provider for the same input.
Dashboard issue summaries default to Gemini for higher-quality summaries, with
Groq/rules retained only as fallback providers.
"""

from __future__ import annotations

import os
import re
import json

import google.generativeai as genai

import config
import gemini_helper
import groq_helper

_GEMINI_CONFIGURED_KEY = ""

ISSUE_SYSTEM_PROMPT = """
당신은 한국어 언론 모니터링 기사 요약 전문가입니다.
판단, 대응 제안, 위험 평가를 추가하지 말고 기사 묶음에서 확인되는 이슈의 사실관계만 한 문장으로 정리합니다.
""".strip()


def summarize_issue_with_provider(articles: list[dict], *, retries: int = 0) -> tuple[str, str]:
    """Summarize one already-selected issue group using Gemini -> Groq -> rules."""
    if not articles:
        return "", "none"

    provider_mode = issue_summary_provider_mode()
    if provider_mode == "rules":
        rules_summary = rules_issue_summary(articles)
        return rules_summary, "rules" if rules_summary else "none"
    if provider_mode == "groq":
        groq_summary = summarize_issue_with_groq(articles, retries=retries)
        if groq_summary:
            return groq_summary, f"groq:{groq_issue_model()}"
        rules_summary = rules_issue_summary(articles)
        return rules_summary, "rules" if rules_summary else "none"

    prompt = groq_helper.build_issue_prompt(articles)
    gemini_text, gemini_provider = generate_gemini_text(
        f"{ISSUE_SYSTEM_PROMPT}\n\n{prompt}",
        max_tokens=160,
        temperature=0.1,
        purpose="issue_summary",
    )
    gemini_summary = groq_helper.clean_issue_summary(gemini_text)
    if gemini_summary:
        return gemini_summary, gemini_provider

    groq_summary = summarize_issue_with_groq(articles, retries=retries)
    if groq_summary:
        return groq_summary, f"groq:{groq_issue_model()}"

    rules_summary = rules_issue_summary(articles)
    return rules_summary, "rules" if rules_summary else "none"


def summarize_issue(articles: list[dict], *, retries: int = 0) -> str:
    summary, _provider = summarize_issue_with_provider(articles, retries=retries)
    return summary


def summarize_issue_groups_with_provider(groups: list[dict], *, retries: int = 0) -> list[tuple[str, str]]:
    """Summarize dashboard issue groups, batching Groq when explicitly requested."""
    provider_mode = issue_summary_provider_mode()
    if provider_mode == "groq":
        summaries = summarize_issue_groups_with_groq(groups, retries=retries)
        if summaries:
            result: list[tuple[str, str]] = []
            for index, group in enumerate(groups):
                summary = summaries[index] if index < len(summaries) else ""
                if summary:
                    result.append((summary, f"groq:{groq_issue_model()}"))
                else:
                    result.append((rules_issue_summary(group.get("members", [])), "rules"))
            return result
        return [(rules_issue_summary(group.get("members", [])), "rules") for group in groups]

    return [summarize_issue_with_provider(group.get("members", []), retries=retries) for group in groups]


def issue_summary_provider_mode() -> str:
    value = os.getenv("AI_ISSUE_SUMMARY_PROVIDER", "gemini").strip().lower()
    return value if value in {"auto", "gemini", "groq", "rules"} else "auto"


def summarize_issue_with_groq(articles: list[dict], *, retries: int = 0) -> str:
    if not groq_helper.is_enabled():
        return ""
    return groq_helper.summarize_issue(articles, retries=retries)


def groq_issue_model() -> str:
    return os.getenv("GROQ_ISSUE_MODEL", config.GROQ_MODEL)


def summarize_issue_groups_with_groq(groups: list[dict], *, retries: int = 0) -> list[str]:
    if not groq_helper.is_enabled() or not groups:
        return []
    text = groq_helper.chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You summarize Korean news issue groups for a media monitoring dashboard. "
                    "Return only a JSON array of concise Korean sentences. "
                    "No advice, no risk judgment, no markdown."
                ),
            },
            {"role": "user", "content": build_group_batch_prompt(groups)},
        ],
        max_tokens=int(os.getenv("GROQ_ISSUE_BATCH_MAX_TOKENS", "420")),
        temperature=0.1,
        retries=retries,
        purpose="issue_summary_batch",
        model=groq_issue_model(),
    )
    return parse_issue_batch_response(text, len(groups))


def build_group_batch_prompt(groups: list[dict]) -> str:
    sections = [
        "각 관련 기사 묶음의 핵심 이슈를 한국어 한 문장으로 요약하세요.",
        "반드시 입력 순서와 같은 JSON 문자열 배열만 출력하세요.",
        "제목 반복, 출처, 날짜, 판단, 대응 제안은 쓰지 마세요.",
    ]
    for index, group in enumerate(groups, 1):
        rows = []
        for article in group.get("members", [])[:2]:
            title = groq_helper.clean_prompt_text(article.get("title", ""))[:80]
            summary = groq_helper.clean_prompt_text(article.get("summary", "") or article.get("description", ""))[:90]
            rows.append(f"- {title} / {summary}")
        sections.append(f"\n[{index}]\n" + "\n".join(rows))
    return "\n".join(sections)


def parse_issue_batch_response(value: object, expected: int) -> list[str]:
    text = groq_helper.clean_prompt_text(value)
    if not text:
        return []
    try:
        start = text.index("[")
        end = text.rindex("]") + 1
        parsed = json.loads(text[start:end])
        if isinstance(parsed, list):
            return [clean_batch_issue_sentence(item) for item in parsed[:expected]]
    except Exception:
        pass
    lines = re.split(r"\s*(?:\d+[\).]|[-•])\s*", text)
    cleaned = [clean_batch_issue_sentence(line) for line in lines if line.strip()]
    return [item for item in cleaned if item][:expected]


def clean_batch_issue_sentence(value: object) -> str:
    text = groq_helper.clean_prompt_text(value)
    text = text.strip("\"'`[] ")
    text = re.sub(r"^(요약|이슈|핵심)\s*[:：]\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 8:
        return ""
    if len(text) > 120:
        text = text[:120].rstrip()
    if not re.search(r"[.!?。]$", text):
        text += "."
    return text


def generate_gemini_text(
    prompt: str,
    *,
    max_tokens: int,
    temperature: float,
    purpose: str,
) -> tuple[str, str]:
    """Generate text with Gemini candidates only; never falls back here."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return "", "gemini_key_missing"

    is_open, _state = gemini_helper.circuit_open()
    if is_open:
        return "", "gemini_circuit_open"

    configure_gemini(api_key)
    for model_name in gemini_helper.model_candidates():
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                prompt,
                generation_config={"max_output_tokens": max_tokens, "temperature": temperature},
                request_options=gemini_helper.request_options(),
            )
            text = str(getattr(response, "text", "") or "").strip()
            if text:
                gemini_helper.record_response(response, model=model_name, purpose=purpose)
                gemini_helper.reset_circuit()
                return text, model_name
        except BaseException as exc:
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            if gemini_helper.is_quota_error(exc):
                gemini_helper.trip_circuit(exc, model=model_name)
                break
            print(f"Gemini {purpose} failed on {model_name}: {gemini_helper.error_summary(exc)}")
            continue
    return "", "gemini_failed"


def configure_gemini(api_key: str) -> None:
    global _GEMINI_CONFIGURED_KEY
    if _GEMINI_CONFIGURED_KEY == api_key:
        return
    genai.configure(api_key=api_key)
    _GEMINI_CONFIGURED_KEY = api_key


def rules_issue_summary(articles: list[dict]) -> str:
    """Build a plain Korean issue sentence without an AI provider."""
    candidates: list[str] = []
    for article in articles[:5]:
        for key in ("summary", "_summary", "description", "title"):
            for sentence in split_candidate_sentences(article.get(key, "")):
                if is_low_value_sentence(sentence):
                    continue
                candidates.append(sentence)

    for sentence in unique_sentences(candidates):
        return finish_sentence(sentence[:130].rstrip())
    return ""


def split_candidate_sentences(value: object) -> list[str]:
    text = groq_helper.clean_prompt_text(value)
    text = re.sub(r"\b기사\s*열기\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks = re.split(r"(?<=[.!?。])\s+|[•·]\s*|\n+", text)
    if len(chunks) == 1 and len(text) > 90:
        chunks = re.split(r"\s{2,}|, ", text)
    return [chunk.strip(" -·•") for chunk in chunks if len(chunk.strip()) >= 12]


def is_low_value_sentence(sentence: str) -> bool:
    text = sentence.strip()
    if not text:
        return True
    low_value_terms = (
        "기준 핵심만 요약",
        "키워드 기준으로 수집",
        "직접 언급 기사로",
        "리스크 점검 근거",
        "확인이 필요",
        "관찰합니다",
        "추적합니다",
    )
    return any(term in text for term in low_value_terms)


def unique_sentences(sentences: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for sentence in sentences:
        key = re.sub(r"\W+", "", sentence.lower())[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(sentence)
    return result


def finish_sentence(sentence: str) -> str:
    sentence = sentence.strip(" -·•")
    if not sentence:
        return ""
    if not re.search(r"[.!?。]$", sentence):
        sentence += "."
    return sentence
