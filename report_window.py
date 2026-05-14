"""Business-day collection windows for scheduled monitoring reports."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def current_window(now: datetime | None = None) -> dict:
    current = now.astimezone(KST) if now else datetime.now(KST)

    if current.hour < 13:
        start = (current - timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        slot = "08"
        label = f"전일 18:00~{current.strftime('%H:%M')}"
        short_label = "전일 18시 이후"
    elif current.hour < 18:
        start = current.replace(hour=8, minute=0, second=0, microsecond=0)
        slot = "13"
        label = f"당일 08:00~{current.strftime('%H:%M')}"
        short_label = "08시 이후"
    else:
        start = current.replace(hour=13, minute=0, second=0, microsecond=0)
        slot = "18"
        label = f"당일 13:00~{current.strftime('%H:%M')}"
        short_label = "13시 이후"

    return {
        "slot": slot,
        "start": start,
        "end": current,
        "label": label,
        "short_label": short_label,
    }
