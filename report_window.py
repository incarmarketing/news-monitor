"""Business-day collection windows for scheduled monitoring reports."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def current_window(now: datetime | None = None) -> dict:
    current = now.astimezone(KST) if now else datetime.now(KST)
    slot = normalize_slot(os.getenv("REPORT_SLOT", ""), current)

    if slot == "08":
        start = (current - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        end = current.replace(hour=8, minute=0, second=0, microsecond=0)
        label = "전일 18:00~당일 08:00"
        short_label = "전일 18시 이후"
        report_label = "아침 브리핑"
    elif slot == "13":
        start = current.replace(hour=8, minute=0, second=0, microsecond=0)
        end = current.replace(hour=13, minute=0, second=0, microsecond=0)
        label = "당일 08:00~13:00"
        short_label = "오전 08~13시"
        report_label = "오전 업데이트"
    else:
        start = (current - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        end = current.replace(hour=18, minute=0, second=0, microsecond=0)
        label = "전일 18:00~당일 18:00"
        short_label = "일일 마감"
        report_label = "일일 마감 보고서"

    return {
        "slot": slot,
        "start": start,
        "end": end,
        "label": label,
        "short_label": short_label,
        "report_label": report_label,
    }


def normalize_slot(value: str, current: datetime) -> str:
    if value in {"08", "13", "18"}:
        return value
    if current.hour < 13:
        return "08"
    if current.hour < 18:
        return "13"
    return "18"
