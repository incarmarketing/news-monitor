"""Validate deterministic classification against reviewed database cases.

This gate never calls an AI provider and never writes to Supabase.  It uses
the original title/body fields, editable context rules, and the deterministic
contract so reported accuracy is reproducible.
"""

from __future__ import annotations

import argparse
import json
import os
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import analyzer
import supabase_store
from tools.audit_classification_drift import SELECT_FIELDS, article_from_row


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample-limit", type=int, default=50)
    parser.add_argument("--min-alert-precision", type=float, default=0.99)
    parser.add_argument("--min-alert-recall", type=float, default=0.90)
    parser.add_argument("--output", default="")
    return parser.parse_args()


def get_rows(path: str) -> list[dict[str, Any]]:
    response = supabase_store.request("GET", path, headers={"Prefer": "count=exact"})
    value = response.json()
    total = response.headers.get("Content-Range", "").rsplit("/", 1)[-1]
    if not isinstance(value, list) or not total.isdigit() or len(value) != int(total):
        raise RuntimeError("incomplete classification validation data")
    return value


def chunks(values: list[int], size: int = 100) -> list[list[int]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def fetch_articles(article_ids: list[int]) -> dict[int, dict[str, Any]]:
    articles: dict[int, dict[str, Any]] = {}
    for batch in chunks(sorted(set(article_ids))):
        joined = ",".join(str(value) for value in batch)
        rows = get_rows(f"news_articles?select={SELECT_FIELDS}&id=in.({joined})")
        for row in rows:
            articles[int(row["id"])] = row
    return articles


def classify(article: dict[str, Any]) -> dict[str, Any]:
    article = dict(article)
    article["_category"] = analyzer.categorize(article)
    article["_tone"] = analyzer.analyze_tone(article)
    return analyzer.apply_context_safety_guardrails(article)


def expected_label(value: object, *, tone: bool = False) -> str:
    normalizer = (
        supabase_store.normalize_feedback_tone
        if tone
        else supabase_store.normalize_feedback_category
    )
    normalized = normalizer(value)
    return normalized or str(value or "").strip().lower()


def safe_ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def evaluate(cases: list[dict[str, Any]], sample_limit: int) -> dict[str, Any]:
    category_ok = 0
    tone_ok = 0
    exact_ok = 0
    true_positive = 0
    false_positive = 0
    false_negative = 0
    labelled_alerts = 0
    own_ok = own_count = visible_ok = visible_count = 0
    mismatch_types: Counter[str] = Counter()
    mismatches: list[dict[str, Any]] = []

    for case in cases:
        context = classify(case["article"])
        expected_category = expected_label(case["expected_category"])
        expected_tone = expected_label(case["expected_tone"], tone=True)
        predicted_category = str(context.get("category") or "other")
        predicted_tone = str(context.get("tone") or "neutral")
        category_match = predicted_category == expected_category
        tone_match = predicted_tone == expected_tone
        category_ok += int(category_match)
        tone_ok += int(tone_match)
        exact_ok += int(category_match and tone_match)

        # A classification label is not an alert label. Unreviewed labels remain
        # unmeasured, rather than manufacturing perfect alert precision.
        expected_alert = case.get("expected_alert_eligible")
        predicted_alert = bool(context.get("alert_eligible"))
        if isinstance(expected_alert, bool):
            labelled_alerts += 1
            if predicted_alert and expected_alert:
                true_positive += 1
            elif predicted_alert:
                false_positive += 1
            elif expected_alert:
                false_negative += 1
        own_expected = case.get("expected_own_mentioned")
        if isinstance(own_expected, bool):
            own_count += 1
            own_ok += int(bool(context.get("own_mentioned")) == own_expected)
        visible_expected = case.get("expected_visible")
        visible = context.get("category") not in {"other", "exclude"} and context.get("tone") != "exclude"
        if isinstance(visible_expected, bool):
            visible_count += 1
            visible_ok += int(visible == visible_expected)

        alert_match = expected_alert is None or predicted_alert == expected_alert
        if category_match and tone_match and alert_match and (visible_expected is None or visible == visible_expected) and (own_expected is None or bool(context.get("own_mentioned")) == own_expected):
            continue
        if not category_match:
            mismatch_types["category"] += 1
        if not tone_match:
            mismatch_types["tone"] += 1
        if isinstance(expected_alert, bool) and predicted_alert != expected_alert:
            mismatch_types["alert"] += 1
        if isinstance(visible_expected, bool) and visible != visible_expected:
            mismatch_types["visibility"] += 1
        if isinstance(own_expected, bool) and bool(context.get("own_mentioned")) != own_expected:
            mismatch_types["own_mention"] += 1
        if len(mismatches) < sample_limit:
            mismatches.append(
                {
                    "case": case["case"],
                    "article_id": case.get("article_id"),
                    "title": case["article"].get("title"),
                    "expected": {
                        "category": expected_category,
                        "tone": expected_tone,
                        "alert_eligible": expected_alert,
                        "visible": visible_expected,
                        "own_mentioned": own_expected,
                    },
                    "predicted": {
                        "category": predicted_category,
                        "tone": predicted_tone,
                        "alert_eligible": predicted_alert,
                        "visible": visible,
                        "own_mentioned": bool(context.get("own_mentioned")),
                        "decision": (context.get("classification_decision_path") or {}).get(
                            "decision"
                        ),
                    },
                }
            )

    total = len(cases)
    return {
        "case_count": total,
        "category_accuracy": safe_ratio(category_ok, total),
        "tone_accuracy": safe_ratio(tone_ok, total),
        "exact_accuracy": safe_ratio(exact_ok, total),
        "alert_precision": safe_ratio(true_positive, true_positive + false_positive),
        "alert_recall": safe_ratio(true_positive, true_positive + false_negative),
        "alert_labelled_count": labelled_alerts,
        "alert_unlabelled_count": total - labelled_alerts,
        "own_mention_accuracy": safe_ratio(own_ok, own_count),
        "own_labelled_count": own_count,
        "visibility_accuracy": safe_ratio(visible_ok, visible_count),
        "visibility_labelled_count": visible_count,
        "alert_confusion": {
            "true_positive": true_positive,
            "false_positive": false_positive,
            "false_negative": false_negative,
            "true_negative": labelled_alerts - true_positive - false_positive - false_negative,
        },
        "mismatch_types": dict(mismatch_types),
        "mismatches": mismatches,
    }


def quality_gate(result: dict[str, Any]) -> dict[str, Any]:
    thresholds = {"category_accuracy": 0.95, "tone_accuracy": 0.95,
                  "exact_accuracy": 0.90, "alert_precision": 0.99, "alert_recall": 0.90}
    failures = []
    for key, minimum in thresholds.items():
        value = result.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= 1:
            failures.append(key)
    confusion = result.get("alert_confusion") or {}
    if result.get("case_count", 0) < 30:
        failures.append("insufficient_cases")
    if confusion.get("true_positive", 0) + confusion.get("false_negative", 0) < 5:
        failures.append("insufficient_positive_cases")
    if confusion.get("true_negative", 0) + confusion.get("false_positive", 0) < 20:
        failures.append("insufficient_negative_cases")
    if result.get("alert_unlabelled_count", 0):
        failures.append("unreviewed_alert_labels")
    if result.get("visibility_labelled_count", 0) and (result.get("visibility_accuracy") or 0) < .95:
        failures.append("visibility_accuracy")
    return {**result, "passed": not failures, "failures": failures, "thresholds": thresholds,
            "minimum_cases": 30, "minimum_positive_cases": 5, "minimum_negative_cases": 20}


def load_cases() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    reviews = get_rows(
        "monitor_classification_review_cases?select=review_batch,article_id,"
        "expected_category,expected_tone,expected_visible,expected_own_mentioned,expected_alert_eligible,review_note&order=article_id.asc"
    )
    article_ids = [int(row["article_id"]) for row in reviews if row.get("article_id")]
    article_map = fetch_articles(article_ids)
    review_cases: list[dict[str, Any]] = []
    missing_article_ids: list[int] = []
    for row in reviews:
        article_id = int(row["article_id"])
        article_row = article_map.get(article_id)
        if not article_row:
            missing_article_ids.append(article_id)
            continue
        review_cases.append(
            {
                "case": f"{row.get('review_batch')}:{article_id}",
                "article_id": article_id,
                "article": article_from_row(article_row),
                "expected_category": row.get("expected_category"),
                "expected_tone": row.get("expected_tone"),
                "expected_visible": row.get("expected_visible"),
                "expected_own_mentioned": row.get("expected_own_mentioned"),
                "expected_alert_eligible": row.get("expected_alert_eligible"),
            }
        )

    fixtures = get_rows(
        "monitor_classification_test_cases?select=case_key,title,body,source,keyword,"
        "expected_category,expected_tone,expected_in_dashboard,expected_own_mentioned,expected_alert_eligible,reason&enabled=eq.true&order=case_key.asc"
    )
    fixture_cases = [
        {
            "case": str(row.get("case_key") or "fixture"),
            "article": {
                "title": row.get("title") or "",
                "body": row.get("body") or "",
                "source": row.get("source") or "",
                "keyword": row.get("keyword") or "",
            },
            "expected_category": row.get("expected_category"),
            "expected_tone": row.get("expected_tone"),
            "expected_visible": row.get("expected_in_dashboard"),
            "expected_own_mentioned": row.get("expected_own_mentioned"),
            "expected_alert_eligible": row.get("expected_alert_eligible"),
        }
        for row in fixtures
    ]
    if missing_article_ids:
        raise RuntimeError(f"review articles missing: {missing_article_ids}")
    return review_cases, fixture_cases


def main() -> int:
    os.environ["AI_CONTEXT_ENABLED"] = "false"
    os.environ["AI_CONTEXT_PRO_REVIEW"] = "false"
    os.environ["AI_CONTEXT_CLASSIFICATION"] = "rules"
    args = parse_args()
    if not supabase_store.is_enabled():
        raise SystemExit("SUPABASE_URL and a Supabase service key are required")

    analyzer.configure_context_rules(supabase_store.load_monitor_context_rules())
    review_cases, fixture_cases = load_cases()
    report = {
        "mode": "deterministic_source_only_gold_validation",
        "ruleset": analyzer.classification_ruleset_version(),
        "reviewed": evaluate(review_cases, args.sample_limit),
        "fixtures": evaluate(fixture_cases, args.sample_limit),
    }
    combined = quality_gate(evaluate(review_cases + fixture_cases, args.sample_limit))
    report["combined"] = combined

    output = Path(args.output) if args.output else Path("logs/classification-gold-validation.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"report_file={output.resolve()}")

    failures: list[str] = list(combined["failures"])
    if combined["alert_precision"] is not None and combined["alert_precision"] < args.min_alert_precision:
        failures.append(
            f"alert precision {combined['alert_precision']:.4f} < {args.min_alert_precision:.4f}"
        )
    if combined["alert_recall"] is not None and combined["alert_recall"] < args.min_alert_recall:
        failures.append(
            f"alert recall {combined['alert_recall']:.4f} < {args.min_alert_recall:.4f}"
        )
    if failures:
        raise SystemExit("; ".join(failures))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
