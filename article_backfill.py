"""Backfill missed article URLs into Supabase without sending notifications."""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from dotenv import load_dotenv

import analyzer
import news_collector
import supabase_store

KST = timezone(timedelta(hours=9))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill exact article URLs into Supabase news_articles.")
    parser.add_argument("urls", nargs="*", help="Article URLs to fetch and persist.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch/classify but do not persist.")
    return parser.parse_args()


def split_urls(values: list[str]) -> list[str]:
    raw_values = values[:]
    env_value = os.getenv("BACKFILL_URLS", "")
    if env_value:
        raw_values.append(env_value)
    urls: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        for token in re.split(r"[\s,]+", str(value or "").strip()):
            if not token.startswith(("http://", "https://")) or token in seen:
                continue
            urls.append(token)
            seen.add(token)
    return urls


def source_name_for_url(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    mapped = getattr(news_collector, "DOMAIN_PRESS_MAP", {}).get(host)
    if mapped:
        return mapped
    return host or "언론사 확인"


def report_window_for_article(pub_date: str) -> tuple[str, dict]:
    parsed = news_collector.parse_pub_date(pub_date) if pub_date else None
    current = parsed.astimezone(KST) if parsed else datetime.now(KST)
    if current.hour < 8:
        report_date = current.date()
        slot = "08"
        start = (current - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        end = current.replace(hour=8, minute=0, second=0, microsecond=0)
        label = "전일 18:00~당일 08:00"
        short_label = "전일 18시 이후"
    elif current.hour < 13:
        report_date = current.date()
        slot = "13"
        start = current.replace(hour=8, minute=0, second=0, microsecond=0)
        end = current.replace(hour=13, minute=0, second=0, microsecond=0)
        label = "당일 08:00~13:00"
        short_label = "오전 08~13시"
    elif current.hour < 18:
        report_date = current.date()
        slot = "18"
        start = current.replace(hour=13, minute=0, second=0, microsecond=0)
        end = current.replace(hour=18, minute=0, second=0, microsecond=0)
        label = "당일 13:00~18:00"
        short_label = "오후 13~18시"
    else:
        report_date = (current + timedelta(days=1)).date()
        slot = "08"
        start = current.replace(hour=18, minute=0, second=0, microsecond=0)
        end = (current + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
        label = "전일 18:00~당일 08:00"
        short_label = "전일 18시 이후"
    return report_date.isoformat(), {
        "slot": slot,
        "label": label,
        "short_label": short_label,
        "start": start.isoformat(),
        "end": end.isoformat(),
    }


def fetch_backfill_article(url: str) -> dict | None:
    html, final_url = news_collector.fetch_article_html(url, timeout=12)
    if not html:
        return None
    link = final_url or url
    title = news_collector.extract_article_title_from_html(html)
    description = news_collector.extract_article_description_from_html(html)
    body = news_collector.extract_article_body_from_html(html)
    published = news_collector.parse_article_date_from_html(html) or news_collector.parse_korean_datetime_from_html(html)
    if not title:
        return None
    text = f"{title} {description} {body}"
    own_mentioned = analyzer.is_own_article({"title": title, "description": description, "content": body})
    return {
        "title": title,
        "link": link,
        "description": description,
        "content": body[:5000],
        "body": body[:5000],
        "pub_date": news_collector.format_pub_date(published) if published else "",
        "source": source_name_for_url(link),
        "keyword": "인카금융서비스" if own_mentioned else "보험",
        "keyword_query": "인카금융서비스" if own_mentioned else "보험",
        "keyword_category": "own" if own_mentioned else news_collector.infer_trade_press_category(text),
        "keyword_strict_query": own_mentioned,
        "portal": "manual_backfill",
    }


def classify_articles(articles: list[dict]) -> list[dict]:
    feedback_index = supabase_store.load_classification_feedback_index()
    supabase_store.apply_classification_feedback_to_articles(articles, feedback_index)
    supabase_store.apply_cached_analysis_to_articles(articles)
    classified: list[dict] = []
    for article in articles:
        clustered, _metrics = analyzer.analyze([article], top_n=1)
        classified.extend(clustered or [article])
    return classified


def main() -> int:
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    load_dotenv()
    args = parse_args()
    dry_run = args.dry_run or os.getenv("BACKFILL_DRY_RUN", "").strip().lower() in {"1", "true", "yes", "y"}
    urls = split_urls(args.urls)
    if not urls:
        print("No backfill URLs provided.")
        return 2

    fetched = []
    for url in urls:
        article = fetch_backfill_article(url)
        if not article:
            print(f"MISS {url}")
            continue
        fetched.append(article)
        print(f"FETCH {article.get('source')} | {article.get('pub_date')} | {article.get('title')}")

    if not fetched:
        print("No articles fetched.")
        return 1

    classified = classify_articles(fetched)
    for article in classified:
        report_date, window = report_window_for_article(article.get("pub_date", ""))
        print(
            "CLASS "
            f"{report_date} {window['slot']} | {article.get('_category')} | {article.get('_tone')} | "
            f"{article.get('source')} | {article.get('title')}"
        )
        if not dry_run:
            supabase_store.save_dashboard_articles(
                [article],
                report_date=report_date,
                window=window,
                metrics={"risk_level": "LOW"},
            )
    print(f"done: fetched={len(fetched)} saved={0 if dry_run else len(classified)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
