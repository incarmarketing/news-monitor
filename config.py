"""News monitoring configuration."""

import os

KEYWORDS = [
    "인카금융",
    "인카금융서비스",
    "보험 마케팅",
    "생명보험",
    "손해보험",
    "보험 프로모션",
    "GA 보험",
    "보험설계사",
    "보험대리점 브랜드평판",
    "GA 브랜드평판",
    "인카금융서비스 브랜드평판",
]

EXCLUDE_KEYWORDS = [
    "채용",
    "구인",
    "알바",
    "아르바이트",
    "창업",
]

HOURS_BACK = 24
ARTICLES_PER_KEYWORD = 25
TOP_N_FOR_BRIEFING = 60
MAX_ARTICLES_FOR_PROMPT = 32

SCHEDULE_TIMES = ["08:00", "13:00", "18:00"]

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
GEMINI_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash,gemini-2.5-flash-lite").split(",")
    if model.strip()
]
GEMINI_USAGE_URL = os.getenv("GEMINI_USAGE_URL", "https://aistudio.google.com/usage")
GEMINI_BILLING_URL = os.getenv("GEMINI_BILLING_URL", "https://aistudio.google.com/billing")
MAX_TOKENS = 4096

EMAIL_SUBJECT_PREFIX = "[언론 동향]"
COMPANY_NAME = "인카금융서비스"
TEAM_NAME = "마케팅부"
