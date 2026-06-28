"""Re-sync archived daily briefing JSON files into Supabase.

This is a repair path for cases where the GitHub archive was committed but the
Supabase article table did not receive the same analyzed records.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import supabase_store

BASE_DIR = Path(__file__).parent
ARCHIVE_DIR = BASE_DIR / "data" / "daily"


def parse_day(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def archive_paths(*, target_date: date | None, slot: str, days: int) -> list[Path]:
    if target_date:
        suffix = f"-{slot}" if slot else ""
        path = ARCHIVE_DIR / f"{target_date.isoformat()}{suffix}.json"
        return [path] if path.exists() else []

    cutoff = date.today() - timedelta(days=max(0, days - 1))
    paths: list[Path] = []
    for path in sorted(ARCHIVE_DIR.glob("*.json")):
        stem = path.stem
        day_text = stem[:10]
        try:
            day = parse_day(day_text)
        except ValueError:
            continue
        if day >= cutoff:
            paths.append(path)
    return paths


def sync_file(path: Path) -> bool:
    payload = json.loads(path.read_text(encoding="utf-8"))
    articles = payload.get("articles") if isinstance(payload, dict) else None
    if not isinstance(articles, list) or not articles:
        print(f"skip {path.name}: no articles")
        return False
    supabase_store.save_report_run(payload)
    print(f"synced {path.name}: {len(articles)} articles")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Specific report date, YYYY-MM-DD")
    parser.add_argument("--slot", choices=["", "07", "08", "13", "18"], default="")
    parser.add_argument("--days", type=int, default=14, help="Recent archive window when --date is omitted")
    parser.add_argument("--strict", action="store_true", help="Fail on the first sync error")
    args = parser.parse_args()

    if not supabase_store.is_enabled():
        raise SystemExit("Supabase write credentials are not configured.")

    target_date = parse_day(args.date) if args.date else None
    paths = archive_paths(target_date=target_date, slot=args.slot, days=args.days)
    if not paths:
        raise SystemExit("No matching archive files found.")

    synced = 0
    failed = 0
    for path in paths:
        try:
            if sync_file(path):
                synced += 1
        except Exception as exc:
            failed += 1
            print(f"failed {path.name}: {exc}")
            if args.strict:
                raise

    print(f"done: synced={synced} failed={failed}")
    if failed and args.strict:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
