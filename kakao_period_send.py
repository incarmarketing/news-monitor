"""Send weekly or monthly monitoring report links to KakaoTalk."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

from kakao_report_send import DEFAULT_REPORT_URL, refresh_access_token, send_text_to_me

KST = timezone(timedelta(hours=9))


PERIODS = {
    "weekly": {
        "label": "주간",
        "path": "weekly.html",
        "title": "주간 언론 모니터링 보고서",
        "desc": "전주 기사 흐름과 자사·경쟁·규제 이슈를 누적 기준으로 정리했습니다.",
    },
    "monthly": {
        "label": "월간",
        "path": "monthly.html",
        "title": "월간 언론 모니터링 보고서",
        "desc": "전월 언론 동향과 핵심 리스크, 다음 기간 관찰 포인트를 정리했습니다.",
    },
}


def base_url() -> str:
    configured = os.getenv("REPORT_PUBLIC_URL", "").strip() or DEFAULT_REPORT_URL
    return configured.rstrip("/") + "/"


def build_message(period: str) -> tuple[str, str]:
    info = PERIODS[period]
    today = datetime.now(KST).strftime("%Y-%m-%d")
    text = "\n".join(
        [
            f"[AI 언론 모니터링] {info['label']} 보고서",
            today,
            "",
            info["title"],
            info["desc"],
        ]
    )
    return text[:500], base_url() + info["path"]


def main() -> None:
    load_dotenv()
    period = sys.argv[1] if len(sys.argv) > 1 else "weekly"
    if period not in PERIODS:
        raise SystemExit(f"Unknown period: {period}")

    token = refresh_access_token()
    text, link = build_message(period)
    result = send_text_to_me(token, text, link)
    print("Kakao period send result:", result)
    print("Period report link:", link)


if __name__ == "__main__":
    main()
