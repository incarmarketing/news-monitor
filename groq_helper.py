"""Groq issue-summary helper for static dashboard generation."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request

import config

GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")


def is_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def summarize_issue(articles: list[dict], *, retries: int = 1) -> str:
    """Return a one-sentence Korean issue summary, without judgment/action text."""
    if not is_enabled() or not articles:
        return ""

    text = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "너는 한국어 언론 모니터링 기사 요약 도우미다. "
                    "판단, 대응, 리스크 평가, 홍보 활용 가능성은 쓰지 않는다. "
                    "오직 이 기사 묶음이 어떤 이슈인지 사실만 한 문장으로 정리한다."
                ),
            },
            {
                "role": "user",
                "content": build_issue_prompt(articles),
            },
        ],
        max_tokens=120,
        temperature=0.1,
        retries=retries,
    )
    return clean_issue_summary(text)


def generate_briefing_report(clustered: list[dict], metrics: dict, baseline_report: str, *, retries: int = 0) -> str:
    """Generate a compact fallback briefing from the deterministic baseline."""
    if not is_enabled() or not clustered:
        return ""
    articles = sorted(clustered, key=lambda item: item.get("_score", item.get("score", 0)), reverse=True)[:8]
    rows = []
    for index, article in enumerate(articles, 1):
        title = clean_prompt_text(article.get("title", ""))[:100]
        source = clean_prompt_text(article.get("source", ""))
        category = clean_prompt_text(article.get("_category", article.get("category", "")))
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))
        summary = clean_prompt_text(article.get("_summary", "") or article.get("summary", "") or article.get("description", ""))[:140]
        rows.append(f"{index}. {source} | {category}/{tone} | {title}\n요지: {summary}")

    prompt = f"""
아래 고정 분석 초안과 기사 후보만 근거로 사내 언론 모니터링 보고서를 다듬어라.
새로운 사실, 대응 지시, 과장된 판단은 추가하지 마라.

지표:
- 수집 {metrics.get('total_collected', 0)}건
- 분석 {metrics.get('total_after_cluster', 0)}건
- 리스크 {metrics.get('risk_level', 'LOW')}

기사 후보:
{chr(10).join(rows)}

고정 분석 초안:
{baseline_report}

출력 형식:
## 최종 결론
한 문장. 55자 이내.

## 핵심 이슈
- 최대 2개. 각 45자 이내.

## 지표 해석
1~2문장.

## 분석 키워드
키워드 3~5개만 쉼표로 나열.
""".strip()

    text = chat_completion(
        [
            {
                "role": "system",
                "content": "너는 한국어 언론 모니터링 보고서 편집자다. 사실 기반으로 짧게 쓴다.",
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=850,
        temperature=0.15,
        retries=retries,
    )
    return clean_report_text(text)


def generate_period_report(top_articles: list[dict], metrics: dict, baseline_report: str, period_label: str, *, retries: int = 0) -> str:
    if not is_enabled():
        return ""
    rows = []
    for index, article in enumerate(top_articles[:8], 1):
        title = clean_prompt_text(article.get("title", ""))[:100]
        source = clean_prompt_text(article.get("source", ""))
        category = clean_prompt_text(article.get("_category", article.get("category", "")))
        tone = clean_prompt_text(article.get("_tone", article.get("tone", "")))
        summary = clean_prompt_text(article.get("_summary", "") or article.get("summary", "") or article.get("description", ""))[:140]
        rows.append(f"{index}. {source} | {category}/{tone} | {title}\n요지: {summary}")

    prompt = f"""
아래 고정 분석 초안을 기준으로 {period_label} 누적 보고서를 다듬어라.
제언이나 실행 지시는 쓰지 말고, 기간 흐름과 관찰 사실만 쓴다.

지표:
- 수집 {metrics.get('total_collected', 0)}건
- 분석 {metrics.get('total_after_cluster', 0)}건

기사 후보:
{chr(10).join(rows)}

고정 분석 초안:
{baseline_report}

출력 형식:
## 핵심 브리핑
3문장.

## 기간 해석
4문장 이내.

## 리스크 판독
- 4개 bullet 이내.

## 관찰 포인트
- 3개 bullet 이내.
""".strip()

    text = chat_completion(
        [
            {
                "role": "system",
                "content": "너는 한국어 언론 모니터링 기간 보고서 편집자다. 사실 기반으로 짧게 쓴다.",
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=1000,
        temperature=0.15,
        retries=retries,
    )
    return clean_period_report_text(text)


def chat_completion(messages: list[dict], *, max_tokens: int, temperature: float, retries: int = 0) -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return ""
    payload = {
        "model": config.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        GROQ_API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            return str(text or "").strip()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retries:
                retry_after = int(exc.headers.get("Retry-After", "3") or "3")
                time.sleep(min(retry_after, 10))
                continue
            return ""
        except Exception:
            return ""
    return ""


def build_issue_prompt(articles: list[dict]) -> str:
    rows = []
    for index, article in enumerate(articles[:8], 1):
        title = clean_prompt_text(article.get("title", ""))
        source = clean_prompt_text(article.get("source", ""))
        summary = clean_prompt_text(article.get("summary", "") or article.get("description", ""))
        if len(summary) > 180:
            summary = summary[:180].rstrip() + "."
        rows.append(f"{index}. {source} | {title}\n요지: {summary}")

    return f"""
아래 기사들은 같은 이슈로 묶인 기사입니다.

요구사항:
- 한국어 1문장만 출력
- 45~95자
- 이 이슈가 무엇인지 사실만 정리
- 기사 제목을 그대로 반복하지 말 것
- 판단/영향/대응/리스크/주의/긍정/부정 표현 금지
- 언론사명, 날짜, 기사 수, 라벨 표기 금지
- 문장은 반드시 완결형으로 끝낼 것

기사 묶음:
{chr(10).join(rows)}
""".strip()


def clean_prompt_text(value: object) -> str:
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_issue_summary(value: object) -> str:
    text = clean_prompt_text(value)
    text = text.strip("\"'` ")
    text = re.sub(r"^(요약|이슈|핵심)\s*[:：]\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    if not text:
        return ""
    text = re.split(r"(?<=[.!?。])\s+", text)[0].strip()
    forbidden = (
        "주의",
        "부정",
        "긍정",
        "리스크",
        "대응",
        "확인해야",
        "검토해야",
        "필요합니다",
        "영향",
        "활용",
    )
    if any(word in text for word in forbidden):
        return ""
    if len(text) > 120:
        text = text[:120].rstrip()
    if not re.search(r"[.!?。다요임함됨]$", text):
        text += "."
    return text


def clean_report_text(value: object) -> str:
    text = clean_prompt_text(value)
    text = re.sub(r"```(?:markdown)?|```", "", text).strip()
    if not text.startswith("## 최종 결론"):
        return ""
    forbidden = ("대응하세요", "공유하세요", "활용하세요")
    if any(word in text for word in forbidden):
        return ""
    return text


def clean_period_report_text(value: object) -> str:
    text = clean_prompt_text(value)
    text = re.sub(r"```(?:markdown)?|```", "", text).strip()
    if not text.startswith("## 핵심 브리핑"):
        return ""
    forbidden = ("대응하세요", "공유하세요", "활용하세요")
    if any(word in text for word in forbidden):
        return ""
    return text
