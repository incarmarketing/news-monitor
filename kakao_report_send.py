"""Send the latest monitoring report summary to KakaoTalk 'message to me'."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
DAILY_DIR = BASE_DIR / "data" / "daily"
LOG_DIR = BASE_DIR / "logs"

KAKAO_OAUTH = "https://kauth.kakao.com/oauth/token"
KAKAO_API = "https://kapi.kakao.com"
DEFAULT_LINK = "https://search.naver.com/search.naver?query=%EC%9D%B8%EC%B9%B4%EA%B8%88%EC%9C%B5%EC%84%9C%EB%B9%84%EC%8A%A4"


def refresh_access_token() -> str:
    refresh_token = os.environ["KAKAO_REFRESH_TOKEN"].strip()
    if len(refresh_token) < 40 or "여기에" in refresh_token:
        raise RuntimeError("KAKAO_REFRESH_TOKEN에 실제 토큰이 들어있지 않습니다.")

    data = {
        "grant_type": "refresh_token",
        "client_id": os.environ["KAKAO_REST_API_KEY"],
        "refresh_token": refresh_token,
    }
    client_secret = os.getenv("KAKAO_CLIENT_SECRET", "").strip()
    if client_secret:
        data["client_secret"] = client_secret

    response = requests.post(KAKAO_OAUTH, data=data, timeout=15)
    if not response.ok:
        raise RuntimeError(f"Kakao token refresh failed: {response.status_code} {response.text}")
    return response.json()["access_token"]


def load_latest_daily() -> dict:
    today_file = DAILY_DIR / f"{date.today().isoformat()}.json"
    if today_file.exists():
        return json.loads(today_file.read_text(encoding="utf-8"))

    files = sorted(DAILY_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError("No daily report archive found.")
    return json.loads(files[0].read_text(encoding="utf-8"))


def latest_html_path() -> Path | None:
    files = sorted(LOG_DIR.glob("briefing_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def report_link() -> str:
    return os.getenv("REPORT_PUBLIC_URL", "").strip() or DEFAULT_LINK


def build_message(report: dict) -> str:
    metrics = report.get("metrics", {})
    briefing = report.get("briefing", "").replace("##", "").replace("**", "").replace("|", " ")
    lines = [
        line.strip("- ").strip()
        for line in briefing.splitlines()
        if line.strip() and not set(line.strip()) <= {"-", " "}
    ]
    summary = "\n".join(lines[:8])

    header = (
        f"[AI 언론 브리핑] {report.get('date', '')}\n"
        f"리스크 {metrics.get('risk_level', '-')} "
        f"· 자사 {metrics.get('by_category', {}).get('own', 0)}건 "
        f"· 자사부정 {metrics.get('own_negative', 0)}건"
    )
    if os.getenv("REPORT_PUBLIC_URL", "").strip():
        footer = "\n\n아래 버튼에서 모바일 보고서를 바로 열 수 있습니다."
    else:
        footer = "\n\n전체 HTML 보고서는 PC의 logs 폴더에 저장되었습니다."
    return (header + "\n\n" + summary + footer)[:950]


def send_text_to_me(access_token: str, text: str, link_url: str) -> dict:
    has_public_report = bool(os.getenv("REPORT_PUBLIC_URL", "").strip())
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link_url, "mobile_web_url": link_url},
        "button_title": "보고서 보기" if has_public_report else "관련 뉴스 보기",
    }
    response = requests.post(
        f"{KAKAO_API}/v2/api/talk/memo/default/send",
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def main() -> None:
    load_dotenv()
    report = load_latest_daily()
    token = refresh_access_token()
    link = report_link()
    result = send_text_to_me(token, build_message(report), link)
    print("Kakao send result:", result)
    print("Report link:", link)
    html_path = latest_html_path()
    if html_path:
        print("Latest HTML:", html_path)


if __name__ == "__main__":
    main()
