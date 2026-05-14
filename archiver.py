"""Archive daily monitoring outputs for weekly and monthly reports."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent
ARCHIVE_DIR = BASE_DIR / "data" / "daily"
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)


def save_daily(articles: list[dict], briefing: str, metrics: dict) -> Path:
    target = ARCHIVE_DIR / f"{date.today().isoformat()}.json"
    payload = {
        "date": date.today().isoformat(),
        "timestamp": datetime.now().isoformat(),
        "metrics": metrics,
        "briefing": briefing,
        "articles": [lighten(article) for article in articles],
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def lighten(article: dict) -> dict:
    return {
        "title": article.get("title", ""),
        "link": article.get("link", ""),
        "source": article.get("source", ""),
        "keyword": article.get("keyword", ""),
        "pub_date": article.get("pub_date", ""),
        "_score": article.get("_score", 0),
        "_category": article.get("_category", "other"),
        "_tone": article.get("_tone", "neutral"),
        "_cluster_size": article.get("_cluster_size", 1),
    }


def load_day(target_date: date) -> dict | None:
    target = ARCHIVE_DIR / f"{target_date.isoformat()}.json"
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def load_yesterday() -> dict | None:
    return load_day(date.today() - timedelta(days=1))


def load_range(days: int, end_date: date | None = None) -> list[dict]:
    end = end_date or date.today()
    out = []
    for i in range(days):
        item = load_day(end - timedelta(days=i))
        if item:
            out.append(item)
    return out


def load_between(start_date: date, end_date: date) -> list[dict]:
    out = []
    current = start_date
    while current <= end_date:
        item = load_day(current)
        if item:
            out.append(item)
        current += timedelta(days=1)
    return out


def aggregate_metrics(daily_data: list[dict]) -> dict:
    cats = {"own": 0, "regulation": 0, "competitor": 0, "industry": 0, "other": 0}
    tones = {"negative": 0, "positive": 0, "neutral": 0}
    risk_days = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}

    for day in daily_data:
        metrics = day.get("metrics", {})
        for key, value in metrics.get("by_category", {}).items():
            cats[key] = cats.get(key, 0) + value
        for key, value in metrics.get("by_tone", {}).items():
            tones[key] = tones.get(key, 0) + value
        risk = metrics.get("risk_level", "LOW")
        risk_days[risk] = risk_days.get(risk, 0) + 1

    return {
        "period_days": len(daily_data),
        "total_collected": sum(d.get("metrics", {}).get("total_collected", 0) for d in daily_data),
        "total_after_cluster": sum(d.get("metrics", {}).get("total_after_cluster", 0) for d in daily_data),
        "by_category": cats,
        "by_tone": tones,
        "risk_distribution": risk_days,
        "daily_own_negative": [
            {"date": d["date"], "value": d.get("metrics", {}).get("own_negative", 0)}
            for d in sorted(daily_data, key=lambda x: x["date"])
        ],
    }


def collect_top_articles(daily_data: list[dict], limit: int = 20) -> list[dict]:
    articles = []
    for day in daily_data:
        for article in day.get("articles", []):
            copied = dict(article)
            copied["_date"] = day.get("date", "")
            articles.append(copied)
    articles.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return articles[:limit]
