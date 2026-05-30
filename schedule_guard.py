"""Guard scheduled GitHub Actions runs against missed slots and duplicates."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

KST = timezone(timedelta(hours=9))
STATE_DIR = Path(".run-state")
ACTIVE_KST_HOURS = {"07", "08", "13", "18"}
SCHEDULE_SLOT_MAP = {
    "*/5 22 * * *": "07",
    "*/5 23 * * *": "08",
    "*/5 4 * * *": "13",
    "*/5 9 * * *": "18",
}


def github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as file:
            file.write(f"{name}={value}\n")
    print(f"{name}={value}")


def begin() -> None:
    event_name = os.getenv("GITHUB_EVENT_NAME", "")
    if event_name != "schedule":
        manual_slot = os.getenv("MANUAL_REPORT_SLOT", "").strip()
        is_slot_dispatch = manual_slot in {"08", "13", "18"}
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
            if marker.exists() and not os.getenv("FORCE_KAKAO_SEND"):
                should_run = "false"
                print(f"Already completed manually dispatched slot: {marker}")
        github_output("should_run", should_run)
        github_output("should_mark", should_mark)
        github_output("should_period", "false")
        github_output("kst_hour", manual_slot)
        github_output("marker_path", marker_path)
        return

    now = datetime.now(KST)
    intended_hour = scheduled_slot(os.getenv("SCHEDULE_CRON", ""))
    kst_hour = intended_hour or now.strftime("%H")
    if kst_hour not in ACTIVE_KST_HOURS:
        github_output("should_run", "false")
        github_output("should_mark", "false")
        github_output("should_period", "false")
        github_output("kst_hour", "")
        github_output("marker_path", "")
        print(f"Scheduled watcher skipped: current KST hour {kst_hour} is outside active windows.")
        return

    today = now.strftime("%Y-%m-%d")
    weekday = now.isoweekday()
    day = now.day
    marker_path = STATE_DIR / f"{today}-{kst_hour}.txt"

    github_output("kst_hour", kst_hour)
    github_output("should_period", "true" if kst_hour == "07" else "false")
    github_output("marker_path", marker_path.as_posix())
    github_output("should_mark", "true")
    if kst_hour == "07" and weekday != 1 and day != 1:
        github_output("should_run", "false")
        print("Period report slot skipped: not Monday or first day of month.")
        return
    if marker_path.exists():
        github_output("should_run", "false")
        print(f"Already completed scheduled slot: {marker_path}")
    else:
        github_output("should_run", "true")
        print(f"Scheduled slot is open: {marker_path}")


def scheduled_slot(cron: str) -> str:
    return SCHEDULE_SLOT_MAP.get(" ".join((cron or "").split()), "")


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
