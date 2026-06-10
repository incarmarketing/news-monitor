"""Refresh dashboard article data without sending a report."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

import analyzer
import news_collector
import regulator_collector
import supabase_store

KST = timezone(timedelta(hours=9))


def now_kst() -> datetime:
    return datetime.now(KST)


def within_minutes(article: dict, minutes: int) -> bool:
    parsed = news_collector.parse_pub_date(article.get("pub_date", ""))
    if not parsed:
        return False
    return parsed >= datetime.now(timezone.utc) - timedelta(minutes=minutes)


def collect_recent_articles(minutes: int) -> list[dict]:
    rows = news_collector.load_collection_keywords()
    max_keywords = int(os.getenv("DASHBOARD_REFRESH_MAX_KEYWORDS", "0") or "0")
    if max_keywords > 0:
        rows = rows[:max_keywords]

    articles: list[dict] = []
    regulator_articles = regulator_collector.fetch_regulator_releases(days_back=2, max_pages=1)
    for row in rows:
        query = row["query"]
        label = row["keyword"]
        category = row["category"]
        strict = row.get("strict_query", False)
        articles.extend(news_collector.fetch_naver_news(query, label, category, strict))
        articles.extend(news_collector.fetch_google_news(query, label, category, strict))

    articles.extend(news_collector.fetch_trade_press_news())
    articles = news_collector.deduplicate(articles)
    articles = news_collector.apply_relevance_filter(articles)
    articles = news_collector.apply_exclude_filter(articles)
    hours = max(1, (minutes + 59) // 60)
    articles = news_collector.apply_recency_filter(articles, hours)
    return [article for article in articles if within_minutes(article, minutes)] + regulator_articles


def main() -> None:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--minutes", type=int, default=int(os.getenv("DASHBOARD_REFRESH_MINUTES", "5")))
    args = parser.parse_args()

    current = now_kst()
    start = current - timedelta(minutes=args.minutes)
    articles = collect_recent_articles(args.minutes)
    if not articles:
        print(f"Dashboard refresh: no articles in last {args.minutes} minutes.")
        return

    analyzed, metrics = analyzer.analyze(articles, top_n=max(len(articles), 1))
    supabase_store.save_dashboard_articles(
        analyzed,
        report_date=current.date().isoformat(),
        window={
            "slot": "watch",
            "label": f"recent {args.minutes} minutes",
            "short_label": f"{args.minutes}m",
            "start": start.isoformat(),
            "end": current.isoformat(),
        },
        metrics=metrics,
    )
    print(f"Dashboard refresh: saved {len(analyzed)} analyzed articles.")


if __name__ == "__main__":
    main()
