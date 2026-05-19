"""Prepare the latest HTML briefing for static hosting."""

from __future__ import annotations

import shutil
from pathlib import Path

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


def publish() -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    index_target = PUBLIC_DIR / "index.html"
    try:
        source = latest_report()
    except FileNotFoundError:
        source = None

    if source:
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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI 언론 브리핑</title></head>
<body style="font-family:Malgun Gothic,Arial,sans-serif; padding:32px;">
<h1>AI 언론 브리핑</h1>
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
    archive_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, PUBLIC_DIR / f"{period}.html")
    shutil.copy2(source, archive_dir / source.name)
    print(f"Published {period} report: {source.name}")


if __name__ == "__main__":
    publish()
