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
GEMINI_PRO_MODEL = os.getenv("GEMINI_PRO_MODEL", GEMINI_MODEL).strip() or "gemini-2.5-pro"
GEMINI_FLASH_MODEL = os.getenv("GEMINI_FLASH_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
GEMINI_FLASH_LITE_MODEL = os.getenv("GEMINI_FLASH_LITE_MODEL", "gemini-2.5-flash-lite").strip()
GEMINI_CONTEXT_MODEL = os.getenv("GEMINI_CONTEXT_MODEL", GEMINI_FLASH_MODEL).strip() or GEMINI_FLASH_MODEL
GEMINI_ISSUE_MODEL = os.getenv("GEMINI_ISSUE_MODEL", GEMINI_FLASH_MODEL).strip() or GEMINI_FLASH_MODEL
GEMINI_REPORT_MODEL = os.getenv("GEMINI_REPORT_MODEL", GEMINI_PRO_MODEL).strip() or GEMINI_PRO_MODEL
GEMINI_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash,gemini-2.5-flash-lite").split(",")
    if model.strip()
]
GEMINI_USAGE_URL = os.getenv("GEMINI_USAGE_URL", "https://aistudio.google.com/usage")
GEMINI_BILLING_URL = os.getenv("GEMINI_BILLING_URL", "https://aistudio.google.com/billing")
MAX_TOKENS = 4096
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "45"))
GEMINI_CIRCUIT_HOURS = int(os.getenv("GEMINI_CIRCUIT_HOURS", "6"))
GEMINI_CIRCUIT_CREDIT_HOURS = int(os.getenv("GEMINI_CIRCUIT_CREDIT_HOURS", "24"))
GEMINI_CIRCUIT_DISABLED = os.getenv("GEMINI_CIRCUIT_DISABLED", "").lower() in {"1", "true", "yes", "y"}

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_MAX_ISSUE_SUMMARIES = int(os.getenv("GROQ_MAX_ISSUE_SUMMARIES", "20"))
AI_MAX_ISSUE_SUMMARIES = int(os.getenv("AI_MAX_ISSUE_SUMMARIES", os.getenv("GROQ_MAX_ISSUE_SUMMARIES", "8")))

EMAIL_SUBJECT_PREFIX = "[언론 동향]"
COMPANY_NAME = "인카금융서비스"
TEAM_NAME = "마케팅부"
