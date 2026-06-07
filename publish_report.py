"""Prepare the latest HTML briefing for static hosting."""

from __future__ import annotations

import shutil
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import archiver
import ai_briefing
import dashboard_builder
import supabase_store

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
PUBLIC_DIR = BASE_DIR / "public"
REPORTS_DIR = PUBLIC_DIR / "reports"
PERIOD_DIR = BASE_DIR / "period_reports"
ASSETS_DIR = BASE_DIR / "assets"


def latest_report() -> Path:
    files = sorted(LOG_DIR.glob("briefing_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError("No briefing_*.html file found in logs.")
    return files[0]


def render_archive_report(payload: dict) -> tuple[str, str | None, str]:
    timestamp = parse_archive_timestamp(payload.get("timestamp"))
    report_name = f"briefing_{timestamp.strftime('%Y%m%d_%H%M')}.html"
    stable_name = stable_daily_report_name(payload)
    report_md = payload.get("briefing", "")
    articles = payload.get("articles", [])
    metrics = payload.get("metrics", {})
    previous_day = archiver.load_day(timestamp.date() - timedelta(days=1))
    html_body = ai_briefing.build_html_report(
        report_md,
        articles,
        metrics,
        previous_day,
        window_override=payload.get("window") or None,
    )
    return report_name, stable_name, html_body


def parse_archive_timestamp(value: object) -> datetime:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return datetime.now()


def latest_archive_report() -> tuple[str, str | None, str] | None:
    archives = archiver.load_all_archives()
    if not archives:
        return None

    return render_archive_report(archives[-1])


def stable_daily_report_name(payload: dict) -> str | None:
    date_value = str(payload.get("date") or "").strip()
    slot = str(payload.get("window", {}).get("slot") or "").strip().zfill(2)
    if not date_value or slot not in {"08", "13", "18"}:
        return None
    return f"daily/{date_value}-{slot}.html"


def publish() -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    index_target = PUBLIC_DIR / "index.html"
    archive = latest_archive_report()
    try:
        source = latest_report()
    except FileNotFoundError:
        source = None

    if archive:
        publish_all_daily_slots()
        report_name, stable_name, html_body = archive
        archive_target = REPORTS_DIR / report_name
        archive_target.write_text(html_body, encoding="utf-8")
        if stable_name:
            stable_target = REPORTS_DIR / stable_name
            stable_target.parent.mkdir(parents=True, exist_ok=True)
            stable_target.write_text(html_body, encoding="utf-8")
        index_target.write_text(html_body, encoding="utf-8")
        print(f"Published latest archived report: {report_name}")
        print(f"Static index: {index_target}")
        print(f"Static archive: {archive_target}")
        if stable_name:
            print(f"Static daily slot: {stable_target}")
    elif source:
        archive_target = REPORTS_DIR / source.name
        shutil.copy2(source, archive_target)
        shutil.copy2(source, index_target)
        publish_supabase_daily_slots(set())
        print(f"Published latest report: {source.name}")
        print(f"Static index: {index_target}")
        print(f"Static archive: {archive_target}")
    else:
        index_target.write_text(
            """<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>?? ?? ???</title></head>
<body style="font-family:Malgun Gothic,Arial,sans-serif; padding:32px;">
<h1>?? ?? ???</h1>
<p>?? ??? ?? ???? ????. ??/?? ???? ?? ???? ?????.</p>
<ul><li><a href="./weekly.html">?? ???</a></li><li><a href="./monthly.html">?? ???</a></li></ul>
</body></html>
""",
            encoding="utf-8",
        )
        publish_supabase_daily_slots(set())
        print("No daily briefing found. Published fallback index.")

    publish_assets()
    publish_period_report("weekly")
    publish_period_report("monthly")
    publish_monthly_archives()
    repair_daily_notification_history()
    dashboard_builder.publish_dashboard()
    return index_target


def publish_all_daily_slots() -> None:
    published: set[str] = set()
    for payload in archiver.load_all_archives():
        report_name, stable_name, html_body = render_archive_report(payload)
        archive_target = REPORTS_DIR / report_name
        archive_target.write_text(html_body, encoding="utf-8")
        if stable_name:
            stable_target = REPORTS_DIR / stable_name
            stable_target.parent.mkdir(parents=True, exist_ok=True)
            stable_target.write_text(html_body, encoding="utf-8")
            published.add(stable_name)
            print(f"Static daily slot: {stable_target}")
    publish_supabase_daily_slots(published)


def publish_supabase_daily_slots(published: set[str]) -> None:
    for payload in load_supabase_daily_archives():
        stable_name = stable_daily_report_name(payload)
        if not stable_name or stable_name in published:
            continue
        report_name, stable_name, html_body = render_archive_report(payload)
        archive_target = REPORTS_DIR / report_name
        stable_target = REPORTS_DIR / stable_name
        archive_target.write_text(html_body, encoding="utf-8")
        stable_target.parent.mkdir(parents=True, exist_ok=True)
        stable_target.write_text(html_body, encoding="utf-8")
        published.add(stable_name)
        print(f"Static daily slot from Supabase: {stable_target}")


def load_supabase_daily_archives() -> list[dict]:
    try:
        runs = supabase_store.load_report_run_archives()
    except Exception as exc:
        print(f"Supabase report archive source skipped: {exc}")
        return []
    payloads = []
    for run in runs:
        payload = supabase_run_to_archive(run)
        if payload:
            payloads.append(payload)
    return payloads


def supabase_run_to_archive(run: dict) -> dict | None:
    date_value = str(run.get("report_date") or "")[:10]
    slot = str(run.get("report_slot") or "").zfill(2)
    if not date_value or slot not in {"08", "13", "18"}:
        return None
    try:
        rows = supabase_store.load_articles_for_report_slot(date_value, slot)
    except Exception as exc:
        print(f"Supabase report article source skipped for {date_value}-{slot}: {exc}")
        rows = []
    articles = [supabase_article_to_archive_article(row, index) for index, row in enumerate(rows, 1)]
    metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    metrics = ensure_report_metrics(metrics, articles, run)
    briefing = str(run.get("briefing") or "").strip()
    if not briefing:
        briefing = ai_briefing.fallback_report(articles, metrics)
    return {
        "date": date_value,
        "timestamp": run.get("timestamp") or run.get("window_end") or f"{date_value}T{slot}:00:00",
        "window": {
            "slot": slot,
            "label": run.get("window_label") or "",
            "short_label": run.get("window_label") or "",
            "start": run.get("window_start"),
            "end": run.get("window_end"),
        },
        "metrics": metrics,
        "briefing": briefing,
        "articles": articles,
    }


def supabase_article_to_archive_article(row: dict, index: int) -> dict:
    return {
        "title": row.get("title", ""),
        "link": row.get("link", ""),
        "source": row.get("source", ""),
        "keyword": row.get("keyword", ""),
        "description": row.get("summary", ""),
        "_summary": row.get("summary", ""),
        "pub_date": row.get("pub_date_raw") or row.get("pub_date") or "",
        "_report_id": index,
        "_score": row.get("score", 0),
        "_category": row.get("category", "other"),
        "_tone": row.get("tone", "neutral"),
        "_cluster_size": row.get("cluster_size", 1),
    }


def ensure_report_metrics(metrics: dict, articles: list[dict], run: dict) -> dict:
    normalized = dict(metrics or {})
    categories = Counter(article.get("_category", "other") for article in articles)
    tones = Counter(article.get("_tone", "neutral") for article in articles)
    own_by_tone = Counter(
        article.get("_tone", "neutral")
        for article in articles
        if article.get("_category") == "own"
    )
    by_category = dict(normalized.get("by_category") or {})
    for key in ("own", "regulation", "competitor", "industry", "other"):
        by_category.setdefault(key, categories.get(key, 0))
    normalized["by_category"] = by_category
    by_tone = dict(normalized.get("by_tone") or {})
    for key in ("positive", "caution", "neutral", "negative", "exclude"):
        by_tone.setdefault(key, tones.get(key, 0))
    normalized["by_tone"] = by_tone
    current_own_by_tone = dict(normalized.get("own_by_tone") or {})
    for key in ("positive", "caution", "neutral", "negative"):
        current_own_by_tone.setdefault(key, own_by_tone.get(key, 0))
    normalized["own_by_tone"] = current_own_by_tone
    normalized.setdefault("own_negative", current_own_by_tone.get("negative", 0))
    normalized.setdefault("risk_level", run.get("risk_level") or "LOW")
    normalized.setdefault("total_collected", len(articles))
    normalized.setdefault("total_after_cluster", len(articles))
    return normalized


def publish_assets() -> None:
    if not ASSETS_DIR.exists():
        return
    target = PUBLIC_DIR / "assets"
    target.mkdir(parents=True, exist_ok=True)
    for source in ASSETS_DIR.iterdir():
        if source.is_file():
            shutil.copy2(source, target / source.name)


def publish_period_report(period: str) -> None:
    files = sorted(LOG_DIR.glob(f"{period}_report_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    if files:
        source = files[0]
        PERIOD_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, PERIOD_DIR / f"{period}.html")
    else:
        source = PERIOD_DIR / f"{period}.html"

    if not source.exists():
        return

    archive_dir = PUBLIC_DIR / period
    legacy_dir = PUBLIC_DIR / "period_reports"
    archive_dir.mkdir(parents=True, exist_ok=True)
    legacy_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, PUBLIC_DIR / f"{period}.html")
    shutil.copy2(source, legacy_dir / f"{period}.html")
    shutil.copy2(source, archive_dir / source.name)
    print(f"Published {period} report: {source.name}")


def publish_monthly_archives() -> None:
    monthly_dir = PUBLIC_DIR / "monthly"
    legacy_dir = PUBLIC_DIR / "period_reports"
    monthly_dir.mkdir(parents=True, exist_ok=True)
    legacy_dir.mkdir(parents=True, exist_ok=True)
    latest_by_month: dict[str, Path] = {}
    for source in sorted(LOG_DIR.glob("monthly_????_??_report_*.html"), key=lambda p: p.stat().st_mtime):
        match = re.match(r"monthly_(20\d{2})_(\d{2})_report_", source.name)
        if not match:
            continue
        month_key = f"{match.group(1)}-{match.group(2)}"
        latest_by_month[month_key] = source
    for month_key, source in latest_by_month.items():
        shutil.copy2(source, monthly_dir / f"{month_key}.html")
        PERIOD_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, PERIOD_DIR / f"monthly-{month_key}.html")
        shutil.copy2(source, legacy_dir / f"monthly-{month_key}.html")
        print(f"Published monthly archive {month_key}: {source.name}")


def repair_daily_notification_history() -> None:
    try:
        fixed = supabase_store.repair_daily_notification_links()
    except Exception as exc:
        print(f"Daily notification link repair skipped: {exc}")
        return
    if fixed:
        print(f"Repaired daily notification links: {fixed}")


if __name__ == "__main__":
    publish()
