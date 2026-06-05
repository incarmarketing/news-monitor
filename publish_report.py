"""Prepare the latest HTML briefing for static hosting."""

from __future__ import annotations

import shutil
from datetime import datetime, timedelta
from pathlib import Path

import archiver
import ai_briefing
import dashboard_builder

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
    timestamp = datetime.fromisoformat(payload["timestamp"])
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
        print(f"Published latest report: {source.name}")
        print(f"Static index: {index_target}")
        print(f"Static archive: {archive_target}")
    else:
        index_target.write_text(
            """<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>언론 동향 보고서</title></head>
<body style="font-family:Malgun Gothic,Arial,sans-serif; padding:32px;">
<h1>언론 동향 보고서</h1>
<p>현재 배포된 일일 보고서가 없습니다. 주간/월간 보고서는 아래 링크에서 확인하세요.</p>
<ul><li><a href="./weekly.html">주간 보고서</a></li><li><a href="./monthly.html">월간 보고서</a></li></ul>
</body></html>
""",
            encoding="utf-8",
        )
        print("No daily briefing found. Published fallback index.")

    publish_assets()
    publish_period_report("weekly")
    publish_period_report("monthly")
    dashboard_builder.publish_dashboard()
    return index_target


def publish_all_daily_slots() -> None:
    for payload in archiver.load_all_archives():
        report_name, stable_name, html_body = render_archive_report(payload)
        archive_target = REPORTS_DIR / report_name
        archive_target.write_text(html_body, encoding="utf-8")
        if stable_name:
            stable_target = REPORTS_DIR / stable_name
            stable_target.parent.mkdir(parents=True, exist_ok=True)
            stable_target.write_text(html_body, encoding="utf-8")
            print(f"Static daily slot: {stable_target}")


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


if __name__ == "__main__":
    publish()
