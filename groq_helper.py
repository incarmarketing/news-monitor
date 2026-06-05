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
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or not articles:
        return ""

    payload = {
        "model": config.GROQ_MODEL,
        "messages": [
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
        "temperature": 0.1,
        "max_tokens": 120,
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
            return clean_issue_summary(text)
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
