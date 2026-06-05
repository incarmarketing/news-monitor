"""Watch for new negative articles that directly mention the company.

This is intentionally separate from the scheduled daily report. The daily report
summarizes a time window; this watcher stays quiet unless a new company-negative
article appears.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from dotenv import load_dotenv

import analyzer
import config
import news_collector
from kakao_report_send import KAKAO_API, refresh_access_token
from supabase_store import (
    apply_classification_feedback_to_articles,
    load_latest_negative_watch_run,
    load_recent_negative_articles,
    notification_already_sent,
    save_negative_watch_run,
    save_notification_send,
)

KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).parent
STATE_DIR = BASE_DIR / ".watch-state"
STATE_PATH = STATE_DIR / "negative_alerts.json"
MAX_SENT_KEYS = 500


def now_kst() -> datetime:
    return datetime.now(KST)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except ValueError:
        return None


def effective_minutes_back(default_minutes: int, current: datetime | None = None) -> int:
    current = current or now_kst()
    max_catchup = max(default_minutes, int(os.getenv("NEGATIVE_WATCH_MAX_CATCHUP_MINUTES", "1440")))
    try:
        latest = load_latest_negative_watch_run()
    except Exception as error:
        print("Negative watch latest-run lookup skipped:", error)
        return default_minutes

    latest_at = parse_datetime(str(latest.get("scanned_at", "")) if latest else "")
    if not latest_at:
        return default_minutes

    elapsed_minutes = math.ceil((current.astimezone(timezone.utc) - latest_at).total_seconds() / 60) + 1
    if elapsed_minutes <= default_minutes:
        return default_minutes
    return min(max(default_minutes, elapsed_minutes), max_catchup)


def is_active_time(current: datetime | None = None) -> bool:
    """Return whether the watcher should run now.

    Defaults to 24/7. Set NEGATIVE_WATCH_DAYS=weekdays and/or
    NEGATIVE_WATCH_START_HOUR / NEGATIVE_WATCH_END_HOUR to narrow the window.
    """
    if os.getenv("NEGATIVE_WATCH_ALWAYS_ON", "").lower() in {"1", "true", "yes", "y"}:
        return True

    current = current or now_kst()
    days = os.getenv("NEGATIVE_WATCH_DAYS", "all").lower()
    if days in {"weekday", "weekdays", "business"} and current.weekday() >= 5:
        return False

    start_hour = int(os.getenv("NEGATIVE_WATCH_START_HOUR", "0"))
    end_hour = int(os.getenv("NEGATIVE_WATCH_END_HOUR", "23"))
    if start_hour <= end_hour:
        return start_hour <= current.hour <= end_hour
    return current.hour >= start_hour or current.hour <= end_hour


def load_state() -> dict:
    STATE_DIR.mkdir(exist_ok=True)
    if not STATE_PATH.exists():
        return {"sent_keys": [], "alerts": []}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"sent_keys": [], "alerts": []}


def save_state(state: dict) -> None:
    sent_keys = state.get("sent_keys", [])
    state["sent_keys"] = sent_keys[-MAX_SENT_KEYS:]
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def article_key(article: dict) -> str:
    raw = article.get("link") or article.get("article_hash") or article.get("title", "")
    normalized = re.sub(r"\s+", " ", raw).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]


def collect_recent_company_news(minutes_back: int) -> list[dict]:
    articles: list[dict] = []
    for keyword in analyzer.OWN_NAMES:
        articles.extend(news_collector.fetch_naver_news(keyword))
        articles.extend(news_collector.fetch_google_news(keyword))

    articles = news_collector.deduplicate(articles)
    articles = news_collector.apply_exclude_filter(articles)
    articles = news_collector.apply_recency_filter(articles, max(1, (minutes_back + 59) // 60))
    articles = [article for article in articles if is_within_minutes(article, minutes_back)]
    return articles


def is_within_minutes(article: dict, minutes_back: int) -> bool:
    parsed = news_collector.parse_pub_date(article.get("pub_date", ""))
    if not parsed:
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes_back)
    return parsed >= cutoff


def find_negative_articles(articles: list[dict]) -> tuple[list[dict], dict]:
    analyzed, metrics = analyzer.analyze(articles, top_n=max(len(articles), 1))
    if apply_classification_feedback_to_articles(analyzed):
        metrics = analyzer.build_metrics(analyzed, analyzed)
    negatives = [
        article
        for article in analyzed
        if article.get("_category") == "own" and article.get("_tone") == "negative"
    ]
    negatives.sort(key=lambda item: item.get("_score", 0), reverse=True)
    return negatives, metrics


def collect_recent_db_negatives(minutes_back: int) -> list[dict]:
    lookback = max(minutes_back, int(os.getenv("NEGATIVE_WATCH_DB_LOOKBACK_MINUTES", "30")))
    rows = load_recent_negative_articles(lookback)
    articles = []
    for row in rows:
        articles.append(
            {
                "article_hash": row.get("article_hash", ""),
                "title": row.get("title", ""),
                "link": row.get("link", ""),
                "description": row.get("summary", "") or row.get("raw", {}).get("description", ""),
                "summary": row.get("summary", ""),
                "source": row.get("source", ""),
                "keyword": row.get("keyword", ""),
                "pub_date": row.get("pub_date_raw") or row.get("pub_date", ""),
                "created_at": row.get("created_at", ""),
                "_category": row.get("category", "own"),
                "_tone": row.get("tone", "negative"),
                "_score": row.get("score", 0),
                "_cluster_size": row.get("cluster_size", 1),
                "_watch_source": "db",
            }
        )
    return articles


def merge_negative_candidates(*groups: list[dict]) -> list[dict]:
    seen: set[str] = set()
    merged: list[dict] = []
    for group in groups:
        for article in group:
            key = article_key(article)
            if key in seen:
                continue
            seen.add(key)
            merged.append(article)
    return merged


def compact(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def dashboard_base_url() -> str:
    return (
        os.getenv("NEGATIVE_ALERT_DASHBOARD_URL")
        or os.getenv("DASHBOARD_URL")
        or "https://incarmarketing.github.io/news-monitor/dashboard.html"
    )


def build_alert_link(article: dict) -> str:
    """Open the shared dashboard instead of an article domain that Kakao may block."""
    base = dashboard_base_url()
    split = urlsplit(base)
    params = dict(parse_qsl(split.query, keep_blank_values=True))
    params.update(
        {
            "section": "monitoring",
            "query": compact(article.get("title", "") or article.get("source", ""), 90),
        }
    )
    if article.get("article_hash"):
        params["article"] = article["article_hash"]
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(params), split.fragment))


def build_alert_message(articles: list[dict], metrics: dict, minutes_back: int, db_count: int = 0) -> str:
    current = now_kst().strftime("%Y-%m-%d %H:%M")
    scope = f"최근 {minutes_back}분"
    if db_count:
        scope += f" · DB 신규 {db_count}건 포함"
    lines = [
        "[부정기사 감지]",
        f"{current} 기준 · {scope}",
        f"당사 부정 {len(articles)}건 / 당사 언급 {metrics.get('own_total', 0)}건",
        "",
        "확인 필요 기사",
    ]
    for idx, article in enumerate(articles[:3], 1):
        source = (article.get("source") or "").upper()
        lines.append(f"{idx}. {compact(article.get('title', ''), 46)}")
        if source:
            lines.append(f"   출처 {source} · 키워드 {article.get('keyword', '')}")
    return "\n".join(lines)[:900]


def send_kakao_alert(access_token: str, text: str, link_url: str) -> dict:
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link_url, "mobile_web_url": link_url},
        "button_title": "기사 확인",
    }
    response = requests.post(
        f"{KAKAO_API}/v2/api/talk/memo/default/send",
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def record_watch_run(
    *,
    scanned_at: str,
    minutes_back: int,
    scanned_count: int,
    negative_count: int,
    new_negative_count: int,
    status: str,
    message: str = "",
) -> None:
    try:
        save_negative_watch_run(
            run_key=f"negative-watch-{scanned_at[:16]}",
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=scanned_count,
            negative_count=negative_count,
            new_negative_count=new_negative_count,
            status=status,
            message=message,
        )
    except Exception as error:
        print("Negative watch Supabase log failed:", error)
        if os.getenv("NEGATIVE_WATCH_REQUIRE_DB_LOG", "").lower() in {"1", "true", "yes", "y"}:
            raise


def main() -> None:
    load_dotenv()
    base_minutes_back = int(os.getenv("NEGATIVE_WATCH_MINUTES", "5"))
    minutes_back = effective_minutes_back(base_minutes_back)
    scanned_at = now_kst().isoformat()
    if minutes_back > base_minutes_back:
        print(f"Negative watcher catch-up window expanded to {minutes_back} minutes.")

    if not is_active_time():
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=0,
            negative_count=0,
            new_negative_count=0,
            status="skipped",
            message="outside active time",
        )
        print("Negative watcher skipped: outside active time.")
        return

    articles = collect_recent_company_news(minutes_back)
    negatives, metrics = find_negative_articles(articles)
    db_negatives = collect_recent_db_negatives(minutes_back)
    if apply_classification_feedback_to_articles(db_negatives):
        db_negatives = [
            article
            for article in db_negatives
            if article.get("_category") == "own" and article.get("_tone") == "negative"
        ]
    if db_negatives:
        metrics["own_total"] = max(metrics.get("own_total", 0), len(db_negatives))

    state = load_state()
    sent = set(state.get("sent_keys", []))
    all_negatives = merge_negative_candidates(db_negatives, negatives)
    new_negatives = [article for article in all_negatives if article_key(article) not in sent]

    print(
        f"Negative watcher scanned {len(articles)} company articles; "
        f"rss_negative={len(negatives)}, db_negative={len(db_negatives)}, new={len(new_negatives)}"
    )

    if not new_negatives:
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=0,
            status="scanned",
            message="no new negative article",
        )
        save_state(state)
        return

    if os.getenv("NEGATIVE_WATCH_DRY_RUN", "").lower() in {"1", "true", "yes", "y"}:
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="dry_run",
            message="dry run",
        )
        print("Dry run: Kakao alert was not sent.")
        print(build_alert_message(new_negatives, metrics, minutes_back, len(db_negatives)))
        return

    link = build_alert_link(new_negatives[0])
    message = build_alert_message(new_negatives, metrics, minutes_back, len(db_negatives))
    alert_title = f"부정기사 감지 {article_key(new_negatives[0])}"
    if notification_already_sent("negative_alert", alert_title):
        print(f"Negative alert already sent: {alert_title}")
        for article in new_negatives:
            sent.add(article_key(article))
        state["sent_keys"] = list(sent)
        save_state(state)
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=0,
            status="scanned",
            message="duplicate alert already sent",
        )
        return
    try:
        token = refresh_access_token()
        result = send_kakao_alert(token, message, link)
        save_notification_send(
            message_type="negative_alert",
            title=alert_title,
            body=message,
            link_url=link,
            status="success",
            provider_response=result,
        )
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="alert_sent",
            message=f"{len(new_negatives)} new negative article(s)",
        )
        print("Kakao negative alert result:", result)
    except Exception as error:
        save_notification_send(
            message_type="negative_alert",
            title=alert_title,
            body=message,
            link_url=link,
            status="failed",
            error=str(error),
        )
        record_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="alert_failed",
            message=str(error),
        )
        raise

    current = scanned_at
    for article in new_negatives:
        key = article_key(article)
        sent.add(key)
        state.setdefault("alerts", []).append(
            {
                "sent_at": current,
                "key": key,
                "title": article.get("title", ""),
                "link": article.get("link", ""),
                "source": article.get("source", ""),
                "keyword": article.get("keyword", ""),
            }
        )
    state["sent_keys"] = list(sent)
    state["alerts"] = state.get("alerts", [])[-MAX_SENT_KEYS:]
    save_state(state)


if __name__ == "__main__":
    main()
