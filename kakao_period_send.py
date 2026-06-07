"""Send weekly or monthly monitoring report links to KakaoTalk."""

from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

from kakao_report_send import DEFAULT_REPORT_URL, refresh_access_token, send_text_to_me, verify_public_report_link, with_cache_buster
from supabase_store import save_notification_send

KST = timezone(timedelta(hours=9))


PERIODS = {
    "weekly": {
        "label": "??",
        "path": "weekly.html",
        "title": "?? ?? ???? ???",
        "desc": "?? ?? ??? ???????? ??? ?? ???? ??????.",
    },
    "monthly": {
        "label": "??",
        "path": "monthly.html",
        "title": "?? ?? ???? ???",
        "desc": "?? ?? ??? ?? ???, ?? ?? ?? ???? ??????.",
    },
}


def base_url() -> str:
    configured = os.getenv("REPORT_PUBLIC_URL", "").strip() or DEFAULT_REPORT_URL
    return configured.rstrip("/") + "/"


def normalize_report_month(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", raw):
        raise SystemExit("Monthly report month must use YYYY-MM format.")
    return raw


def period_path(period: str, report_month: str = "") -> str:
    if period == "monthly" and report_month:
        return f"monthly/{report_month}.html"
    return PERIODS[period]["path"]


def build_message(period: str, report_month: str = "") -> tuple[str, str]:
    info = PERIODS[period]
    today = datetime.now(KST).strftime("%Y-%m-%d")
    date_line = f"{report_month} ??" if report_month else today
    text = "\n".join(
        [
            f"[AI ?? ????] {info['label']} ???",
            date_line,
            "",
            info["title"],
            info["desc"],
        ]
    )
    return text[:500], with_cache_buster(base_url() + period_path(period, report_month))


def main() -> None:
    load_dotenv()
    period = sys.argv[1] if len(sys.argv) > 1 else "weekly"
    if period not in PERIODS:
        raise SystemExit(f"Unknown period: {period}")
    report_month = normalize_report_month(sys.argv[2] if len(sys.argv) > 2 else "")

    text, link = build_message(period, report_month)
    title = f"{PERIODS[period]['label']} ?? ???? ???{(' ' + report_month) if report_month else ''}"
    try:
        verify_public_report_link(link, label=title)
        token = refresh_access_token()
        result = send_text_to_me(token, text, link)
        save_notification_send(
            message_type=f"{period}_report",
            title=title,
            body=text,
            link_url=link,
            status="success",
            provider_response=result,
            require_log=True,
        )
        print("Kakao period send result:", result)
        print("Period report link:", link)
    except Exception as error:
        save_notification_send(
            message_type=f"{period}_report",
            title=title,
            body=text,
            link_url=link,
            status="failed",
            error=str(error),
            require_log=False,
        )
        raise


if __name__ == "__main__":
    main()
