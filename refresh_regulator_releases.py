"""Backfill official FSS/FSC releases into the dashboard database."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

import analyzer
import regulator_collector
import supabase_store

KST = timezone(timedelta(hours=9))


def main() -> None:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    load_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=45, help="Official release archive lookback window.")
    parser.add_argument("--pages", type=int, default=10, help="Maximum list pages per regulator.")
    args = parser.parse_args()

    current = datetime.now(KST)
    start = current - timedelta(days=args.days)
    releases = regulator_collector.fetch_regulator_releases(days_back=args.days, max_pages=args.pages)
    if not releases:
        print(f"Regulator refresh: no relevant official releases in archive window ({args.days} days).")
        return

    analyzed, metrics = analyzer.analyze(releases, top_n=max(len(releases), 1))
    supabase_store.save_dashboard_articles(
        analyzed,
        report_date=current.date().isoformat(),
        window={
            "slot": "regulator",
            "label": f"official regulator releases archive ({args.days} days)",
            "short_label": "regulator",
            "start": start.isoformat(),
            "end": current.isoformat(),
        },
        metrics=metrics,
    )
    print(f"Regulator refresh: saved {len(analyzed)} / collected {len(releases)} official releases.")


if __name__ == "__main__":
    main()
