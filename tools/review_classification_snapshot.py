"""Reproduce a source-only audit from a private DB export without writing to DB."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import analyzer
import supabase_store
from tools import classification_maintenance as maintenance
from tools import validate_classification_gold as gold
from tools.audit_classification_drift import article_from_row, current_classification, normalize_value


def run(source, original, output):
    analyzer.configure_context_rules(source["rules"])
    feedback = supabase_store.build_classification_feedback_index(list(reversed(source["feedback"])))
    cases = [{"case": f"{row['review_batch']}:{row['article_id']}",
              "article": article_from_row(row["article_row"]), "expected_category": row["expected_category"],
              "expected_tone": row["expected_tone"]} for row in source["goldReviews"]]
    cases += [{"case": row["case_key"], "article": {key: row.get(key) or "" for key in ("title", "body", "source", "keyword")},
               "expected_category": row["expected_category"], "expected_tone": row["expected_tone"]} for row in source["goldFixtures"]]
    gate = gold.quality_gate(gold.evaluate(cases, sample_limit=150))
    plans = [maintenance.build_plan(source["rows"], feedback) for _ in range(3)]
    if not all(plan == plans[0] for plan in plans):
        raise RuntimeError("non-deterministic classification audit")
    report = plans[0]
    report.pop("repairs")
    now = datetime.now(timezone.utc)
    dates = [str(row["report_date"]) for row in source["rows"] if row.get("report_date")]
    report.update(run_id="classification-reviewed-" + now.strftime("%Y%m%dT%H%M%S"), generated_at=now.isoformat(),
                  mode="rules_only", ruleset=analyzer.classification_ruleset_version(), gate=gate,
                  window_start=min(dates) if dates else "", window_end=max(dates) if dates else "", applied_count=0)
    report["block_reason"] = maintenance.guard_plan(report, gate)
    report["status"] = "blocked" if report["block_reason"] else "audited"
    original_cases = []
    for row in original["rows"]:
        context, manual = current_classification(row, feedback)
        keys = ("category", "tone", "own_mentioned", "alert_eligible", "negative_target")
        before = {key: normalize_value(key, row.get(key)) for key in keys}
        after = {key: normalize_value(key, context.get(key)) for key in keys}
        evidence = maintenance.source_evidence_status(row, article_from_row(row), before, after, manual)
        unchanged = before == after
        outcome = "수동 분류 보호" if manual else "현재 규칙과 일치" if unchanged else {
            "original_required": "원문 확인 필요", "limited_source": "근거 부족", "source_review": "분류 재검토",
        }.get(evidence, "분류 재검토")
        original_cases.append({"id": row["id"], "title": row["title"], "link": row.get("link"),
                               "before": before, "proposed": after, "outcome": outcome,
                               "evidence_status": evidence, "reason": maintenance.review_reason(article_from_row(row), context, evidence)})
    counts = dict(Counter(row["outcome"] for row in original_cases))
    output.mkdir(parents=True, exist_ok=True)
    (output / "latest-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "original-253.json").write_text(json.dumps(original_cases, ensure_ascii=False, indent=2), encoding="utf-8")
    def cell(value):
        text = str(value or "")
        return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text
    with (output / "253건-분류재검토.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["기사ID", "제목", "원문주소", "처리", "기존분류", "재검토분류", "기존논조", "재검토논조", "근거"])
        for row in original_cases:
            writer.writerow(map(cell, [row["id"], row["title"], row["link"], row["outcome"], row["before"]["category"],
                          row["proposed"]["category"], row["before"]["tone"], row["proposed"]["tone"], row["reason"]]))
    summary = {"scanned": report["row_count"], "original_253": counts, "latest_review_candidates": report["review_count"],
               "bounded_repair_candidates": report["candidate_count"], "applied": 0, "gate": {key: value for key, value in gate.items() if key != "mismatches"},
               "deterministic_passes": 3, "source_basis": "저장된 원문 제목·RSS 설명. 전체 기사 본문 확인 완료를 의미하지 않음"}
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--original", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    run(json.loads(Path(args.input).read_text(encoding="utf-8")), json.loads(Path(args.original).read_text(encoding="utf-8")), Path(args.output))
