"""Safely reclassify all stored articles with the deterministic rule contract.

The default mode is a read-only dry run.  ``--apply`` writes only the fields
owned by classification and uses a service-role-only RPC in small atomic
batches.  Source titles, links, article bodies, and generated summaries are
never changed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import analyzer
import deterministic_risk
import supabase_store
from tools.audit_classification_drift import (
    CONTRACT_FIELDS,
    SEMANTIC_FIELDS,
    article_from_row,
    current_classification,
    fetch_rows,
    normalize_value,
)


WRITE_FIELDS = (
    "category",
    "tone",
    "own_mentioned",
    "negative_target",
    "classification_evidence",
    "classification_confidence",
    "classification_provider",
    "classification_ruleset_version",
    "document_type",
    "own_role",
    "risk_event_type",
    "alert_eligible",
    "classification_decision_path",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50_000)
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--sample-limit", type=int, default=100)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", default="")
    parser.add_argument(
        "--max-alerts",
        type=int,
        default=100,
        help="Abort if deterministic alert candidates exceed this safety cap.",
    )
    return parser.parse_args()


def normalized_context_value(field: str, context: dict[str, Any]) -> object:
    return normalize_value(field, context.get(field))


def build_repair(
    row: dict[str, Any],
    context: dict[str, Any],
    deterministic: dict[str, Any],
) -> dict[str, Any]:
    decision_path = context.get("classification_decision_path")
    decision_path = dict(decision_path) if isinstance(decision_path, dict) else {}
    evidence = str(deterministic.get("evidence") or "").strip()
    if not evidence:
        evidence = str(context.get("evidence") or "").strip()
    provider = str(context.get("provider") or "").strip()
    if deterministic.get("decision") in {
        "alert",
        "review",
        "positive_or_routine_guardrail",
        "suppress_negative_alert",
        "exclude_from_alert",
    }:
        provider = "rules:deterministic-risk-v1"
    provider = provider or "rules:classification-contract-v5"
    try:
        confidence = float(context.get("confidence") or deterministic.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0

    return {
        "id": int(row["id"]),
        "category": str(context.get("category") or "other"),
        "tone": str(context.get("tone") or "neutral"),
        "own_mentioned": bool(context.get("own_mentioned")),
        "negative_target": str(context.get("negative_target") or "none"),
        "classification_evidence": evidence[:1000],
        "classification_confidence": round(max(0.0, min(confidence, 1.0)), 3),
        "classification_provider": provider,
        "classification_ruleset_version": analyzer.classification_ruleset_version(),
        "document_type": str(context.get("document_type") or "other"),
        "own_role": str(context.get("own_role") or "absent"),
        "risk_event_type": str(context.get("risk_event_type") or "none"),
        "alert_eligible": bool(context.get("alert_eligible")),
        "classification_decision_path": decision_path,
    }


def validate_repair(
    article: dict[str, Any],
    repair: dict[str, Any],
    deterministic: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    source_own = deterministic_risk.contains_own_source(article)
    if repair["own_mentioned"] and not source_own:
        errors.append("own_without_source_evidence")
    if repair["alert_eligible"] and not deterministic.get("alert_eligible"):
        errors.append("alert_without_deterministic_contract")
    if repair["alert_eligible"] and not repair["classification_evidence"]:
        errors.append("alert_without_source_sentence")
    if repair["alert_eligible"] and (
        repair["category"] != "own"
        or repair["tone"] != "negative"
        or repair["negative_target"] != "own"
    ):
        errors.append("invalid_alert_shape")
    if not source_own and repair["negative_target"] == "own":
        errors.append("negative_target_without_source_evidence")
    if not source_own and repair["category"] in {"own", "sponsorship"}:
        errors.append("company_category_without_source_evidence")
    return errors


def stored_value(row: dict[str, Any], field: str) -> object:
    if field in {*SEMANTIC_FIELDS, *CONTRACT_FIELDS}:
        return normalize_value(field, row.get(field))
    if field == "classification_confidence":
        try:
            return round(float(row.get(field) or 0), 3)
        except (TypeError, ValueError):
            return 0.0
    if field == "classification_decision_path":
        return row.get(field) if isinstance(row.get(field), dict) else {}
    return str(row.get(field) or "").strip()


def run(rows: list[dict[str, Any]], sample_limit: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rules = supabase_store.load_monitor_context_rules()
    analyzer.configure_context_rules(rules)
    feedback = supabase_store.load_classification_feedback_index()
    transitions = Counter()
    decisions = Counter()
    changed_fields = Counter()
    validation_errors = Counter()
    validation_samples: list[dict[str, Any]] = []
    deferred_reasons = Counter()
    deferred_samples: list[dict[str, Any]] = []
    repairs: list[dict[str, Any]] = []
    samples: list[dict[str, Any]] = []
    alert_count = 0
    review_count = 0

    for row in rows:
        article = article_from_row(row)
        context, feedback_applied = current_classification(row, feedback)
        deterministic = deterministic_risk.classify(article)
        repair = build_repair(row, context, deterministic)
        errors = validate_repair(article, repair, deterministic)
        if feedback_applied and errors == ["company_category_without_source_evidence"]:
            deferred_reasons["manual_company_feedback_missing_source_evidence"] += 1
            if len(deferred_samples) < max(20, sample_limit):
                deferred_samples.append(
                    {
                        "id": row.get("id"),
                        "title": row.get("title"),
                        "source": row.get("source"),
                        "reason": "manual_company_feedback_missing_source_evidence",
                    }
                )
            continue
        for error in errors:
            validation_errors[error] += 1
        if errors:
            if len(validation_samples) < max(20, sample_limit):
                validation_samples.append(
                    {
                        "id": row.get("id"),
                        "title": row.get("title"),
                        "source": row.get("source"),
                        "feedback_applied": feedback_applied,
                        "errors": errors,
                        "stored": {
                            "category": row.get("category"),
                            "tone": row.get("tone"),
                            "negative_target": row.get("negative_target"),
                            "alert_eligible": row.get("alert_eligible"),
                        },
                        "proposed": {
                            "category": repair["category"],
                            "tone": repair["tone"],
                            "negative_target": repair["negative_target"],
                            "alert_eligible": repair["alert_eligible"],
                        },
                        "deterministic": {
                            "decision": deterministic.get("decision"),
                            "alert_eligible": deterministic.get("alert_eligible"),
                            "review_required": deterministic.get("review_required"),
                            "evidence": deterministic.get("evidence"),
                        },
                    }
                )
            continue

        decision = str(deterministic.get("decision") or "no_alert")
        decisions[decision] += 1
        alert_count += int(repair["alert_eligible"])
        review_count += int(bool(deterministic.get("review_required")))
        transitions[(str(row.get("tone") or ""), repair["tone"])] += 1
        diff = [field for field in WRITE_FIELDS if stored_value(row, field) != repair[field]]
        if not diff:
            continue
        for field in diff:
            changed_fields[field] += 1
        repairs.append(repair)
        if len(samples) < sample_limit:
            samples.append(
                {
                    "id": row.get("id"),
                    "title": row.get("title"),
                    "source": row.get("source"),
                    "feedback_applied": feedback_applied,
                    "decision": decision,
                    "changed_fields": diff,
                    "stored": {field: stored_value(row, field) for field in diff},
                    "current": {field: repair[field] for field in diff},
                }
            )

    report = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "mode": "deterministic_apply_candidate",
        "ruleset": analyzer.classification_ruleset_version(),
        "row_count": len(rows),
        "rule_count": len(rules),
        "repair_count": len(repairs),
        "deterministic_alert_rows": alert_count,
        "deterministic_review_rows": review_count,
        "decision_counts": dict(decisions.most_common()),
        "changed_fields": dict(changed_fields.most_common()),
        "tone_transitions": [
            {"from": old, "to": new, "count": count}
            for (old, new), count in transitions.most_common()
            if old != new
        ],
        "validation_errors": dict(validation_errors.most_common()),
        "validation_samples": validation_samples,
        "deferred_rows": sum(deferred_reasons.values()),
        "deferred_reasons": dict(deferred_reasons.most_common()),
        "deferred_samples": deferred_samples,
        "samples": samples,
    }
    return report, repairs


def apply_repairs(repairs: list[dict[str, Any]], batch_size: int) -> int:
    affected = 0
    for start in range(0, len(repairs), batch_size):
        batch = repairs[start : start + batch_size]
        response = supabase_store.request(
            "POST",
            "rpc/apply_deterministic_classification_repairs",
            json={"p_rows": batch},
        )
        value = response.json()
        affected += int(value or 0)
        print(f"applied={affected}/{len(repairs)}")
    return affected


def main() -> int:
    os.environ["AI_CONTEXT_ENABLED"] = "false"
    os.environ["AI_CONTEXT_PRO_REVIEW"] = "false"
    os.environ["AI_CONTEXT_CLASSIFICATION"] = "rules"
    args = parse_args()
    if not supabase_store.is_enabled():
        raise SystemExit("SUPABASE_URL and a Supabase service key are required")

    rows = fetch_rows(args.limit, args.page_size)
    report, repairs = run(rows, args.sample_limit)
    report["apply_requested"] = bool(args.apply)
    report["affected_rows"] = 0
    output = Path(args.output) if args.output else Path("logs") / (
        f"deterministic-reclassification-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if report["validation_errors"]:
        raise SystemExit(
            json.dumps(
                {
                    "validation_errors": report["validation_errors"],
                    "validation_samples": report["validation_samples"],
                    "report_file": str(output.resolve()),
                },
                ensure_ascii=False,
            )
        )
    if report["deterministic_alert_rows"] > args.max_alerts:
        raise SystemExit(
            f"alert safety cap exceeded: {report['deterministic_alert_rows']} > {args.max_alerts}"
        )

    if args.apply:
        report["affected_rows"] = apply_repairs(repairs, args.batch_size)
        if report["affected_rows"] != len(repairs):
            raise SystemExit(
                f"affected row mismatch: {report['affected_rows']} != {len(repairs)}"
            )

    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_keys = (
        "mode",
        "ruleset",
        "row_count",
        "rule_count",
        "repair_count",
        "deterministic_alert_rows",
        "deterministic_review_rows",
        "decision_counts",
        "changed_fields",
        "tone_transitions",
        "validation_errors",
        "deferred_rows",
        "deferred_reasons",
        "apply_requested",
        "affected_rows",
    )
    print(json.dumps({key: report[key] for key in summary_keys}, ensure_ascii=False, indent=2))
    print(f"report_file={output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
