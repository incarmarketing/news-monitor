"""Watch for new negative articles that directly mention the company.

This is intentionally separate from the scheduled daily report. The daily report
summarizes a time window; this watcher stays quiet unless a new company-negative
article appears.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

import analyzer
import config
import news_collector
from kakao_report_send import KAKAO_API, refresh_access_token

KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).parent
STATE_DIR = BASE_DIR / ".watch-state"
STATE_PATH = STATE_DIR / "negative_alerts.json"
MAX_SENT_KEYS = 500


def now_kst() -> datetime:
    return datetime.now(KST)


def is_active_time(current: datetime | None = None) -> bool:
    """Return whether the watcher should run now.

    Defaults to weekdays 07:00-18:59 KST. Set NEGATIVE_WATCH_ALWAYS_ON=true to
    monitor every scheduled run.
    """
    if os.getenv("NEGATIVE_WATCH_ALWAYS_ON", "").lower() in {"1", "true", "yes", "y"}:
        return True

    current = current or now_kst()
    if current.weekday() >= 5:
        return False

    start_hour = int(os.getenv("NEGATIVE_WATCH_START_HOUR", "7"))
    end_hour = int(os.getenv("NEGATIVE_WATCH_END_HOUR", "18"))
    return start_hour <= current.hour <= end_hour


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
    raw = article.get("link") or article.get("title", "")
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
    negatives = [
        article
        for article in analyzed
        if article.get("_category") == "own" and article.get("_tone") == "negative"
    ]
    negatives.sort(key=lambda item: item.get("_score", 0), reverse=True)
    return negatives, metrics


def compact(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def build_alert_message(articles: list[dict], metrics: dict, minutes_back: int) -> str:
    current = now_kst().strftime("%Y-%m-%d %H:%M")
    lines = [
        "[부정기사 감지]",
        f"{current} 기준 · 최근 {minutes_back}분",
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


def main() -> None:
    load_dotenv()
    minutes_back = int(os.getenv("NEGATIVE_WATCH_MINUTES", "10"))

    if not is_active_time():
        print("Negative watcher skipped: outside active time.")
        return

    articles = collect_recent_company_news(minutes_back)
    negatives, metrics = find_negative_articles(articles)

    state = load_state()
    sent = set(state.get("sent_keys", []))
    new_negatives = [article for article in negatives if article_key(article) not in sent]

    print(
        f"Negative watcher scanned {len(articles)} company articles; "
        f"negative={len(negatives)}, new={len(new_negatives)}"
    )

    if not new_negatives:
        save_state(state)
        return

    if os.getenv("NEGATIVE_WATCH_DRY_RUN", "").lower() in {"1", "true", "yes", "y"}:
        print("Dry run: Kakao alert was not sent.")
        print(build_alert_message(new_negatives, metrics, minutes_back))
        return

    token = refresh_access_token()
    link = new_negatives[0].get("link") or "https://incarmarketing.github.io/news-monitor/"
    message = build_alert_message(new_negatives, metrics, minutes_back)
    result = send_kakao_alert(token, message, link)
    print("Kakao negative alert result:", result)

    current = now_kst().isoformat()
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
