"""Guard scheduled GitHub Actions runs against missed slots and duplicates."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

KST = timezone(timedelta(hours=9))
STATE_DIR = Path(".run-state")

SCHEDULE_TO_KST_HOUR = {
    "5 23 * * *": "08",
    "15 23 * * *": "08",
    "30 23 * * *": "08",
    "45 23 * * *": "08",
    "5 4 * * *": "13",
    "15 4 * * *": "13",
    "30 4 * * *": "13",
    "45 4 * * *": "13",
    "5 8 * * *": "17",
    "15 8 * * *": "17",
    "30 8 * * *": "17",
    "45 8 * * *": "17",
    "5 9 * * *": "18",
    "15 9 * * *": "18",
    "30 9 * * *": "18",
    "45 9 * * *": "18",
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
        github_output("marker_path", "")
        return

    kst_hour = SCHEDULE_TO_KST_HOUR.get(schedule)
    if not kst_hour:
        github_output("should_run", "false")
        github_output("should_mark", "false")
        github_output("marker_path", "")
        print(f"Unknown schedule cron: {schedule}")
        return

    today = datetime.now(KST).strftime("%Y-%m-%d")
    marker_path = STATE_DIR / f"{today}-{kst_hour}.txt"

    github_output("marker_path", marker_path.as_posix())
    github_output("should_mark", "true")
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
