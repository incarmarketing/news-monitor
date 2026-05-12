"""Prepare the latest HTML briefing for static hosting."""

from __future__ import annotations

import shutil
from pathlib import Path

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
PUBLIC_DIR = BASE_DIR / "public"
REPORTS_DIR = PUBLIC_DIR / "reports"


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

    print(f"Published latest report: {source.name}")
    print(f"Static index: {index_target}")
    print(f"Static archive: {archive_target}")
    return index_target


if __name__ == "__main__":
    publish()
