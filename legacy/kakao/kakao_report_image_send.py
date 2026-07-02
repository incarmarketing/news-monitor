"""Render the latest HTML report to PNG and send it to KakaoTalk."""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from kakao_report_send import KAKAO_API, DEFAULT_LINK, refresh_access_token

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"
OUT_DIR = BASE_DIR / "out"
OUT_DIR.mkdir(exist_ok=True)


def latest_html_path() -> Path:
    files = sorted(LOG_DIR.glob("briefing_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError("No briefing HTML found.")
    return files[0]


def render_html_to_png(html_path: Path) -> Path:
    output = OUT_DIR / f"{html_path.stem}.png"
    url = html_path.resolve().as_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 900, "height": 1400}, device_scale_factor=1)
        page.goto(url, wait_until="networkidle")
        page.locator(".toolbar").evaluate("el => el.remove()")
        page.screenshot(path=str(output), full_page=True)
        browser.close()

    return output


def upload_image(access_token: str, png_path: Path) -> str:
    with png_path.open("rb") as file:
        response = requests.post(
            f"{KAKAO_API}/v2/api/talk/message/image/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            files={"file": file},
            timeout=30,
        )
    response.raise_for_status()
    return response.json()["infos"]["original"]["url"]


def send_feed_to_me(access_token: str, image_url: str, title: str, description: str) -> dict:
    template = {
        "object_type": "feed",
        "content": {
            "title": title[:100],
            "description": description[:400],
            "image_url": image_url,
            "image_width": 900,
            "image_height": 1400,
            "link": {"web_url": DEFAULT_LINK, "mobile_web_url": DEFAULT_LINK},
        },
        "buttons": [
            {"title": "관련 뉴스 보기", "link": {"web_url": DEFAULT_LINK, "mobile_web_url": DEFAULT_LINK}},
        ],
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
    token = refresh_access_token()
    html_path = latest_html_path()
    png_path = render_html_to_png(html_path)
    image_url = upload_image(token, png_path)
    result = send_feed_to_me(
        token,
        image_url,
        title="AI 언론 브리핑",
        description="최신 일일 언론 모니터링 보고서 이미지입니다.",
    )
    print("Rendered image:", png_path)
    print("Kakao image send result:", result)


if __name__ == "__main__":
    main()
