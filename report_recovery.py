"""Resume a generated daily report without collecting or analyzing it again."""

from __future__ import annotations

import json
import os

import archiver
import supabase_store


def restore_generated_daily_report() -> bool:
    if os.getenv("RESUME_GENERATED_REPORT", "").lower() not in {"1", "true", "yes"}:
        return False
    if os.getenv("FORCE_SLACK_SEND", "").lower() in {"1", "true", "yes"}:
        return False
    if os.getenv("REPORT_BACKFILL_ONLY", "").lower() in {"1", "true", "yes"}:
        return False
    slot = os.getenv("REPORT_SLOT", "").zfill(2)
    if slot not in {"08", "13", "18"}:
        return False
    today = archiver.today_kst()
    try:
        runs = supabase_store.load_report_run_archives()
        matching = [run for run in runs if str(run.get("report_date")) == today.isoformat() and str(run.get("report_slot", "")).zfill(2) == slot]
        if not matching:
            return False
        run = max(matching, key=lambda row: str(row.get("timestamp") or ""))
        from publish_report import supabase_run_to_archive

        payload = supabase_run_to_archive(run)
        expected = int((run.get("metrics") or {}).get("total_after_cluster") or 0)
        if not payload or (expected > 0 and not payload.get("articles")):
            return False
    except Exception as error:
        print(f"Generated report resume unavailable ({type(error).__name__}); normal collection will continue.")
        return False
    target = archiver.archive_path(today, slot)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)
    print(f"Resumed generated report {today.isoformat()}-{slot}; collection and analysis skipped.")
    return True
