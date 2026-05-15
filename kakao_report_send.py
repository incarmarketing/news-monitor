"""Send the latest monitoring report summary to KakaoTalk 'message to me'."""

from __future__ import annotations

import json
import os
import re
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
DAILY_DIR = BASE_DIR / "data" / "daily"
LOG_DIR = BASE_DIR / "logs"

KAKAO_OAUTH = "https://kauth.kakao.com/oauth/token"
KAKAO_API = "https://kapi.kakao.com"
DEFAULT_REPORT_URL = "https://incarmarketing.github.io/news-monitor/"


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
    configured = os.getenv("REPORT_PUBLIC_URL", "").strip()
    if configured and not is_local_url(configured):
        return configured
    return DEFAULT_REPORT_URL


def is_local_url(url: str) -> bool:
    lowered = url.lower()
    return (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or "::1" in lowered
        or lowered.startswith("file:")
    )


def build_message(report: dict) -> str:
    metrics = report.get("metrics", {})
    sections = parse_briefing(report.get("briefing", ""))
    own_tone = metrics.get("own_by_tone", {})
    own_total = metrics.get("by_category", {}).get("own", 0)
    risk = metrics.get("risk_level", "-")
    window = report.get("window", {})
    window_label = window.get("short_label") or window.get("label") or "현재 기준"

    header = [
        f"[AI 언론 브리핑] {report.get('date', '')}",
        f"{window_label} · 리스크 {risk}",
        f"당사 {own_total}건",
        (
            f"긍정 {own_tone.get('positive', 0)} · "
            f"중립 {own_tone.get('neutral', 0)} · "
            f"부정 {own_tone.get('negative', metrics.get('own_negative', 0))}"
        ),
    ]

    lines = header + ["", "오늘의 판단", compact(sections["conclusion"], 48)]
    if sections["issues"]:
        lines += ["", "핵심 이슈"]
        lines += [f"- {compact(issue, 38)}" for issue in sections["issues"][:2]]

    return "\n".join(lines)[:360]


def compact(text: str, limit: int) -> str:
    cleaned = re.sub(r"\[[\d,\s]+\]\s*", "", text or "")
    cleaned = cleaned.replace("핵심 이슈", "").strip()
    cleaned = " ".join(cleaned.split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def parse_briefing(briefing: str) -> dict:
    cleaned = briefing.replace("**", "").strip()
    section_map: dict[str, list[str]] = {}
    current = "본문"

    for raw_line in cleaned.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            current = line.lstrip("#").strip()
            section_map.setdefault(current, [])
            continue
        if line.startswith("|") or set(line) <= {"-", "|", " "}:
            continue
        section_map.setdefault(current, []).append(line.strip("- ").strip())

    conclusion = first_text(section_map, ["최종 결론", "오늘의 판단", "본문"])
    issues = section_map.get("핵심 이슈", [])
    if not conclusion:
        conclusion = "특이 리스크 없음. 전체 보고서에서 근거 기사와 지표를 확인하세요."
    return {
        "conclusion": conclusion,
        "issues": [item for item in issues if item],
    }


def first_text(section_map: dict[str, list[str]], names: list[str]) -> str:
    for name in names:
        values = section_map.get(name, [])
        if values:
            return values[0]
    return ""


def send_text_to_me(access_token: str, text: str, link_url: str) -> dict:
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link_url, "mobile_web_url": link_url},
        "button_title": "보고서 보기",
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
