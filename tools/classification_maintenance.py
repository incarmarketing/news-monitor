"""Bounded, deterministic classification maintenance; never invents new rules."""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import analyzer
import supabase_store
from tools.audit_classification_drift import (
    SELECT_FIELDS, SEMANTIC_FIELDS, CONTRACT_FIELDS, article_from_row,
    current_classification, normalize_value, priority_score,
)
from tools import validate_classification_gold as gold

KST = timezone(timedelta(hours=9))
MAX_REPAIRS = 25
MAX_REPAIR_RATIO = 0.05
PATCH_FIELDS = (
    *SEMANTIC_FIELDS, *CONTRACT_FIELDS, "classification_evidence",
    "classification_confidence", "classification_provider", "classification_reason",
    "classification_ruleset_version", "classification_decision_path",
    "clipping_recommended", "clipping_reason", "raw",
)
FIELDS = SELECT_FIELDS + ",updated_at,classification_reason,clipping_recommended,clipping_reason"


def fetch_records(table, *, select="*", filters=None, key="id", cap=5000):
    """Keyset scan with an extra probe; truncation is an error, not success."""
    rows, cursor = [], None
    while True:
        params = {"select": select, "order": f"{key}.asc", "limit": min(250, cap + 1 - len(rows))}
        params.update(filters or {})
        if cursor is not None:
            value = json.dumps(cursor, ensure_ascii=False) if isinstance(cursor, str) else str(cursor)
            params[key] = f"gt.{value}"
        for attempt in range(3):
            try:
                page = supabase_store.request("GET", table, params=params).json()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        if not isinstance(page, list):
            raise RuntimeError(f"invalid response: {table}")
        for row in page:
            if not isinstance(row, dict) or row.get(key) is None or (cursor is not None and row[key] <= cursor):
                raise RuntimeError(f"unstable pagination: {table}")
            cursor = row[key]
            rows.append(row)
        if len(rows) > cap:
            raise RuntimeError(f"scan cap exceeded: {table} ({cap})")
        if len(page) < params["limit"]:
            return rows


def config_snapshot():
    feedback = fetch_records("classification_feedback")
    rules = fetch_records("monitor_context_rules", key="rule_key", cap=1000)
    if not any(rule.get("enabled") for rule in rules):
        raise RuntimeError("no active approved context rules")
    # Omit timestamps only; the RPC compares every other value under a lock.
    feedback = [{k: v for k, v in row.items() if k != "created_at"} for row in feedback]
    rules = [{k: v for k, v in row.items() if k not in {"created_at", "updated_at"}} for row in rules]
    return feedback, rules


def is_protected(row, article, feedback_applied):
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    context = raw.get("_ai_context") if isinstance(raw.get("_ai_context"), dict) else {}
    return bool(
        feedback_applied or raw.get("_feedback_applied")
        or row.get("own_mentioned") or analyzer.has_own_evidence(article)
        or row.get("category") in {"own", "sponsorship"}
        or row.get("tone") == "negative" or row.get("alert_eligible")
        or row.get("negative_target") == "own"
        or raw.get("_tone") == "negative" or raw.get("tone") == "negative"
        or raw.get("own_mentioned") or context.get("own_mentioned")
        or context.get("tone") == "negative" or context.get("alert_eligible")
        or str(row.get("classification_provider") or "").startswith("manual")
    )


def source_role_patch(row, article, reason):
    context = analyzer.apply_context_safety_guardrails(copy.deepcopy(article), {
        "category": "other", "tone": "neutral", "own_mentioned": False,
        "negative_target": "none", "provider": "rules:source-role-v1", "reason": reason,
    })
    if (context.get("category"), context.get("tone")) != ("other", "neutral") or context.get("alert_eligible"):
        raise RuntimeError("approved exclusion no longer produces a safe classification")
    patch = {key: context.get(key) for key in (*SEMANTIC_FIELDS, *CONTRACT_FIELDS)}
    patch.update({
        "classification_provider": context["provider"],
        "classification_reason": reason,
        "classification_evidence": context.get("classification_evidence") or context.get("evidence") or "",
        "classification_confidence": context.get("classification_confidence", context.get("confidence", 1)),
        "classification_ruleset_version": analyzer.classification_ruleset_version(),
        "classification_decision_path": context.get("classification_decision_path") or {},
        "clipping_recommended": False, "clipping_reason": "",
    })
    raw = copy.deepcopy(row.get("raw") or {})
    if not isinstance(raw, dict):
        raise RuntimeError("invalid article source data")
    raw.update(patch)
    raw.update({"_category": "other", "_tone": "neutral", "_ai_context": context})
    raw.pop("ai_context", None)
    patch["raw"] = raw
    return patch


def build_plan(rows, feedback_index):
    reviews, repairs, protected, contract_drift = [], [], 0, 0
    for row in rows:
        article = article_from_row(row)
        context, manual = current_classification(row, feedback_index)
        guard = is_protected(row, article, manual)
        protected += int(guard)
        reason = analyzer.source_role_noise_reason(article)
        before = {key: normalize_value(key, row.get(key)) for key in (*SEMANTIC_FIELDS, *CONTRACT_FIELDS)}
        after = {key: normalize_value(key, context.get(key)) for key in before}
        changed = [key for key in before if before[key] != after[key]]
        contract_drift += int(any(key in CONTRACT_FIELDS for key in changed))
        if reason and not guard:
            patch = source_role_patch(row, article, reason)
            if any(row.get(key) != value for key, value in patch.items()):
                repairs.append({
                    "id": row["id"], "article_hash": row["article_hash"],
                    "expected": {key: row.get(key) for key in (*PATCH_FIELDS, "updated_at", "title", "link")},
                    "patch": patch,
                })
            continue
        semantic_change = (
            before["category"] != after["category"] or before["tone"] != after["tone"]
            or bool(before["own_mentioned"]) != bool(after["own_mentioned"])
            or bool(before["alert_eligible"]) != bool(after["alert_eligible"])
            or (before["negative_target"] or "none") != (after["negative_target"] or "none")
        )
        if semantic_change:
            evidence_status = source_evidence_status(row, article, before, after, manual)
            reviews.append({
                "id": row["id"], "article_hash": row.get("article_hash"),
                "title": row.get("title"), "link": row.get("link"), "source": row.get("source"),
                "before": before, "proposed": after, "changed_fields": changed,
                "protected": guard, "manual": manual,
                "reason": review_reason(article, context, evidence_status),
                "priority": priority_score(before, after),
                "evidence_status": evidence_status,
                "source_excerpt": analyzer.original_article_lead(article, 240),
            })
    reviews.sort(key=lambda row: (-row["priority"], row["id"]))
    transitions = Counter(f"{r['before']['category']} -> {r['proposed']['category']}" for r in reviews)
    return {
        "row_count": len(rows), "protected_count": protected,
        "contract_drift_count": contract_drift,
        "candidate_count": len(repairs), "review_count": len(reviews),
        "review_transitions": dict(transitions), "reviews": reviews,
        "evidence_counts": dict(Counter(r["evidence_status"] for r in reviews)),
        "repair_candidates": [{"id": item["id"], "title": item["expected"].get("title"),
            "link": item["expected"].get("link"),
            "before": {key: item["expected"].get(key) for key in SEMANTIC_FIELDS},
            "proposed": {key: item["patch"].get(key) for key in SEMANTIC_FIELDS},
            "reason": item["patch"]["classification_reason"], "evidence_status": "gate_required"} for item in repairs],
        "repairs": repairs,
    }


def source_evidence_status(row, article, before, after, manual=False):
    if manual:
        return "manual_protected"
    has_body = bool(article.get("body") or article.get("content"))
    if not has_body and (before.get("own_mentioned") != after.get("own_mentioned")
                         or before.get("alert_eligible") != after.get("alert_eligible")
                         or before.get("tone") == "negative"):
        return "original_required"
    if len(analyzer.original_article_lead(article)) < 40:
        return "limited_source"
    return "source_review"


def review_reason(article, context, evidence_status):
    if evidence_status == "manual_protected":
        return "운영자가 지정한 분류를 유지하며 자동 보정에서 제외합니다."
    if evidence_status == "original_required":
        return "저장된 제목·설명만으로 기존 당사 언급·경보 판단을 변경할 수 없어 원문 확인이 필요합니다."
    if evidence_status == "limited_source":
        return "원문 설명이 짧거나 없어 제목만으로 확정할 수 없습니다. 기존 DB 값은 유지합니다."
    reason = context.get("reason") or context.get("classification_evidence")
    if reason:
        return reason
    subject = analyzer.insurance_subject_category(article)
    if subject and subject == context.get("category"):
        label = {"industry": "보험사·보험업", "competitor": "GA·보험대리점", "regulation": "정책·규제"}[subject]
        return f"제목의 주요 주체와 행위가 {label} 문맥에 해당합니다. 기존 분류와 비교 검토할 대상입니다."
    rule = analyzer.matched_context_rule(analyzer.article_summary_text(article))
    if rule.get("rule_key"):
        return f"일치한 문맥 규칙: {rule.get('label') or rule['rule_key']} ({rule['rule_key']})"
    return "저장된 제목·RSS 설명의 키워드 문맥과 기존 분류가 다릅니다. 확정 전 재검토가 필요합니다."


def guard_plan(plan, gate):
    if not gate.get("passed"):
        return "reviewed_case_gate_failed"
    if not plan["row_count"]:
        return "empty_scan"
    count = plan["candidate_count"]
    if count > MAX_REPAIRS or count > plan["row_count"] * MAX_REPAIR_RATIO:
        return "repair_volume_exceeded"
    return ""


def validate_gold():
    reviewed, fixtures = gold.load_cases()
    if not reviewed or not fixtures:
        raise RuntimeError("reviewed validation set is missing")
    result = gold.evaluate(reviewed + fixtures, sample_limit=30)
    return gold.quality_gate(result)


def record_report(run_id, report):
    supabase_store.request("POST", "classification_maintenance_runs?on_conflict=run_id", json={
        "run_id": run_id, "report": report,
    }, headers={"Prefer": "resolution=ignore-duplicates,return=minimal"})


def apply_plan(run_id, report, repairs, feedback, rules):
    payload = {"p_run_id": run_id, "p_report": report, "p_repairs": repairs,
               "p_feedback": feedback, "p_rules": rules}
    # Same run ID is safe to retry after a lost response; RPC commits at most once.
    for attempt in range(2):
        try:
            result = supabase_store.request("POST", "rpc/apply_classification_maintenance", json=payload).json()
            if not isinstance(result, dict) or result.get("status") != "applied":
                raise RuntimeError("unexpected repair acknowledgement")
            return result
        except Exception:
            if attempt:
                raise
            time.sleep(2)


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = (
        "## Classification Maintenance\n\n"
        f"- Status: {report.get('status')}\n"
        f"- Scanned: {report.get('row_count', 0)}\n"
        f"- Corrected: {report.get('applied_count', 0)}\n"
        f"- Review candidates (not confirmed errors): {report.get('review_count', 0)}\n"
        f"- Protected: {report.get('protected_count', 0)}\n"
        f"- Block reason: {report.get('block_reason') or '-'}\n"
        "- No AI calls. No automatic keyword-rule promotion.\n"
    )
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as output:
            output.write(summary)
    print(summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", default="logs/classification-maintenance.json")
    args = parser.parse_args()
    os.environ.update(AI_CONTEXT_CLASSIFICATION="rules", AI_CONTEXT_PRO_REVIEW="false")
    now = datetime.now(KST)
    run_id = "classification-" + os.getenv("GITHUB_RUN_ID", now.strftime("%Y%m%dT%H%M%S%f"))
    run_id += "-" + os.getenv("GITHUB_RUN_ATTEMPT", "1")
    report = {"generated_at": now.isoformat(), "status": "started", "mode": "rules_only",
              "run_id": run_id, "ruleset": analyzer.classification_ruleset_version()}
    exit_code = 0
    try:
        if not supabase_store.is_enabled():
            raise RuntimeError("database credentials unavailable")
        feedback, rules = config_snapshot()
        analyzer.configure_context_rules([r for r in rules if r.get("enabled")])
        report["ruleset"] = analyzer.classification_ruleset_version()
        gate = validate_gold()
        since = (now.date() - timedelta(days=6)).isoformat()
        rows = fetch_records("news_articles", select=FIELDS, cap=2500, filters={
            "report_date": f"gte.{since}", "updated_at": f"lte.{now.isoformat()}",
            "and": f"(report_date.lte.{now.date().isoformat()})",
        })
        feedback_index = supabase_store.build_classification_feedback_index(list(reversed(feedback)))
        plan = build_plan(rows, feedback_index)
        repairs = plan.pop("repairs")
        report.update(plan, gate=gate, window_start=since, window_end=now.date().isoformat())
        blocked = guard_plan(plan, gate)
        report["block_reason"] = blocked
        report["status"] = "blocked" if blocked else "audited"
        if blocked:
            exit_code = 1
        elif args.apply and repairs:
            result = apply_plan(run_id, report, repairs, feedback, rules)
            report.update(result)
        if report["status"] != "applied":
            record_report(run_id, report)
    except Exception as error:
        # Preserve raw errors in the private runner log, never credentials in artifacts.
        detail = str(error) if isinstance(error, RuntimeError) else str(getattr(getattr(error, "response", None), "status_code", ""))
        print(f"Maintenance stopped: {type(error).__name__} {detail}")
        report.update(status="blocked", block_reason=type(error).__name__)
        exit_code = 1
        try:
            record_report(run_id, report)
        except Exception:
            print("Private audit ledger unavailable; retained runner artifact")
    write_report(Path(args.output), report)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
