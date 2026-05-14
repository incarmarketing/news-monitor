"""Prepare the latest HTML briefing for static hosting."""

from __future__ import annotations

import shutil
from pathlib import Path

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
    source = latest_report()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    archive_target = REPORTS_DIR / source.name
    index_target = PUBLIC_DIR / "index.html"

    shutil.copy2(source, archive_target)
    shutil.copy2(source, index_target)
    publish_assets()
    publish_period_report("weekly")
    publish_period_report("monthly")

    print(f"Published latest report: {source.name}")
    print(f"Static index: {index_target}")
    print(f"Static archive: {archive_target}")
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
