"""Archive daily monitoring outputs for weekly and monthly reports."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import report_window
import supabase_store

BASE_DIR = Path(__file__).parent
ARCHIVE_DIR = BASE_DIR / "data" / "daily"
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
KST = timezone(timedelta(hours=9))


def today_kst() -> date:
    return datetime.now(KST).date()


def now_kst() -> datetime:
    return datetime.now(KST)


def save_daily(articles: list[dict], briefing: str, metrics: dict) -> Path:
    report_date = today_kst()
    window = report_window.current_window()
    target = ARCHIVE_DIR / f"{report_date.isoformat()}.json"
    payload = {
        "date": report_date.isoformat(),
        "timestamp": now_kst().isoformat(),
        "window": {
            "slot": window["slot"],
            "label": window["label"],
            "short_label": window["short_label"],
            "start": window["start"].isoformat(),
            "end": window["end"].isoformat(),
        },
        "metrics": metrics,
        "briefing": briefing,
        "articles": [lighten(article) for article in articles],
    }
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        supabase_store.save_report_run(payload)
    except Exception as exc:
        print(f"Supabase archive skipped: {exc}")
    return target


def lighten(article: dict) -> dict:
    return {
        "title": article.get("title", ""),
        "link": article.get("link", ""),
        "source": article.get("source", ""),
        "keyword": article.get("keyword", ""),
        "description": article.get("description", "") or article.get("summary", ""),
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
    return load_day(today_kst() - timedelta(days=1))


def load_range(days: int, end_date: date | None = None) -> list[dict]:
    end = end_date or today_kst()
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

    sorted_days = sorted(daily_data, key=lambda x: x["date"])
    daily_volume = [
        {
            "date": d["date"],
            "total": d.get("metrics", {}).get("total_collected", 0),
            "analyzed": d.get("metrics", {}).get("total_after_cluster", 0),
            "own": d.get("metrics", {}).get("by_category", {}).get("own", 0),
            "risk": d.get("metrics", {}).get("risk_level", "LOW"),
            "own_negative": d.get("metrics", {}).get("own_negative", 0),
        }
        for d in sorted_days
    ]
    total_articles = sum(d.get("metrics", {}).get("total_collected", 0) for d in daily_data)
    max_daily_total = max((d["total"] for d in daily_volume), default=0)

    return {
        "period_days": len(daily_data),
        "total_collected": total_articles,
        "total_after_cluster": sum(d.get("metrics", {}).get("total_after_cluster", 0) for d in daily_data),
        "by_category": cats,
        "by_tone": tones,
        "risk_distribution": risk_days,
        "daily_volume": daily_volume,
        "max_daily_total": max_daily_total,
        "avg_daily_collected": round(total_articles / len(daily_data), 1) if daily_data else 0,
        "category_share": {
            key: round((value / total_articles * 100), 1) if total_articles else 0
            for key, value in cats.items()
        },
        "daily_own_negative": [
            {"date": d["date"], "value": d.get("metrics", {}).get("own_negative", 0)}
            for d in sorted_days
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
