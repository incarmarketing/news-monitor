"""Monitoring automation configuration.

This file intentionally uses generic defaults so the repository can be shared as
a template. Put real company names, keywords, and API keys in `.env` or
Supabase instead of hard-coding them here.
"""

from __future__ import annotations

import os


def csv_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


COMPANY_NAME = os.getenv("COMPANY_NAME", "샘플회사")
TEAM_NAME = os.getenv("TEAM_NAME", "모니터링팀")
EMAIL_SUBJECT_PREFIX = os.getenv("EMAIL_SUBJECT_PREFIX", "[AI 모니터링]")

OWN_NAMES = csv_env("OWN_NAMES", [COMPANY_NAME])

KEYWORDS = csv_env(
    "MONITOR_KEYWORDS",
    [
        COMPANY_NAME,
        f"{COMPANY_NAME} 브랜드평판",
        "경쟁사명",
        "업계 키워드",
        "정책 규제 키워드",
    ],
)

EXCLUDE_KEYWORDS = csv_env(
    "EXCLUDE_KEYWORDS",
    [
        "채용",
        "구인",
        "알바",
        "아르바이트",
        "창업",
        "무관 스포츠",
        "무관 이벤트",
    ],
)

HOURS_BACK = int(os.getenv("HOURS_BACK", "24"))
ARTICLES_PER_KEYWORD = int(os.getenv("ARTICLES_PER_KEYWORD", "25"))
TOP_N_FOR_BRIEFING = int(os.getenv("TOP_N_FOR_BRIEFING", "60"))
MAX_ARTICLES_FOR_PROMPT = int(os.getenv("MAX_ARTICLES_FOR_PROMPT", "32"))

SCHEDULE_TIMES = csv_env("SCHEDULE_TIMES", ["08:00", "13:00", "18:00"])

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
GEMINI_FALLBACK_MODELS = csv_env(
    "GEMINI_FALLBACK_MODELS",
    ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
)
GEMINI_USAGE_URL = os.getenv("GEMINI_USAGE_URL", "https://aistudio.google.com/usage")
GEMINI_BILLING_URL = os.getenv("GEMINI_BILLING_URL", "https://aistudio.google.com/billing")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "4096"))
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "45"))
GEMINI_CIRCUIT_HOURS = int(os.getenv("GEMINI_CIRCUIT_HOURS", "6"))
GEMINI_CIRCUIT_CREDIT_HOURS = int(os.getenv("GEMINI_CIRCUIT_CREDIT_HOURS", "24"))
GEMINI_CIRCUIT_DISABLED = os.getenv("GEMINI_CIRCUIT_DISABLED", "").lower() in {"1", "true", "yes", "y"}

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_MAX_ISSUE_SUMMARIES = int(os.getenv("GROQ_MAX_ISSUE_SUMMARIES", "20"))
AI_MAX_ISSUE_SUMMARIES = int(os.getenv("AI_MAX_ISSUE_SUMMARIES", os.getenv("GROQ_MAX_ISSUE_SUMMARIES", "8")))
