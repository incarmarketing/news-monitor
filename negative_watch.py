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
    save_dashboard_articles,
    save_negative_watch_run,
    save_notification_send,
)

KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).parent
STATE_DIR = BASE_DIR / ".watch-state"
STATE_PATH = STATE_DIR / "negative_alerts.json"
DASHBOARD_REFRESH_STATE_PATH = STATE_DIR / "dashboard_refresh.json"
MAX_SENT_KEYS = 500


def github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as file:
            file.write(f"{name}={value}\n")
    print(f"{name}={value}")


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


def load_dashboard_refresh_state() -> dict:
    STATE_DIR.mkdir(exist_ok=True)
    if not DASHBOARD_REFRESH_STATE_PATH.exists():
        return {}
    try:
        return json.loads(DASHBOARD_REFRESH_STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_dashboard_refresh_state(state: dict) -> None:
    DASHBOARD_REFRESH_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def dashboard_refresh_interval_minutes() -> int:
    value = os.getenv("NEGATIVE_WATCH_DASHBOARD_REFRESH_MINUTES", "15").strip()
    try:
        return max(0, int(value))
    except ValueError:
        return 15


def dashboard_refresh_due(scanned_at: str, *, negative_count: int, new_negative_count: int, status: str) -> bool:
    mode = os.getenv("NEGATIVE_WATCH_DASHBOARD_REFRESH", "throttled").strip().lower()
    if mode in {"0", "false", "no", "never", "off"} or status in {"skipped", "dry_run"}:
        return False

    interval = dashboard_refresh_interval_minutes()
    state = load_dashboard_refresh_state()
    last_refresh = parse_datetime(str(state.get("last_refresh_at", "")))
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)

    interval_due = not last_refresh or (interval > 0 and (current - last_refresh).total_seconds() >= interval * 60)
    should_refresh = mode == "always" or new_negative_count > 0 or status in {"alert_sent", "alert_failed"}
    if not should_refresh and interval > 0:
        should_refresh = interval_due
    if not should_refresh and negative_count > 0:
        should_refresh = interval_due

    if should_refresh:
        save_dashboard_refresh_state(
            {
                "last_refresh_at": scanned_at,
                "status": status,
                "new_negative_count": new_negative_count,
            }
        )
    return should_refresh


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
        if analyzer.is_direct_own_negative_article(article)
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
                "_ai_context": (row.get("raw") or {}).get("_ai_context") or (row.get("raw") or {}).get("ai_context") or {},
            }
        )
    return articles


def merge_negative_candidates(*groups: list[dict]) -> list[dict]:
    seen: set[str] = set()
    merged: list[dict] = []
    for group in groups:
        for article in group:
            if analyzer.is_relief_support_article(article):
                continue
            key = article_key(article)
            if key in seen:
                continue
            seen.add(key)
            merged.append(article)
    return merged


def build_watch_window(scanned_at: str, minutes_back: int) -> dict:
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)
    start = current - timedelta(minutes=max(1, minutes_back))
    return {
        "slot": "watch",
        "label": f"부정기사 감시 최근 {minutes_back}분",
        "start": start.isoformat(),
        "end": current.isoformat(),
    }


def persist_negative_articles(articles: list[dict], metrics: dict, scanned_at: str, minutes_back: int) -> None:
    """Store watch-only detections so the dashboard can show the same articles."""
    if not articles:
        return
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)
    try:
        save_dashboard_articles(
            articles,
            report_date=current.astimezone(KST).date().isoformat(),
            window=build_watch_window(scanned_at, minutes_back),
            metrics={**(metrics or {}), "risk_level": "MEDIUM"},
        )
        print(f"Persisted negative watch articles: {len(articles)}")
    except Exception as error:
        print(f"Negative watch article persistence failed: {error}")
        if os.getenv("NEGATIVE_WATCH_REQUIRE_ARTICLE_PERSIST", "true").lower() in {"1", "true", "yes", "y"}:
            raise


def alert_state_articles(state: dict, limit: int = 30) -> list[dict]:
    """Rehydrate already-sent alert rows so legacy alerts also appear in the dashboard."""
    alerts = state.get("alerts", [])
    if not isinstance(alerts, list):
        return []
    rows: list[dict] = []
    for alert in alerts[-limit:]:
        title = str(alert.get("title") or "").strip()
        link = str(alert.get("link") or "").strip()
        if not title and not link:
            continue
        sent_at = str(alert.get("sent_at") or "").strip()
        rows.append(
            {
                "title": title or "부정기사 감시 알림 기사",
                "link": link,
                "source": alert.get("source", ""),
                "keyword": alert.get("keyword", ""),
                "pub_date": sent_at,
                "_summary": "부정기사 감시 알림으로 발송된 기사입니다. 원문 기준으로 사실관계를 확인합니다.",
                "_category": "own",
                "_tone": "negative",
                "_score": 950,
                "_cluster_size": 1,
                "_watch_source": "alert_state",
            }
        )
    return rows


def compact(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def dashboard_base_url() -> str:
    return (
        os.getenv("NEGATIVE_ALERT_DASHBOARD_URL")
        or os.getenv("DASHBOARD_URL")
        or "https://incarmarketing.github.io/news-monitor/dashboard.html"
    )


def clean_alert_title(value: object, limit: int = 80) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+-\s+[^-]{2,24}$", "", text).strip()
    if not text:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_alert_link(article: dict) -> str:
    """Open the shared dashboard and target the exact article when possible."""
    base = dashboard_base_url()
    split = urlsplit(base)
    params = dict(parse_qsl(split.query, keep_blank_values=True))
    params.update(
        {
            "section": "monitoring",
            "tone": "negative",
            "category": "own",
        }
    )

    title = clean_alert_title(article.get("title", "") or article.get("source", ""))
    if title:
        params["article_title"] = title
    if article.get("article_hash"):
        params["article"] = str(article["article_hash"]).strip()
    if article.get("link") and article.get("link") != "#":
        params["article_link"] = str(article["link"]).strip()

    # Legacy alerts used query=. Keep future alert links from putting article
    # summaries into the dashboard search box.
    params.pop("query", None)
    params.pop("q", None)
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


def mark_alerts_sent(state: dict, sent: set[str], articles: list[dict], sent_at: str) -> None:
    for article in articles:
        key = article_key(article)
        sent.add(key)
        state.setdefault("alerts", []).append(
            {
                "sent_at": sent_at,
                "key": key,
                "title": article.get("title", ""),
                "link": article.get("link", ""),
                "source": article.get("source", ""),
                "keyword": article.get("keyword", ""),
            }
        )
    state["sent_keys"] = list(sent)
    state["alerts"] = state.get("alerts", [])[-MAX_SENT_KEYS:]


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


def finish_watch_run(
    *,
    scanned_at: str,
    minutes_back: int,
    scanned_count: int,
    negative_count: int,
    new_negative_count: int,
    status: str,
    message: str = "",
) -> None:
    record_watch_run(
        scanned_at=scanned_at,
        minutes_back=minutes_back,
        scanned_count=scanned_count,
        negative_count=negative_count,
        new_negative_count=new_negative_count,
        status=status,
        message=message,
    )
    should_refresh = dashboard_refresh_due(
        scanned_at,
        negative_count=negative_count,
        new_negative_count=new_negative_count,
        status=status,
    )
    github_output("scanned_count", str(scanned_count))
    github_output("negative_count", str(negative_count))
    github_output("new_negative_count", str(new_negative_count))
    github_output("watch_status", status)
    github_output("should_refresh_dashboard", "true" if should_refresh else "false")


def main() -> None:
    load_dotenv()
    base_minutes_back = int(os.getenv("NEGATIVE_WATCH_MINUTES", "5"))
    minutes_back = effective_minutes_back(base_minutes_back)
    scanned_at = now_kst().isoformat()
    if minutes_back > base_minutes_back:
        print(f"Negative watcher catch-up window expanded to {minutes_back} minutes.")

    if not is_active_time():
        finish_watch_run(
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
            if analyzer.is_direct_own_negative_article(article)
        ]
    else:
        db_negatives = [article for article in db_negatives if analyzer.is_direct_own_negative_article(article)]
    if db_negatives:
        metrics["own_total"] = max(metrics.get("own_total", 0), len(db_negatives))

    state = load_state()
    sent = set(state.get("sent_keys", []))
    all_negatives = merge_negative_candidates(db_negatives, negatives, alert_state_articles(state))
    persist_negative_articles(all_negatives, metrics, scanned_at, minutes_back)
    new_negatives = [article for article in all_negatives if article_key(article) not in sent]

    print(
        f"Negative watcher scanned {len(articles)} company articles; "
        f"rss_negative={len(negatives)}, db_negative={len(db_negatives)}, new={len(new_negatives)}"
    )

    if not new_negatives:
        finish_watch_run(
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
        finish_watch_run(
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
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=0,
            status="scanned",
            message="duplicate alert already sent",
        )
        return
    state_persisted = False
    try:
        token = refresh_access_token()
        result = send_kakao_alert(token, message, link)
        mark_alerts_sent(state, sent, new_negatives, scanned_at)
        save_state(state)
        state_persisted = True
        save_notification_send(
            message_type="negative_alert",
            title=alert_title,
            body=message,
            link_url=link,
            status="success",
            provider_response=result,
        )
        finish_watch_run(
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
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="alert_failed",
            message=str(error),
        )
        raise

    if not state_persisted:
        mark_alerts_sent(state, sent, new_negatives, scanned_at)
        save_state(state)


if __name__ == "__main__":
    main()
