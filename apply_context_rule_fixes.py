"""Apply small, idempotent Supabase classification fixes used by dashboards.

This script exists for hosted environments where the Supabase SQL migration
runner is not available. It uses the existing service-role REST path and keeps
the SQL migration as the source-of-truth equivalent.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote

import requests

import supabase_store


RULE_ROW = {
    "rule_key": "non_insurance_financial_legal_noise",
    "label": "비보험 금융·법률 일반 이슈 제외",
    "category": "exclude",
    "tone": "neutral",
    "trigger_terms": [
        "채권사기",
        "채권 사기",
        "투자자 법적 대응",
        "법적 대응",
        "유사수신",
        "불법 리딩방",
        "코인 사기",
        "투자 사기",
    ],
    "required_terms": [],
    "exclude_terms": [
        "인카",
        "인카금융",
        "인카금융서비스",
        "보험",
        "보험사",
        "손해보험",
        "생명보험",
        "GA",
        "보험대리점",
        "설계사",
        "수수료",
        "1200%",
    ],
    "priority": 5,
    "enabled": True,
}

NOISE_RE = re.compile(
    r"(채권\s*사기|투자자\s*법적\s*대응|유사수신|불법\s*리딩방|코인\s*사기|투자\s*사기)",
    re.I,
)
INSURANCE_CONTEXT_RE = re.compile(
    r"(인카|인카금융|인카금융서비스|보험|보험사|손해보험|생명보험|GA|보험대리점|설계사|수수료|1200%)",
    re.I,
)


def upsert_context_rule() -> None:
    supabase_store.request(
        "POST",
        "monitor_context_rules?on_conflict=rule_key",
        data=json.dumps([RULE_ROW], ensure_ascii=False),
    )
    print("context rule upserted: non_insurance_financial_legal_noise")


def fetch_candidate_articles(limit: int = 1000) -> list[dict[str, Any]]:
    select = "article_hash,title,summary,source,keyword,category,tone,own_mentioned,clipping_recommended"
    query = (
        "news_articles?"
        f"select={quote(select)}"
        "&or=("
        "title.ilike.*채권사기*,summary.ilike.*채권사기*,"
        "title.ilike.*채권%20사기*,summary.ilike.*채권%20사기*,"
        "title.ilike.*투자자%20법적%20대응*,summary.ilike.*투자자%20법적%20대응*,"
        "title.ilike.*법적%20대응*,summary.ilike.*법적%20대응*,"
        "title.ilike.*유사수신*,summary.ilike.*유사수신*,"
        "title.ilike.*불법%20리딩방*,summary.ilike.*불법%20리딩방*,"
        "title.ilike.*코인%20사기*,summary.ilike.*코인%20사기*,"
        "title.ilike.*투자%20사기*,summary.ilike.*투자%20사기*"
        ")"
        f"&limit={limit}"
    )
    try:
        response = supabase_store.request("GET", query)
    except requests.HTTPError as exc:
        status = getattr(exc.response, "status_code", None)
        if status in {400, 404}:
            print("news_articles query skipped: required columns/table not available")
            return []
        raise
    rows = response.json()
    return rows if isinstance(rows, list) else []


def is_noise_article(row: dict[str, Any]) -> bool:
    text = " ".join(
        str(row.get(key) or "")
        for key in ("title", "summary", "source", "keyword", "category", "tone")
    )
    return bool(NOISE_RE.search(text)) and not bool(INSURANCE_CONTEXT_RE.search(text))


def patch_article(row: dict[str, Any]) -> bool:
    article_hash = str(row.get("article_hash") or "").strip()
    if not article_hash:
        return False
    payload = {
        "category": "other",
        "tone": "neutral",
        "own_mentioned": False,
        "negative_target": "none",
        "classification_reason": "보험/GA 문맥 없는 금융·법률 일반 이슈로 주요 이슈에서 제외",
        "classification_confidence": 0.95,
        "classification_provider": "rule_non_insurance_financial_legal_noise",
        "clipping_recommended": False,
        "clipping_reason": "보험/GA 문맥 없는 금융·법률 일반 이슈",
    }
    path = f"news_articles?article_hash=eq.{quote(article_hash)}"
    supabase_store.request("PATCH", path, data=json.dumps(payload, ensure_ascii=False))
    return True


def apply_article_fixes() -> int:
    patched = 0
    for row in fetch_candidate_articles():
        if is_noise_article(row):
            patched += int(patch_article(row))
    print(f"article fixes applied: {patched}")
    return patched


def main() -> None:
    if not supabase_store.is_enabled():
        print("Supabase credentials missing; context rule fix skipped.")
        return
    upsert_context_rule()
    apply_article_fixes()


if __name__ == "__main__":
    main()
