"""Groq fallback helpers for dashboard issue summaries and reports."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

import config

GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")
_GROQ_BLOCKED_UNTIL = 0.0


def is_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def summarize_issue(articles: list[dict], *, retries: int = 1) -> str:
    """Return one Korean sentence explaining what the grouped issue is."""
    if not is_enabled() or not articles:
        return ""

    text = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "너는 한국어 언론 모니터링 기사 요약 전문가다. "
                    "판단, 대응 제안, 위험 평가를 하지 말고 기사 묶음이 다루는 이슈의 사실관계만 한 문장으로 정리한다."
                ),
            },
            {"role": "user", "content": build_issue_prompt(articles)},
        ],
        max_tokens=130,
        temperature=0.1,
        retries=retries,
        purpose="issue_summary",
    )
    return clean_issue_summary(text)


def generate_briefing_report(clustered: list[dict], metrics: dict, baseline_report: str, *, retries: int = 0) -> str:
    """Generate a daily briefing fallback report from selected articles."""
    if not is_enabled() or not clustered:
        return ""

    rows = format_report_articles(clustered[:8])
    prompt = f"""
아래 기사 목록과 규칙 기반 초안을 근거로 사내 언론 모니터링 보고서를 다시 작성하라.
새로운 사실을 만들지 말고, 기사에 있는 내용만 사용하라.
표현은 간결하게 하되 Gemini 보고서와 비슷한 수준의 완성도를 목표로 한다.

지표:
- 수집 {metrics.get('total_collected', 0)}건
- 분석 {metrics.get('total_after_cluster', 0)}건
- 리스크 {metrics.get('risk_level', 'LOW')}

기사 목록:
{rows}

규칙 기반 초안:
{baseline_report}

출력 형식:
## 최종 결론
2문장. 각 문장은 55자 이내.

## 핵심 이슈
- 최대 2개. 각 45자 이내.

## 지표 해석
1~2문장.

## 분석 키워드
키워드 3~5개만 쉼표로 나열.
""".strip()

    text = chat_completion(
        [
            {"role": "system", "content": "너는 한국어 언론 모니터링 보고서 편집자다. 사실 기반으로 짧고 정확하게 쓴다."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=850,
        temperature=0.15,
        retries=retries,
        purpose="daily_report",
    )
    return clean_report_text(text)


def generate_period_report(
    top_articles: list[dict],
    metrics: dict,
    baseline_report: str,
    period_label: str,
    *,
    retries: int = 0,
) -> str:
    """Generate a weekly/monthly briefing fallback report."""
    if not is_enabled() or not top_articles:
        return ""

    rows = format_report_articles(top_articles[:10])
    prompt = f"""
아래 기사 목록과 규칙 기반 초안을 근거로 {period_label} 언론 동향 보고서를 작성하라.
제언이나 실행 지시는 쓰지 말고, 기간 내 보도 흐름과 관찰 사실만 정리하라.
대표 이슈는 당사 직접 언급, 당사 긍정/주의/부정, 반복 노출 기사 순으로 우선한다.

지표:
- 수집 {metrics.get('total_collected', 0)}건
- 분석 {metrics.get('total_after_cluster', 0)}건

기사 목록:
{rows}

규칙 기반 초안:
{baseline_report}

출력 형식:
## 핵심 브리핑
3문장.

## 기간 해석
4문장 이내.

## 리스크 모니터링
- 4개 bullet 이내.

## 관찰 포인트
- 3개 bullet 이내.
""".strip()

    text = chat_completion(
        [
            {"role": "system", "content": "너는 한국어 언론 모니터링 기간 보고서 편집자다. 과장 없이 사실 흐름을 압축한다."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1100,
        temperature=0.15,
        retries=retries,
        purpose="period_report",
    )
    return clean_period_report_text(text)


def format_report_articles(articles: list[dict]) -> str:
    rows = []
    for index, article in enumerate(articles, 1):
        title = clean_prompt_text(article.get("title", ""))[:110]
        source = clean_prompt_text(article.get("source", ""))
        category = clean_prompt_text(article.get("_category", article.get("category", "")))
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))
        summary = clean_prompt_text(article.get("_summary", "") or article.get("summary", "") or article.get("description", ""))[:180]
        rows.append(f"{index}. {source} | {category}/{tone} | {title}\n요약: {summary}")
    return "\n".join(rows)


def chat_completion(
    messages: list[dict],
    *,
    max_tokens: int,
    temperature: float,
    retries: int = 0,
    purpose: str = "groq",
) -> str:
    global _GROQ_BLOCKED_UNTIL
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return ""
    if time.time() < _GROQ_BLOCKED_UNTIL:
        return ""

    payload = {
        "model": config.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    for attempt in range(retries + 1):
        request = urllib.request.Request(
            GROQ_API_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "news-monitor/1.0 (GitHub Actions; Python urllib)",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return str(text or "").strip()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            print(f"Groq {purpose} failed: HTTP {exc.code} {detail}")
            if exc.code == 429:
                retry_after = int(exc.headers.get("Retry-After", "3") or "3")
                _GROQ_BLOCKED_UNTIL = max(
                    _GROQ_BLOCKED_UNTIL,
                    time.time() + min(max(retry_after, 60), 900),
                )
                if attempt < retries:
                    time.sleep(min(retry_after, 10))
                    continue
            return ""
        except Exception as exc:
            print(f"Groq {purpose} failed: {type(exc).__name__} {str(exc)[:300]}")
            return ""
    return ""


def build_issue_prompt(articles: list[dict]) -> str:
    rows = []
    for index, article in enumerate(articles[:8], 1):
        title = clean_prompt_text(article.get("title", ""))
        source = clean_prompt_text(article.get("source", ""))
        keyword = clean_prompt_text(article.get("keyword", ""))
        category = clean_prompt_text(article.get("_category", article.get("category", "")))
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))
        summary = clean_prompt_text(article.get("summary", "") or article.get("description", ""))
        if len(summary) > 220:
            summary = summary[:220].rstrip() + "."
        rows.append(f"{index}. {source} | {keyword} | {category}/{tone} | {title}\n요약: {summary}")

    return f"""
아래 기사들은 같은 이슈로 묶인 기사다.

요구사항:
- 한국어 1문장만 출력
- 45~95자
- 기사 제목을 그대로 반복하지 말 것
- 이슈가 무엇인지 사실만 정리
- 기사 묶음에 인카금융 또는 인카금융서비스가 있으면 당사와 관련된 사실을 우선 요약
- 여러 회사가 함께 나오면 제목의 첫 회사명이 아니라 키워드와 본문에서 반복되는 핵심 주체를 기준으로 요약
- 실적, 순위, 인증, 평판 기사에서는 어떤 회사의 어떤 지표인지 명확히 쓸 것
- 의혹·논란·부정 기사에서는 사실 확정처럼 쓰지 말고 '의혹이 제기됐다' 또는 '논란이 제기됐다'로 쓸 것
- 판단, 대응 제안, 리스크 등급, 긍정/부정/주의 표현 금지
- 언론사명, 날짜, 기사 수 표기 금지
- 문장은 반드시 완결형으로 끝낼 것

기사 묶음:
{chr(10).join(rows)}
""".strip()


def clean_prompt_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("&nbsp;", " ").replace("&amp;nbsp;", " ")
    text = text.replace("&quot;", '"').replace("&#39;", "'")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_issue_summary(value: object) -> str:
    text = clean_prompt_text(value)
    text = text.strip("\"'` ")
    text = re.sub(r"^(요약|이슈|핵심|정리)\s*[:：-]\s*", "", text)
    text = re.sub(r"^[\-•]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    if not text:
        return ""

    lines = [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]
    text = lines[0] if lines else text
    sentence = re.split(r"(?<=[.!?。])\s+", text)[0].strip()
    if sentence:
        text = sentence

    text = remove_action_or_judgment_tail(text)
    text = normalize_risk_claim_wording(text)
    if len(text) < 18:
        return ""
    if len(text) > 120:
        text = text[:120].rstrip()
    if not re.search(r"[.!?。]$", text):
        text += "."
    return text


def normalize_risk_claim_wording(text: str) -> str:
    if not text:
        return ""
    if "인카" in text and ("가로챈" in text or ("가로" in text and "밝혀" in text)):
        return "인카금융 관련 보험 대리점 관리 부실 논란이 제기됐다"
    if "인카" in text and "투자의견" in text and ("하향" in text or "낮아" in text):
        return "인카금융서비스의 투자의견 하향 보도가 나왔다"
    if "금감원" in text and "인카" in text and ("전격 점검" in text or "이직 보따리" in text or "ga" in text.lower()):
        return "금감원이 인카금융서비스 등 GA 정착지원금 지급 실태를 점검했다"
    text = re.sub(r"(.+?)(?:이|가)\s*문제가 되고 있다\.?$", r"\1 논란이 제기됐다", text)
    text = re.sub(r"(.+?)이\s*밝혀졌다\.?$", r"\1 관련 논란이 제기됐다", text)
    return text.strip()


def remove_action_or_judgment_tail(text: str) -> str:
    patterns = (
        r"\s*확인이 필요.*$",
        r"\s*검토가 필요.*$",
        r"\s*주의가 필요.*$",
        r"\s*모니터링이 필요.*$",
        r"\s*추적이 필요.*$",
        r"\s*리스크로.*$",
    )
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned)
    return cleaned.strip(" .")


def fallback_issue_summary(articles: list[dict]) -> str:
    if not articles:
        return ""
    representative = articles[0]
    text = clean_prompt_text(
        " ".join(
            str(value or "")
            for article in articles[:3]
            for value in (
                article.get("title", ""),
                article.get("summary", ""),
                article.get("description", ""),
                article.get("keyword", ""),
            )
        )
    )

    if "인카" in text and "정착률" in text:
        match = re.search(r"정착률\s*([0-9]+(?:\.[0-9]+)?%)", text)
        rate = match.group(1) if match else "57%"
        return f"인카금융서비스의 설계사 정착률이 {rate}로 보도됐다."
    if "인카" in text and "투자의견" in text and ("하향" in text or "낮아" in text):
        return "인카금융서비스의 투자의견 하향 보도가 나왔다."
    if "금감원" in text and "인카" in text and ("전격 점검" in text or "이직 보따리" in text or "정착지원금" in text):
        return "금감원이 인카금융서비스 등 GA 정착지원금 지급 실태를 점검했다."
    if "인카" in text and "우수인증설계사" in text:
        match = re.search(r"([0-9,]+)\s*명", text)
        count = f" {match.group(1)}명" if match else ""
        return f"인카금융서비스가 우수인증설계사{count} 배출 실적을 보도했다."
    if "인카" in text and "브랜드평판" in text:
        return "인카금융서비스가 독립 보험대리점 브랜드평판 상위권에 올랐다."
    if "인카" in text and ("불법 사채" in text or "사채놀이" in text or "약탈 영업" in text):
        return "인카금융 관련 보험 꺾기와 불법 사채 의혹이 제기됐다."
    if "인카" in text and ("가로챈" in text or "관리 부실" in text):
        return "인카금융 관련 보험 대리점 관리 부실 논란이 제기됐다."

    title = clean_prompt_text(representative.get("title", ""))
    title = re.sub(r"\[[^\]]+\]|\([^)]*\)|<[^>]+>", " ", title)
    title = re.sub(r"\s+", " ", title).strip(" -")
    if len(title) > 90:
        title = title[:90].rstrip()
    return f"{title} 보도가 나왔다." if title else ""


def clean_report_text(value: object) -> str:
    text = clean_prompt_text(value)
    text = re.sub(r"```(?:markdown)?|```", "", text).strip()
    if not text.startswith("## 최종 결론"):
        print("Groq daily_report discarded: missing expected heading")
        return ""
    forbidden = ("작성하세요", "공유하세요", "사용하세요")
    if any(word in text for word in forbidden):
        print("Groq daily_report discarded: instruction-like wording")
        return ""
    return text


def clean_period_report_text(value: object) -> str:
    text = clean_prompt_text(value)
    text = re.sub(r"```(?:markdown)?|```", "", text).strip()
    if not text.startswith("## 핵심 브리핑"):
        print("Groq period_report discarded: missing expected heading")
        return ""
    forbidden = ("작성하세요", "공유하세요", "사용하세요")
    if any(word in text for word in forbidden):
        print("Groq period_report discarded: instruction-like wording")
        return ""
    return text


def summarize_issue(articles: list[dict], *, retries: int = 1) -> str:
    """Return one concise Korean sentence for a grouped dashboard issue."""
    if not is_enabled() or not articles:
        return ""

    text = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You summarize Korean news for a media monitoring dashboard. "
                    "Return only one concise Korean sentence about the factual issue. "
                    "Do not add advice, risk judgment, dates, source names, or labels."
                ),
            },
            {"role": "user", "content": build_issue_prompt(articles)},
        ],
        max_tokens=int(os.getenv("GROQ_ISSUE_MAX_TOKENS", "90")),
        temperature=0.1,
        retries=retries,
        purpose="issue_summary",
    )
    return clean_issue_summary(text)


def build_issue_prompt(articles: list[dict]) -> str:
    rows = []
    for index, article in enumerate(articles[: int(os.getenv("GROQ_ISSUE_ARTICLE_LIMIT", "3"))], 1):
        title = clean_prompt_text(article.get("title", ""))[:90]
        source = clean_prompt_text(article.get("source", ""))[:28]
        category = clean_prompt_text(article.get("_category", article.get("category", "")))[:16]
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))[:16]
        summary = clean_prompt_text(article.get("summary", "") or article.get("description", ""))[:110]
        rows.append(f"{index}. {source} | {category}/{tone} | {title}\nsummary: {summary}")

    return (
        "다음 관련 기사 묶음의 핵심 이슈를 한국어 한 문장으로 요약하세요.\n"
        "제목을 그대로 반복하지 말고, 무엇이 보도됐는지만 말하세요.\n"
        "판단/대응/위험평가/출처/날짜는 쓰지 마세요.\n\n"
        + "\n".join(rows)
    )
