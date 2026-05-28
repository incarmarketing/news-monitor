"""Archive daily monitoring outputs for weekly and monthly reports."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import report_window
import supabase_store

BASE_DIR = Path(__file__).parent
ARCHIVE_DIR = BASE_DIR / "data" / "daily"
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
KST = timezone(timedelta(hours=9))
SLOT_ORDER = {"08": 1, "13": 2, "18": 3}
RISK_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}


def today_kst() -> date:
    return datetime.now(KST).date()


def now_kst() -> datetime:
    return datetime.now(KST)


def save_daily(articles: list[dict], briefing: str, metrics: dict) -> Path:
    report_date = today_kst()
    window = report_window.current_window()
    target = archive_path(report_date, window.get("slot", ""))
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


def archive_path(report_date: date, slot: str = "") -> Path:
    suffix = f"-{slot}" if slot else ""
    return ARCHIVE_DIR / f"{report_date.isoformat()}{suffix}.json"


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


def load_archive(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Skip invalid archive: {path} ({exc})")
        return None


def archive_sort_key(payload: dict) -> tuple[str, int, str]:
    window = payload.get("window", {})
    date_value = payload.get("date", "")
    slot = str(window.get("slot", ""))
    timestamp = payload.get("timestamp", "")
    return (date_value, SLOT_ORDER.get(slot, 0), timestamp)


def archive_key(payload: dict) -> tuple[str, str]:
    window = payload.get("window", {})
    return (payload.get("date", ""), str(window.get("slot", "")))


def is_slot_archive(path: Path) -> bool:
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}-\d{2}\.json$", path.name))


def load_all_archives() -> list[dict]:
    """Load all daily archives, keeping one record per date/slot.

    Legacy files named YYYY-MM-DD.json are still accepted. If both a legacy file
    and a slot-specific file exist for the same date/slot, the slot file wins.
    """
    if not ARCHIVE_DIR.exists():
        return []

    by_key: dict[tuple[str, str], tuple[dict, bool]] = {}
    for path in sorted(ARCHIVE_DIR.glob("*.json")):
        payload = load_archive(path)
        if not payload:
            continue
        key = archive_key(payload)
        slot_file = is_slot_archive(path)
        existing = by_key.get(key)
        if not existing:
            by_key[key] = (payload, slot_file)
            continue
        existing_payload, existing_slot_file = existing
        should_replace = (
            slot_file and not existing_slot_file
        ) or (
            slot_file == existing_slot_file
            and payload.get("timestamp", "") > existing_payload.get("timestamp", "")
        )
        if should_replace:
            by_key[key] = (payload, slot_file)

    return sorted((payload for payload, _ in by_key.values()), key=archive_sort_key)


def load_day_slots(target_date: date) -> list[dict]:
    target = target_date.isoformat()
    return [archive for archive in load_all_archives() if archive.get("date") == target]


def load_day(target_date: date) -> dict | None:
    items = load_day_slots(target_date)
    return items[-1] if items else None


def load_latest() -> dict | None:
    items = load_all_archives()
    return items[-1] if items else None


def load_yesterday() -> dict | None:
    return load_day(today_kst() - timedelta(days=1))


def load_range(days: int, end_date: date | None = None) -> list[dict]:
    end = end_date or today_kst()
    out = []
    for i in range(days):
        out.extend(load_day_slots(end - timedelta(days=i)))
    return sorted(out, key=archive_sort_key)


def load_between(start_date: date, end_date: date) -> list[dict]:
    out = []
    current = start_date
    while current <= end_date:
        out.extend(load_day_slots(current))
        current += timedelta(days=1)
    return sorted(out, key=archive_sort_key)


def aggregate_metrics(daily_data: list[dict]) -> dict:
    cats = {"own": 0, "regulation": 0, "competitor": 0, "industry": 0, "other": 0}
    tones = {"negative": 0, "positive": 0, "neutral": 0}
    risk_days = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    keyword_counts: dict[str, int] = defaultdict(int)
    source_counts: dict[str, int] = defaultdict(int)
    risk_keyword_counts: dict[str, int] = defaultdict(int)
    by_date: dict[str, dict] = defaultdict(lambda: {
        "date": "",
        "total": 0,
        "analyzed": 0,
        "own": 0,
        "regulation": 0,
        "market": 0,
        "negative": 0,
        "own_negative": 0,
        "risk": "LOW",
    })

    for day in daily_data:
        metrics = day.get("metrics", {})
        for key, value in metrics.get("by_category", {}).items():
            cats[key] = cats.get(key, 0) + value
        for key, value in metrics.get("by_tone", {}).items():
            tones[key] = tones.get(key, 0) + value
        risk = metrics.get("risk_level", "LOW")
        date_value = day.get("date", "")
        daily = by_date[date_value]
        daily["date"] = date_value
        daily["total"] += metrics.get("total_collected", 0)
        daily["analyzed"] += metrics.get("total_after_cluster", 0)
        daily["own"] += metrics.get("by_category", {}).get("own", 0)
        daily["regulation"] += metrics.get("by_category", {}).get("regulation", 0)
        daily["market"] += metrics.get("by_category", {}).get("competitor", 0) + metrics.get("by_category", {}).get("industry", 0)
        daily["negative"] += metrics.get("by_tone", {}).get("negative", 0)
        daily["own_negative"] += metrics.get("own_negative", 0)
        if RISK_ORDER.get(risk, 0) > RISK_ORDER.get(daily["risk"], 0):
            daily["risk"] = risk
        for article in day.get("articles", []):
            keyword = str(article.get("keyword") or "").strip()
            source = str(article.get("source") or article.get("press") or "").strip()
            tone = article.get("_tone") or article.get("tone")
            if keyword:
                keyword_counts[keyword] += 1
                if tone == "negative":
                    risk_keyword_counts[keyword] += 1
            if source:
                source_counts[source] += 1

    daily_volume = sorted(by_date.values(), key=lambda row: row["date"])
    for row in daily_volume:
        risk_days[row["risk"]] = risk_days.get(row["risk"], 0) + 1

    total_articles = sum(d.get("metrics", {}).get("total_collected", 0) for d in daily_data)
    max_daily_total = max((d["total"] for d in daily_volume), default=0)
    period_days = len(daily_volume)

    return {
        "period_days": period_days,
        "period_windows": len(daily_data),
        "total_collected": total_articles,
        "total_after_cluster": sum(d.get("metrics", {}).get("total_after_cluster", 0) for d in daily_data),
        "by_category": cats,
        "by_tone": tones,
        "risk_distribution": risk_days,
        "daily_volume": daily_volume,
        "max_daily_total": max_daily_total,
        "avg_daily_collected": round(total_articles / period_days, 1) if period_days else 0,
        "category_share": {
            key: round((value / total_articles * 100), 1) if total_articles else 0
            for key, value in cats.items()
        },
        "top_keywords": [
            {"keyword": key, "count": value}
            for key, value in sorted(keyword_counts.items(), key=lambda item: (-item[1], item[0]))[:12]
        ],
        "top_sources": [
            {"source": key, "count": value}
            for key, value in sorted(source_counts.items(), key=lambda item: (-item[1], item[0]))[:10]
        ],
        "risk_keywords": [
            {"keyword": key, "count": value}
            for key, value in sorted(risk_keyword_counts.items(), key=lambda item: (-item[1], item[0]))[:8]
        ],
        "daily_own_negative": [
            {"date": d["date"], "value": d.get("own_negative", 0)}
            for d in daily_volume
        ],
    }


def collect_top_articles(daily_data: list[dict], limit: int = 20) -> list[dict]:
    articles = []
    for day in daily_data:
        for article in day.get("articles", []):
            copied = dict(article)
            window = day.get("window", {})
            copied["_date"] = f"{day.get('date', '')} {window.get('short_label') or window.get('slot', '')}".strip()
            articles.append(copied)
    articles.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return articles[:limit]
