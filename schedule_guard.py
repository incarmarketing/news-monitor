"""Guard scheduled GitHub Actions runs against missed slots and duplicates."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

KST = timezone(timedelta(hours=9))
STATE_DIR = Path(".run-state")

SCHEDULE_TO_KST_HOUR = {
    "0 22 * * *": "07",
    "10 22 * * *": "07",
    "20 22 * * *": "07",
    "30 22 * * *": "07",
    "5 23 * * *": "08",
    "15 23 * * *": "08",
    "5 4 * * *": "13",
    "15 4 * * *": "13",
    "5 9 * * *": "18",
    "15 9 * * *": "18",
}


def github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as file:
            file.write(f"{name}={value}\n")
    print(f"{name}={value}")


def begin() -> None:
    event_name = os.getenv("GITHUB_EVENT_NAME", "")
    schedule = os.getenv("SCHEDULE_CRON", "").strip()

    if event_name != "schedule":
        github_output("should_run", "true")
        github_output("should_mark", "false")
        github_output("should_period", "false")
        github_output("kst_hour", "manual")
        github_output("marker_path", "")
        return

    kst_hour = SCHEDULE_TO_KST_HOUR.get(schedule)
    if not kst_hour:
        github_output("should_run", "false")
        github_output("should_mark", "false")
        github_output("should_period", "false")
        github_output("kst_hour", "")
        github_output("marker_path", "")
        print(f"Unknown schedule cron: {schedule}")
        return

    today = datetime.now(KST).strftime("%Y-%m-%d")
    current_hour = datetime.now(KST).strftime("%H")
    weekday = datetime.now(KST).isoweekday()
    day = datetime.now(KST).day
    marker_path = STATE_DIR / f"{today}-{kst_hour}.txt"

    github_output("kst_hour", kst_hour)
    github_output("should_period", "true" if kst_hour == "07" else "false")
    github_output("marker_path", marker_path.as_posix())
    github_output("should_mark", "true")
    if current_hour != kst_hour:
        github_output("should_run", "false")
        print(f"Scheduled slot skipped: cron hour {kst_hour}, current KST hour {current_hour}.")
        return
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
