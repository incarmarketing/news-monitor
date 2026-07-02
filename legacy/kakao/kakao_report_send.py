"""Send the latest monitoring report summary to KakaoTalk 'message to me'."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import requests
from dotenv import load_dotenv
import archiver
import config
from supabase_store import notification_already_sent, save_notification_send

BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "logs"

KAKAO_OAUTH = "https://kauth.kakao.com/oauth/token"
KAKAO_API = "https://kapi.kakao.com"
DEFAULT_REPORT_URL = "https://incarmarketing.github.io/news-monitor/"
KST = timezone(timedelta(hours=9))


class KakaoTokenError(RuntimeError):
    """Raised when Kakao OAuth refresh token cannot be used."""


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
        detail = response.text
        if response.status_code == 400 and "invalid_grant" in detail:
            raise KakaoTokenError(
                "Kakao refresh token expired_or_invalid. "
                "KAKAO_REFRESH_TOKEN을 다시 발급해 GitHub Secrets에 갱신해야 합니다."
            )
        raise KakaoTokenError(f"Kakao token refresh failed: {response.status_code} {detail}")
    payload = response.json()
    if payload.get("refresh_token"):
        print(
            "::warning::Kakao issued a new refresh token. "
            "GitHub Secrets의 KAKAO_REFRESH_TOKEN 자동 갱신은 지원되지 않으므로 "
            "다음 토큰 만료 전에 재발급/갱신 절차를 점검하세요."
        )
    return payload["access_token"]


def check_kakao_token() -> None:
    load_dotenv()
    token = refresh_access_token()
    if not token:
        raise KakaoTokenError("Kakao access token refresh returned an empty token.")
    print("Kakao token preflight OK.")


def load_latest_daily() -> dict:
    slot = os.getenv("REPORT_SLOT", "").strip()
    if slot in {"08", "13", "18"}:
        report = load_daily_for_slot(slot)
        if report:
            return report
    latest = archiver.load_latest()
    if not latest:
        raise FileNotFoundError("No daily report archive found.")
    return latest


def load_daily_for_slot(slot: str) -> dict | None:
    today = archiver.today_kst()
    for report in archiver.load_day_slots(today):
        window = report.get("window", {})
        if str(window.get("slot", "")).zfill(2) == slot:
            return report
    return None


def latest_html_path() -> Path | None:
    files = sorted(LOG_DIR.glob("briefing_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def report_link(report: dict | None = None) -> str:
    configured = os.getenv("REPORT_PUBLIC_URL", "").strip()
    base_url = configured if configured and not is_local_url(configured) else DEFAULT_REPORT_URL
    slot_path = daily_slot_report_path(report or {})
    if slot_path:
        return with_cache_buster(join_public_url(base_url, slot_path))
    return with_cache_buster(base_url)


def daily_slot_report_path(report: dict) -> str | None:
    date_value = str(report.get("date") or "").strip()
    slot = str(report.get("window", {}).get("slot") or "").strip().zfill(2)
    if not date_value or slot not in {"08", "13", "18"}:
        return None
    return f"reports/daily/{date_value}-{slot}.html"


def join_public_url(base_url: str, path: str) -> str:
    clean = base_url.split("?", 1)[0].strip()
    if clean.endswith("index.html"):
        clean = clean[: -len("index.html")]
    if not clean.endswith("/"):
        clean += "/"
    return clean + path.lstrip("/")


def with_cache_buster(url: str) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}v={datetime.now(KST):%Y%m%d%H%M%S}"


def is_local_url(url: str) -> bool:
    lowered = url.lower()
    return (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or "::1" in lowered
        or lowered.startswith("file:")
    )


def report_link_check_enabled() -> bool:
    return os.getenv("REQUIRE_REPORT_LINK_OK", "true").strip().lower() not in {"0", "false", "no", "off"}


def verify_public_report_link(link_url: str, *, label: str = "report", attempts: int = 5, delay_seconds: int = 4) -> None:
    if not report_link_check_enabled() or is_local_url(link_url):
        return
    last_error = ""
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(link_url, timeout=15, allow_redirects=True)
            if response.status_code < 400:
                print(f"{label} link verified: {response.status_code} {link_url}")
                return
            last_error = f"HTTP {response.status_code}"
        except Exception as exc:
            last_error = str(exc)
        if attempt < attempts:
            time.sleep(delay_seconds)
    raise RuntimeError(f"{label} link check failed before Kakao send: {last_error} ({link_url})")


def forced_resend_enabled() -> bool:
    return os.getenv("FORCE_KAKAO_SEND", "").strip().lower() in {"1", "true", "yes", "y"}


def notification_log_title(title: str) -> str:
    if not forced_resend_enabled():
        return title
    return f"{title} 재발송 {datetime.now(KST):%Y%m%d%H%M%S}"


def forced_resend_dedupe_key(message_type: str, title: str) -> str | None:
    if not forced_resend_enabled():
        return None
    return f"{message_type}:{title}:resend:{datetime.now(KST):%Y%m%d%H%M%S}"


def build_message(report: dict) -> str:
    metrics = report.get("metrics", {})
    sections = parse_briefing(report.get("briefing", ""))
    own_tone = metrics.get("own_by_tone", {})
    own_total = metrics.get("by_category", {}).get("own", 0)
    risk = metrics.get("risk_level", "-")
    window = report.get("window", {})
    window_label = kakao_window_label(window)
    sent_at = datetime.now(KST).strftime("%H:%M")

    header = [
        f"언론 동향 {short_report_date(report.get('date', ''))} {window_label['name']}".strip(),
        f"분석대상 {window_label['range']} · 발송 {sent_at} · 리스크 {risk}",
        (
            f"당사 {own_total} · 부정 "
            f"{own_tone.get('negative', metrics.get('own_negative', 0))} · "
            f"긍정 {own_tone.get('positive', 0)} · 중립 {own_tone.get('neutral', 0)}"
        ),
    ]
    lines = header + ["", "동향 분석", compact(sections["conclusion"], 46, ellipsis=False)]
    if sections["issues"]:
        lines += ["", "핵심 이슈"]
        lines += [f"- {compact_issue(issue, 32)}" for issue in sections["issues"][:2]]

    return "\n".join(lines)[:300]


def notification_title(report: dict) -> str:
    window = report.get("window", {})
    slot = window.get("slot") or os.getenv("REPORT_SLOT", "").strip() or "auto"
    return f"일일 언론 동향 {report.get('date', '')} {slot}"


def short_report_date(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value).strftime("%m/%d")
    except ValueError:
        return value[5:] if len(value) >= 10 else value


def kakao_window_label(window: dict) -> dict[str, str]:
    slot = str(window.get("slot") or os.getenv("REPORT_SLOT", "")).zfill(2)
    name_by_slot = {"08": "아침", "13": "점심", "18": "마감"}
    fallback_name = window.get("report_label") or ""
    start = parse_iso_datetime(window.get("start", ""))
    end = parse_iso_datetime(window.get("end", ""))
    if start and end:
        start = start.astimezone(KST)
        end = end.astimezone(KST)
        if slot == "08" and start.date() != end.date():
            range_label = f"전일 {start:%H}시~{end:%H}시"
        elif start.date() == end.date():
            range_label = f"{start:%H}시~{end:%H}시"
        else:
            range_label = f"{start:%m/%d %H시}~{end:%m/%d %H시}"
    else:
        range_label = window.get("short_label") or window.get("label") or "현재"
    return {"name": name_by_slot.get(slot, fallback_name).strip(), "range": range_label}


def absolute_window_label(window: dict) -> str:
    start = parse_iso_datetime(window.get("start", ""))
    end = parse_iso_datetime(window.get("end", ""))
    if not start or not end:
        return ""
    start = start.astimezone(KST)
    end = end.astimezone(KST)
    if start.date() == end.date():
        return f"{start:%m/%d %H:%M}~{end:%H:%M}"
    return f"{start:%m/%d %H:%M}~{end:%m/%d %H:%M}"


def parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def compact(text: str, limit: int, *, ellipsis: bool = True) -> str:
    cleaned = re.sub(r"\[[\d,\s]+\]\s*", "", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.replace("핵심 이슈", "").strip()
    if len(cleaned) <= limit:
        return cleaned
    if ellipsis and limit > 1:
        return cleaned[: limit - 1].rstrip() + "…"
    return cleaned[:limit].rstrip()


def compact_issue(text: str, limit: int) -> str:
    cleaned = compact(text, 120, ellipsis=False).lstrip("- ").strip()
    head = re.split(r"[:：]", cleaned, 1)[0].strip() or cleaned
    head = re.split(r"[.!?。]", head, 1)[0].strip() or head
    return compact(head, limit, ellipsis=False)


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

    conclusion = first_text(section_map, ["최종 결론", "동향 분석", "오늘의 판단", "본문"])
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


def send_text_to_me(access_token: str, text: str, link_url: str, button_title: str = "보고서 보기") -> dict:
    template = {
        "object_type": "text",
        "text": text,
        "link": {"web_url": link_url, "mobile_web_url": link_url},
        "button_title": button_title,
    }
    response = requests.post(
        f"{KAKAO_API}/v2/api/talk/memo/default/send",
        headers={"Authorization": f"Bearer {access_token}"},
        data={"template_object": json.dumps(template, ensure_ascii=False)},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def needs_ai_usage_alert(report: dict) -> bool:
    metrics = report.get("metrics", {})
    return bool(metrics.get("ai_quota_exhausted") or metrics.get("ai_primary_failed") or metrics.get("ai_fallback_used"))


def ai_usage_alert_title(report: dict) -> str:
    return f"AI 요약 사용량 확인 {report.get('date', '')}"


def build_ai_usage_alert(report: dict) -> str:
    metrics = report.get("metrics", {})
    window = kakao_window_label(report.get("window", {}))
    reason = "사용량/크레딧 한도 확인 필요" if metrics.get("ai_quota_exhausted") else "기본 모델 응답 실패"
    return "\n".join(
        [
            "AI 요약 사용량 확인 필요",
            f"{short_report_date(report.get('date', ''))} {window['name']} · {reason}",
            "기본 AI 대신 백업 요약 경로를 사용했습니다.",
            "AI Studio 사용량/결제 상태를 확인하세요.",
        ]
    )[:300]


def maybe_send_ai_usage_alert(access_token: str, report: dict) -> None:
    if not needs_ai_usage_alert(report):
        return
    title = ai_usage_alert_title(report)
    if not os.getenv("FORCE_KAKAO_SEND") and notification_already_sent("ai_usage_alert", title, channel="kakao"):
        print(f"AI usage alert already sent: {title}")
        return
    link = os.getenv("GEMINI_USAGE_URL", "").strip() or config.GEMINI_USAGE_URL
    text = build_ai_usage_alert(report)
    try:
        result = send_text_to_me(access_token, text, link, button_title="사용량 확인")
        save_notification_send(
            message_type="ai_usage_alert",
            title=title,
            body=text,
            link_url=link,
            status="success",
            provider_response=result,
            channel="kakao",
        )
        print("AI usage alert result:", result)
    except Exception as error:
        save_notification_send(
            message_type="ai_usage_alert",
            title=title,
            body=text,
            link_url=link,
            status="failed",
            error=str(error),
            channel="kakao",
        )
        print(f"AI usage alert failed: {error}")


def main() -> None:
    load_dotenv()
    report = load_latest_daily()
    link = report_link(report)
    text = build_message(report)
    title = notification_title(report)
    if not forced_resend_enabled() and notification_already_sent("daily_report", title, strict=True, channel="kakao"):
        print(f"Kakao daily report already sent: {title}")
        print("Set FORCE_KAKAO_SEND=1 to send again intentionally.")
        if needs_ai_usage_alert(report):
            token = refresh_access_token()
            maybe_send_ai_usage_alert(token, report)
        return
    log_title = notification_log_title(title)
    log_dedupe_key = forced_resend_dedupe_key("daily_report", title)
    try:
        verify_public_report_link(link, label=title)
        token = refresh_access_token()
        result = send_text_to_me(token, text, link)
        save_notification_send(
            message_type="daily_report",
            title=log_title,
            body=text,
            link_url=link,
            status="success",
            provider_response=result,
            dedupe_key=log_dedupe_key,
            channel="kakao",
        )
        print("Kakao send result:", result)
        print("Report link:", link)
        maybe_send_ai_usage_alert(token, report)
    except Exception as error:
        save_notification_send(
            message_type="daily_report",
            title=log_title,
            body=text,
            link_url=link,
            status="failed",
            error=str(error),
            dedupe_key=log_dedupe_key,
            require_log=False,
            channel="kakao",
        )
        raise
    html_path = latest_html_path()
    if html_path:
        print("Latest HTML:", html_path)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check-token":
        check_kakao_token()
        raise SystemExit(0)
    main()
