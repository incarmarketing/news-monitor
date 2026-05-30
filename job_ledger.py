"""Record scheduler/job execution state in Supabase.

The dashboard data tables say what was produced. This ledger says whether the
cloud job that should have produced and sent it actually started and finished.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

try:
    from dotenv import load_dotenv
except ImportError:  # GitHub can still record failures before dependencies install.
    def load_dotenv() -> None:
        return None

KST = timezone(timedelta(hours=9))
VALID_REPORT_SLOTS = {"07", "08", "13", "18"}


def now_kst() -> datetime:
    return datetime.now(KST)


def supabase_url() -> str:
    value = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not value:
        raise RuntimeError("SUPABASE_URL is required")
    return value


def service_key() -> str:
    value = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not value:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required")
    return value


def rest_request(method: str, path: str, payload: list[dict] | None = None) -> None:
    key = service_key()
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{supabase_url()}/rest/v1/{path}",
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json; charset=utf-8",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            response.read()
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase job ledger write failed: {error.code} {detail}") from error


def report_job_row(status: str, *, error: str = "") -> dict:
    current = now_kst()
    slot = os.getenv("REPORT_SLOT", "").strip()
    if slot not in VALID_REPORT_SLOTS:
        slot = ""
    report_date = current.strftime("%Y-%m-%d")
    job_type = "period_report" if slot == "07" else "daily_report"
    run_key = f"{job_type}:{report_date}:{slot or 'manual'}"
    expected_at = None
    if slot:
        expected_at = current.replace(hour=int(slot), minute=0, second=0, microsecond=0).isoformat()

    row = base_row(run_key, job_type, status, error)
    row.update(
        {
            "report_date": report_date,
            "report_slot": slot or None,
            "expected_at": expected_at,
        }
    )
    return row


def negative_job_row(status: str, *, error: str = "") -> dict:
    run_id = os.getenv("GITHUB_RUN_ID") or now_kst().strftime("%Y%m%d%H%M%S")
    row = base_row(f"negative_watch:{run_id}", "negative_watch", status, error)
    row["expected_at"] = now_kst().isoformat()
    return row


def base_row(run_key: str, job_type: str, status: str, error: str = "") -> dict:
    current = now_kst().isoformat()
    started_at = current if status in {"started", "dispatched", "watchdog_dispatched"} else None
    finished_at = current if status in {"success", "failed", "cancelled", "skipped"} else None
    return {
        "run_key": run_key,
        "job_type": job_type,
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "last_seen_at": current,
        "triggered_by": os.getenv("GITHUB_EVENT_NAME", ""),
        "provider": os.getenv("JOB_PROVIDER", "github_actions"),
        "workflow": os.getenv("GITHUB_WORKFLOW", ""),
        "github_run_id": os.getenv("GITHUB_RUN_ID", ""),
        "github_run_attempt": os.getenv("GITHUB_RUN_ATTEMPT", ""),
        "error": error,
        "details": {
            "actor": os.getenv("GITHUB_ACTOR", ""),
            "ref": os.getenv("GITHUB_REF_NAME", ""),
            "repository": os.getenv("GITHUB_REPOSITORY", ""),
            "run_url": github_run_url(),
            "backfill_only": os.getenv("REPORT_BACKFILL_ONLY", ""),
        },
    }


def github_run_url() -> str:
    repo = os.getenv("GITHUB_REPOSITORY", "")
    run_id = os.getenv("GITHUB_RUN_ID", "")
    return f"https://github.com/{repo}/actions/runs/{run_id}" if repo and run_id else ""


def normalize_finish_status(raw: str) -> str:
    value = (raw or "").strip().lower()
    if value == "success":
        return "success"
    if value in {"cancelled", "canceled"}:
        return "cancelled"
    if value == "skipped":
        return "skipped"
    return "failed"


def write_row(row: dict) -> None:
    cleaned = {key: value for key, value in row.items() if value is not None}
    rest_request("POST", f"job_runs?on_conflict={quote('run_key')}", [cleaned])
    print(f"job_ledger {cleaned['status']}: {cleaned['run_key']}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("job", choices=["report", "negative"])
    parser.add_argument("phase", choices=["start", "finish"])
    parser.add_argument("--status", default="")
    parser.add_argument("--error", default="")
    args = parser.parse_args()

    status = "started" if args.phase == "start" else normalize_finish_status(args.status or os.getenv("JOB_STATUS"))
    row = report_job_row(status, error=args.error) if args.job == "report" else negative_job_row(status, error=args.error)
    write_row(row)


if __name__ == "__main__":
    main()
