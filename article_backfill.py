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

DIRECT_OWN_TERMS = (
    "인카금융서비스",
    "인카금융",
    "최병채",
    "천대권",
    "김선식",
)

DIRECT_NEGATIVE_TERMS = (
    "보험사기",
    "편취",
    "불법",
    "제재",
    "처분",
    "등록 취소",
    "업무 정지",
    "과태료",
    "검사",
    "조사",
    "관리 구멍",
)

DIRECT_CAUTION_TERMS = (
    "자사주",
    "주가",
    "평가손",
    "손실",
    "차손",
    "하락",
    "공시",
    "시장",
    "수익률",
    "금감원",
    "금융감독원",
    "금융위",
    "1200%",
    "수수료",
)

DIRECT_MARKET_CAUTION_TERMS = (
    "자사주",
    "자사주식",
    "주식",
    "주가",
    "평가손",
    "손실",
    "차손",
    "수익률",
    "매수",
    "큰손",
)

DIRECT_POSITIVE_TERMS = (
    "성과",
    "호실적",
    "양호",
    "양호한 실적",
    "회복",
    "급증",
    "최다",
    "1위",
    "돌파",
    "배출",
    "선정",
    "수상",
    "성장",
)


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


def has_direct_own_reference(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title", ""),
            article.get("description", ""),
            article.get("content", ""),
            article.get("body", ""),
            raw.get("title", ""),
            raw.get("description", ""),
            raw.get("content", ""),
            raw.get("body", ""),
        )
    )
    compact = re.sub(r"\s+", "", text)
    return any(term in text or term in compact for term in DIRECT_OWN_TERMS)


def forced_tone_for_direct_own(article: dict) -> str:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    title_text = " ".join(
        str(value or "")
        for value in (
            article.get("title", ""),
            raw.get("title", ""),
        )
    )
    text = " ".join(
        str(value or "")
        for value in (
            article.get("title", ""),
            article.get("description", ""),
            article.get("content", ""),
            article.get("body", ""),
            raw.get("title", ""),
            raw.get("description", ""),
            raw.get("content", ""),
            raw.get("body", ""),
        )
    )
    if any(term in title_text for term in DIRECT_NEGATIVE_TERMS):
        return "negative"
    if any(term in title_text for term in DIRECT_MARKET_CAUTION_TERMS):
        return "caution"
    if any(term in title_text for term in DIRECT_POSITIVE_TERMS):
        return "positive"
    if any(term in text for term in DIRECT_MARKET_CAUTION_TERMS):
        return "caution"
    if any(term in text for term in DIRECT_NEGATIVE_TERMS):
        return "negative"
    if any(term in text for term in DIRECT_CAUTION_TERMS):
        return "caution"
    if any(term in text for term in DIRECT_POSITIVE_TERMS):
        return "positive"
    return article.get("_tone") or article.get("tone") or "neutral"


def is_manual_backfill_article(article: dict) -> bool:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    return article.get("portal") == "manual_backfill" or raw.get("portal") == "manual_backfill"


def force_direct_own_context(article: dict) -> None:
    if not is_manual_backfill_article(article) or not has_direct_own_reference(article):
        return
    tone = forced_tone_for_direct_own(article)
    article["_category"] = "own"
    article["category"] = "own"
    article["_tone"] = tone
    article["tone"] = tone
    article["keyword"] = "인카금융서비스"
    article["keyword_query"] = "인카금융서비스"
    article["keyword_category"] = "own"
    article["keyword_strict_query"] = True
    context = article.get("_ai_context") if isinstance(article.get("_ai_context"), dict) else {}
    try:
        confidence = float(context.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0
    context = {
        **context,
        "category": "own",
        "tone": tone,
        "own_mentioned": True,
        "negative_target": "own" if tone == "negative" else "none",
        "evidence": "URL 백필 원문에서 당사 또는 당사 임원 직접 언급 확인",
        "reason": "정확 URL 재수집은 기존 분석 캐시보다 원문 직접 언급을 우선합니다.",
        "confidence": max(confidence, 0.9),
        "provider": "manual_backfill_direct_rule",
    }
    article["_ai_context"] = context


def classify_articles(articles: list[dict]) -> list[dict]:
    feedback_index = supabase_store.load_classification_feedback_index()
    supabase_store.apply_classification_feedback_to_articles(articles, feedback_index)
    supabase_store.apply_cached_analysis_to_articles(articles)
    classified: list[dict] = []
    for article in articles:
        force_direct_own_context(article)
        clustered, _metrics = analyzer.analyze([article], top_n=1)
        for item in clustered or [article]:
            force_direct_own_context(item)
            classified.append(item)
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
