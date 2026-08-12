"""Read-only full-history classification drift audit.

The script reloads every ``news_articles`` row, runs the current deterministic
classification rules without calling an AI provider, and compares the result
with the values stored in Supabase.  It never writes to the database.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import analyzer
import supabase_store


SELECT_FIELDS = (
    "id,article_hash,report_date,title,link,source,keyword,pub_date,category,tone,"
    "own_mentioned,negative_target,document_type,own_role,risk_event_type,"
    "alert_eligible,classification_provider,classification_ruleset_version,raw"
)
SEMANTIC_FIELDS = ("category", "tone", "own_mentioned", "negative_target")
CONTRACT_FIELDS = ("document_type", "own_role", "risk_event_type", "alert_eligible")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50_000)
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--sample-limit", type=int, default=120)
    parser.add_argument(
        "--output",
        default="",
        help="JSON output path. Defaults to logs/classification-audit-<timestamp>.json",
    )
    return parser.parse_args()


def fetch_rows(limit: int, page_size: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    base = f"news_articles?select={SELECT_FIELDS}&order=id.asc"
    for offset in range(0, limit, page_size):
        response = supabase_store.request(
            "GET",
            f"{base}&limit={page_size}&offset={offset}",
        )
        page = response.json()
        if not isinstance(page, list) or not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
    return rows


def clean_raw(raw: object) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    cleaned = dict(raw)
    for key in (
        "_category",
        "category",
        "_tone",
        "tone",
        "_ai_context",
        "ai_context",
        "classification_provider",
        "classification_ruleset_version",
    ):
        cleaned.pop(key, None)
    return cleaned


def article_from_row(row: dict[str, Any]) -> dict[str, Any]:
    raw = clean_raw(row.get("raw"))
    article = {
        "id": row.get("id"),
        "article_hash": row.get("article_hash") or "",
        "title": row.get("title") or raw.get("title") or "",
        "link": row.get("link") or raw.get("link") or raw.get("url") or "",
        "source": row.get("source") or raw.get("source") or "",
        "keyword": row.get("keyword") or "",
        "pub_date": row.get("pub_date") or raw.get("pub_date") or raw.get("date") or "",
        "description": raw.get("description") or "",
        "content": raw.get("content") or "",
        "body": raw.get("body") or "",
        "raw": raw,
    }
    return article


def current_classification(
    row: dict[str, Any],
    feedback_index: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], bool]:
    article = article_from_row(row)
    feedback_applied = supabase_store.apply_classification_feedback(article, feedback_index)
    if feedback_applied:
        context = analyzer.normalized_ai_context(
            article,
            {
                "category": article.get("_category"),
                "tone": article.get("_tone"),
            },
        )
        context = analyzer.apply_classification_contract(article, context)
    else:
        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)
        context = analyzer.apply_context_safety_guardrails(article)
    return context, feedback_applied


def normalize_value(field: str, value: object) -> object:
    if field in {"own_mentioned", "alert_eligible"}:
        if value is None:
            return None
        return bool(value)
    return str(value or "").strip()


def month_key(row: dict[str, Any]) -> str:
    value = str(row.get("pub_date") or row.get("report_date") or "")
    return value[:7] if len(value) >= 7 else "unknown"


def priority_score(stored: dict[str, object], current: dict[str, object]) -> int:
    score = 0
    if stored.get("alert_eligible") != current.get("alert_eligible"):
        score += 100
    if stored.get("tone") == "negative" or current.get("tone") == "negative":
        score += 40
    if stored.get("own_mentioned") != current.get("own_mentioned"):
        score += 25
    if stored.get("category") != current.get("category"):
        score += 12
    if stored.get("tone") != current.get("tone"):
        score += 10
    return score


def run_audit(rows: list[dict[str, Any]], sample_limit: int) -> dict[str, Any]:
    context_rules = supabase_store.load_monitor_context_rules()
    analyzer.configure_context_rules(context_rules)
    feedback_index = supabase_store.load_classification_feedback_index()

    field_drift = Counter()
    semantic_row_drift = 0
    contract_row_drift = 0
    feedback_applied_count = 0
    by_month: dict[str, Counter] = defaultdict(Counter)
    category_transitions = Counter()
    tone_transitions = Counter()
    samples: list[dict[str, Any]] = []

    for row in rows:
        context, feedback_applied = current_classification(row, feedback_index)
        feedback_applied_count += int(feedback_applied)
        stored = {
            field: normalize_value(field, row.get(field))
            for field in (*SEMANTIC_FIELDS, *CONTRACT_FIELDS)
        }
        current = {
            field: normalize_value(field, context.get(field))
            for field in (*SEMANTIC_FIELDS, *CONTRACT_FIELDS)
        }
        semantic_diff = [field for field in SEMANTIC_FIELDS if stored[field] != current[field]]
        contract_diff = [field for field in CONTRACT_FIELDS if stored[field] != current[field]]
        if not semantic_diff and not contract_diff:
            continue

        month = month_key(row)
        if semantic_diff:
            semantic_row_drift += 1
            by_month[month]["semantic"] += 1
        if contract_diff:
            contract_row_drift += 1
            by_month[month]["contract"] += 1
        for field in (*semantic_diff, *contract_diff):
            field_drift[field] += 1
            by_month[month][field] += 1
        if "category" in semantic_diff:
            category_transitions[(stored["category"], current["category"])] += 1
        if "tone" in semantic_diff:
            tone_transitions[(stored["tone"], current["tone"])] += 1

        samples.append(
            {
                "priority": priority_score(stored, current),
                "id": row.get("id"),
                "pub_date": row.get("pub_date"),
                "title": row.get("title"),
                "source": row.get("source"),
                "link": row.get("link"),
                "stored": stored,
                "current": current,
                "semantic_diff": semantic_diff,
                "contract_diff": contract_diff,
                "feedback_applied": feedback_applied,
            }
        )

    samples.sort(key=lambda item: (-item["priority"], str(item.get("pub_date") or "")), reverse=False)
    total = len(rows)
    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "mode": "read_only_deterministic_no_ai",
        "current_ruleset": analyzer.classification_ruleset_version(),
        "row_count": total,
        "context_rule_count": len(context_rules),
        "feedback_rule_count": len(feedback_index),
        "feedback_applied_rows": feedback_applied_count,
        "semantic_drift_rows": semantic_row_drift,
        "semantic_drift_pct": round((semantic_row_drift / total * 100) if total else 0, 3),
        "contract_drift_rows": contract_row_drift,
        "contract_drift_pct": round((contract_row_drift / total * 100) if total else 0, 3),
        "field_drift": dict(field_drift.most_common()),
        "category_transitions": [
            {"from": old, "to": new, "count": count}
            for (old, new), count in category_transitions.most_common()
        ],
        "tone_transitions": [
            {"from": old, "to": new, "count": count}
            for (old, new), count in tone_transitions.most_common()
        ],
        "by_month": {month: dict(counts) for month, counts in sorted(by_month.items())},
        "priority_samples": samples[:sample_limit],
    }


def main() -> int:
    os.environ["AI_CONTEXT_ENABLED"] = "false"
    os.environ["AI_CONTEXT_PRO_REVIEW"] = "false"
    args = parse_args()
    if not supabase_store.is_enabled():
        raise SystemExit("SUPABASE_URL and a Supabase API key are required")

    rows = fetch_rows(args.limit, args.page_size)
    audit = run_audit(rows, args.sample_limit)
    output = Path(args.output) if args.output else Path("logs") / (
        f"classification-audit-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: audit[key] for key in (
        "row_count",
        "current_ruleset",
        "context_rule_count",
        "feedback_applied_rows",
        "semantic_drift_rows",
        "semantic_drift_pct",
        "contract_drift_rows",
        "contract_drift_pct",
        "field_drift",
    )}, ensure_ascii=False, indent=2))
    print(f"audit_file={output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
