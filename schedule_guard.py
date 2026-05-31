"""Guard scheduled GitHub Actions runs against missed slots and duplicates."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

KST = timezone(timedelta(hours=9))
STATE_DIR = Path(".run-state")
PERIOD_SLOT = "07"
DAILY_SLOTS = ("08", "13", "18")
SCHEDULE_SLOT_MAP = {
    "*/5 22 * * *": "07",
    "*/5 23 * * *": "08",
    "*/5 4 * * *": "13",
    "*/5 9 * * *": "18",
}
SLOT_DUE_HOUR = {
    "07": 7,
    "08": 8,
    "13": 13,
    "18": 18,
}
DAILY_REPORT_TITLE_PREFIX = "\uc77c\uc77c \uc5b8\ub860 \ub3d9\ud5a5"


def github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as file:
            file.write(f"{name}={value}\n")
    print(f"{name}={value}")


def begin() -> None:
    event_name = os.getenv("GITHUB_EVENT_NAME", "")
    if event_name != "schedule":
        begin_manual_or_push(event_name)
        return

    cron = normalize_cron(os.getenv("SCHEDULE_CRON", ""))
    now = datetime.now(KST)
    if is_period_schedule(cron):
        begin_period_schedule(now)
    else:
        begin_daily_schedule(now, cron)


def begin_daily_schedule(now: datetime, cron: str) -> None:
    today = now.strftime("%Y-%m-%d")
    candidates = due_daily_slots(now)

    if not candidates:
        skip_schedule(
            "Daily report watcher skipped: no daily slot is due at "
            f"KST {now.strftime('%Y-%m-%d %H:%M')}."
        )
        return

    for slot in candidates:
        marker_path = STATE_DIR / f"{today}-{slot}.txt"
        if slot_is_complete(today, slot, marker_path):
            print(f"Already completed scheduled slot: {marker_path}")
            continue

        github_output("should_run", "true")
        github_output("should_mark", "true")
        github_output("should_period", "true" if slot == PERIOD_SLOT else "false")
        github_output("kst_hour", slot)
        github_output("marker_path", marker_path.as_posix())
        print(
            "Daily report slot is open: "
            f"{marker_path} (current KST {now.strftime('%H:%M')}, cron={cron or 'watchdog'})"
        )
        return

    skip_schedule(f"All due daily report slots already completed for {today}: {', '.join(candidates)}")


def begin_period_schedule(now: datetime) -> None:
    today = now.strftime("%Y-%m-%d")
    marker_path = STATE_DIR / f"{today}-{PERIOD_SLOT}.txt"
    github_output("kst_hour", PERIOD_SLOT)
    github_output("should_period", "true")
    github_output("marker_path", marker_path.as_posix())
    github_output("should_mark", "true")

    if not period_report_due(now):
        github_output("should_run", "false")
        print("Period report slot skipped: not Monday or first day of month.")
        return
    if marker_path.exists():
        github_output("should_run", "false")
        print(f"Already completed period report slot: {marker_path}")
        return

    github_output("should_run", "true")
    print(
        "Period report slot is open: "
        f"{marker_path} (current KST {now.strftime('%Y-%m-%d %H:%M')})"
    )


def begin_manual_or_push(event_name: str) -> None:
    manual_slot = os.getenv("MANUAL_REPORT_SLOT", "").strip()
    is_slot_dispatch = manual_slot in DAILY_SLOTS
    if not is_slot_dispatch:
        manual_slot = "manual"

    marker_path = ""
    should_mark = "false"
    should_run = "true"

    if event_name == "workflow_dispatch" and is_slot_dispatch:
        today = datetime.now(KST).strftime("%Y-%m-%d")
        marker = STATE_DIR / f"{today}-{manual_slot}.txt"
        marker_path = marker.as_posix()
        should_mark = "true"
        if not os.getenv("FORCE_KAKAO_SEND") and slot_is_complete(today, manual_slot, marker):
            should_run = "false"
            print(f"Already completed manually dispatched slot: {marker}")

    github_output("should_run", should_run)
    github_output("should_mark", should_mark)
    github_output("should_period", "false")
    github_output("kst_hour", manual_slot)
    github_output("marker_path", marker_path)


def skip_schedule(message: str) -> None:
    github_output("should_run", "false")
    github_output("should_mark", "false")
    github_output("should_period", "false")
    github_output("kst_hour", "")
    github_output("marker_path", "")
    print(message)


def due_daily_slots(now: datetime) -> list[str]:
    return [slot for slot in DAILY_SLOTS if now.hour >= SLOT_DUE_HOUR[slot]]


def period_report_due(now: datetime) -> bool:
    return now.isoweekday() == 1 or now.day == 1


def slot_is_complete(report_date: str, slot: str, marker_path: Path) -> bool:
    if slot == PERIOD_SLOT:
        return marker_path.exists()

    status = daily_report_succeeded(report_date, slot)
    if status is True:
        return True
    if status is False:
        if marker_path.exists():
            print(
                "Ignoring local marker because Supabase has no confirmed Kakao send "
                f"for {report_date} {slot}: {marker_path}"
            )
        return False
    return marker_path.exists()


def daily_report_succeeded(report_date: str, slot: str) -> bool | None:
    try:
        report_rows = supabase_select(
            "report_runs",
            f"select=run_key&report_date=eq.{quote(report_date)}"
            f"&report_slot=eq.{quote(slot)}&limit=1",
        )
        title = f"{DAILY_REPORT_TITLE_PREFIX} {report_date} {slot}"
        send_rows = supabase_select(
            "notification_sends",
            "select=id"
            "&message_type=eq.daily_report"
            f"&title=eq.{quote(title)}"
            "&status=eq.success"
            "&limit=1",
        )
    except RuntimeError as error:
        print(f"Supabase completion check unavailable: {error}")
        return None
    return bool(report_rows) and bool(send_rows)


def supabase_select(table: str, query: str) -> list[dict]:
    url = (
        os.getenv("SUPABASE_URL")
        or os.getenv("PUBLIC_SUPABASE_URL")
        or "https://moszekksbhprhevxdynb.supabase.co"
    ).rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing")

    request = Request(
        f"{url}/rest/v1/{table}?{query}",
        method="GET",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"{table} query failed: {error.code} {detail}") from error
    except URLError as error:
        raise RuntimeError(f"{table} query failed: {error}") from error

    parsed = json.loads(body or "[]")
    if not isinstance(parsed, list):
        raise RuntimeError(f"{table} query returned non-list response")
    return parsed


def scheduled_slot(cron: str) -> str:
    normalized = normalize_cron(cron)
    if normalized in SCHEDULE_SLOT_MAP:
        return SCHEDULE_SLOT_MAP[normalized]

    parts = normalized.split()
    if len(parts) != 5:
        return ""
    hour = parts[1].lstrip("0") or "0"
    return {
        "22": "07",
        "23": "08",
        "4": "13",
        "9": "18",
    }.get(hour, "")


def normalize_cron(cron: str) -> str:
    return " ".join((cron or "").strip().strip('"').strip("'").split())


def is_period_schedule(cron: str) -> bool:
    return scheduled_slot(cron) == PERIOD_SLOT


def mark(marker_arg: str | None) -> None:
    if not marker_arg:
        raise SystemExit("marker path is required")

    marker_path = Path(marker_arg)
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    marker_path.write_text(
        f"completed_at={datetime.now(KST).isoformat(timespec='seconds')}\n",
        encoding="utf-8",
    )
    print(f"Wrote schedule marker: {marker_path}")


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "begin"
    if command == "begin":
        begin()
    elif command == "mark":
        mark(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        raise SystemExit(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
