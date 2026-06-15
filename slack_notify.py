"""Send monitoring notifications to Slack.

Slack is the primary delivery channel. Kakao OAuth, refresh tokens, and
personal "message to me" APIs are intentionally not used here.

Korean UI strings are written with unicode escapes because this workspace shell
can corrupt non-ASCII text during patching.
"""

from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

import archiver
import config
from supabase_store import notification_already_sent, save_notification_send

BASE_DIR = Path(__file__).parent
DEFAULT_REPORT_URL = "https://incarmarketing.github.io/news-monitor/"
KST = timezone(timedelta(hours=9))


K = {
    "morning": "\uc624\uc804",
    "afternoon": "\uc624\ud6c4",
    "closing": "\ub9c8\uac10",
    "briefing": "\ube0c\ub9ac\ud551",
    "current_basis": "\ud604\uc7ac \uae30\uc900",
    "body": "\ubcf8\ubb38",
    "final_conclusion": "\ucd5c\uc885 \uacb0\ub860",
    "trend_analysis": "\ub3d9\ud5a5 \ubd84\uc11d",
    "today_judgment": "\uc624\ub298\uc758 \ud310\ub2e8",
    "key_issue": "\ud575\uc2ec \uc774\uc288",
    "major_issue": "\uc8fc\uc694 \uc774\uc288",
    "issue": "\uc774\uc288",
    "default_conclusion": "\ub2f9\uc0ac \uc9c1\uc811 \ub9ac\uc2a4\ud06c\uc640 \uc8fc\uc694 \uc5c5\uacc4 \ud750\ub984\uc744 \uae30\uc900\uc73c\ub85c \ubcf4\uace0\uc11c\ub97c \uc0dd\uc131\ud588\uc2b5\ub2c8\ub2e4.",
    "media_trend": "\uc5b8\ub860 \ub3d9\ud5a5",
    "basis": "\uae30\uc900",
    "risk": "\ub9ac\uc2a4\ud06c",
    "analyzed_articles": "\ubd84\uc11d \uae30\uc0ac",
    "own_mentions": "\ub2f9\uc0ac \uc5b8\uae09",
    "own_negative": "\ub2f9\uc0ac \ubd80\uc815",
    "positive_neutral": "\uae0d\uc815/\uc911\ub9bd",
    "count": "\uac74",
    "check_report_articles": "\ubcf4\uace0\uc11c\uc5d0\uc11c \uc8fc\uc694 \uadfc\uac70 \uae30\uc0ac\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
    "open_report": "\ubcf4\uace0\uc11c \uc5f4\uae30",
    "dashboard": "\ub300\uc2dc\ubcf4\ub4dc",
    "weekly": "\uc8fc\uac04",
    "monthly": "\uc6d4\uac04",
    "weekly_title": "\uc8fc\uac04 \uc5b8\ub860 \ubaa8\ub2c8\ud130\ub9c1 \ubcf4\uace0\uc11c",
    "monthly_title": "\uc6d4\uac04 \uc5b8\ub860 \ubaa8\ub2c8\ud130\ub9c1 \ubcf4\uace0\uc11c",
    "weekly_desc": "\uc804\uc8fc \uae30\uc0ac \ud750\ub984, \ubc18\ubcf5 \ub178\ucd9c \uc774\uc288, \ub2f9\uc0ac\u00b7\uacbd\uc7c1\u00b7\uc815\ucc45 \uc2e0\ud638\ub97c \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4.",
    "monthly_desc": "\uc9d1\uacc4\uc6d4 \uae30\uc900 \ub204\uc801 \ubcf4\ub3c4, \ub9e4\uccb4 \uc601\ud5a5\ub3c4, \ud0a4\uc6cc\ub4dc \ud750\ub984\uc744 \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4.",
    "report_basis": "\uae30\uc900",
    "alert_title": "\ubd80\uc815/\uc8fc\uc758 \uae30\uc0ac \uac10\uc9c0",
    "check_monitoring": "\ubaa8\ub2c8\ud130\ub9c1\uc5d0\uc11c \ud655\uc778",
    "open_original": "\uc6d0\ubb38 \uc5f4\uae30",
    "ai_usage_title": "AI \uc0ac\uc6a9 \uc0c1\ud0dc \ud655\uc778",
    "ai_quota_reason": "\ucffc\ud130/\uacfc\uae08 \uc0c1\ud0dc \ud655\uc778 \ud544\uc694",
    "ai_fallback_reason": "\uae30\ubcf8 \ubaa8\ub378 \uc751\ub2f5 \uc2e4\ud328",
    "ai_usage_body": "AI Studio \uc0ac\uc6a9\ub7c9\uacfc \uacb0\uc81c \uc0c1\ud0dc\ub97c \ud655\uc778\ud574 \uc8fc\uc138\uc694.",
    "check_usage": "\uc0ac\uc6a9\ub7c9 \ud655\uc778",
    "resend": "\uc7ac\ubc1c\uc1a1",
}


class SlackNotifyError(RuntimeError):
    """Raised when Slack notification delivery cannot proceed."""


def slack_webhook_url(kind: str = "report") -> str:
    candidates: list[str] = []
    if kind == "alert":
        candidates.extend(["SLACK_ALERT_WEBHOOK_URL", "SLACK_NEGATIVE_WEBHOOK_URL"])
    elif kind == "ai_usage":
        candidates.append("SLACK_AI_USAGE_WEBHOOK_URL")
    else:
        candidates.append("SLACK_REPORT_WEBHOOK_URL")
    candidates.append("SLACK_WEBHOOK_URL")

    for key in candidates:
        value = os.getenv(key, "").strip()
        if value:
            return value
    raise SlackNotifyError("SLACK_WEBHOOK_URL secret is missing.")


def post_to_slack(payload: dict, *, kind: str = "report") -> dict:
    response = requests.post(slack_webhook_url(kind), json=payload, timeout=15)
    if response.status_code >= 400:
        raise SlackNotifyError(f"Slack webhook failed: HTTP {response.status_code} {response.text[:300]}")
    return {"ok": True, "status_code": response.status_code, "body": response.text[:200]}


def text_obj(text: str, *, plain: bool = False) -> dict:
    return {"type": "plain_text" if plain else "mrkdwn", "text": str(text or "")[:3000]}


def section(text: str, fields: list[str] | None = None) -> dict:
    block = {"type": "section", "text": text_obj(text)}
    if fields:
        block["fields"] = [text_obj(field) for field in fields[:10]]
    return block


def actions(*buttons: tuple[str, str]) -> dict:
    elements = []
    for label, url in buttons:
        if not url:
            continue
        elements.append({"type": "button", "text": text_obj(label[:75], plain=True), "url": url})
    return {"type": "actions", "elements": elements[:5]}


def divider() -> dict:
    return {"type": "divider"}


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


def verify_public_report_link(link_url: str, *, label: str = "report", attempts: int = 5, delay_seconds: int = 4) -> None:
    if os.getenv("REQUIRE_REPORT_LINK_OK", "true").strip().lower() in {"0", "false", "no", "off"}:
        return
    if is_local_url(link_url):
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
    raise RuntimeError(f"{label} link check failed before Slack send: {last_error} ({link_url})")


def force_send_enabled() -> bool:
    return os.getenv("FORCE_SLACK_SEND", "").strip().lower() in {"1", "true", "yes", "y"}


def notification_log_title(title: str) -> str:
    return title


def forced_resend_dedupe_key(message_type: str, title: str) -> str | None:
    if not force_send_enabled():
        return None
    return f"{message_type}:{title}:resend:{datetime.now(KST):%Y%m%d%H%M%S}"


def parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def short_report_date(value: str) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value).strftime("%m/%d")
    except ValueError:
        return value[5:] if len(value) >= 10 else value


def window_label(window: dict) -> dict[str, str]:
    slot = str(window.get("slot") or os.getenv("REPORT_SLOT", "")).zfill(2)
    name_by_slot = {"08": K["morning"], "13": K["afternoon"], "18": K["closing"]}
    fallback_name = str(window.get("report_label") or K["briefing"])
    start = parse_iso_datetime(window.get("start", ""))
    end = parse_iso_datetime(window.get("end", ""))
    if start and end:
        start = start.astimezone(KST)
        end = end.astimezone(KST)
        if start.date() == end.date():
            range_label = f"{start:%H:%M}~{end:%H:%M}"
        else:
            range_label = f"{start:%m/%d %H:%M}~{end:%m/%d %H:%M}"
    else:
        range_label = str(window.get("short_label") or window.get("label") or K["current_basis"])
    return {"name": name_by_slot.get(slot, fallback_name).strip(), "range": range_label}


def compact(text: str, limit: int, *, ellipsis: bool = True) -> str:
    cleaned = re.sub(r"\[[\d,\s]+\]\s*", "", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).replace(K["key_issue"], "").strip()
    if len(cleaned) <= limit:
        return cleaned
    if ellipsis and limit > 1:
        return cleaned[: limit - 1].rstrip() + "\u2026"
    return cleaned[:limit].rstrip()


def parse_briefing(briefing: str) -> dict:
    cleaned = (briefing or "").replace("**", "").strip()
    section_map: dict[str, list[str]] = {}
    current = K["body"]

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

    conclusion = first_text(section_map, [K["final_conclusion"], K["trend_analysis"], K["today_judgment"], K["body"]])
    issues = section_map.get(K["key_issue"]) or section_map.get(K["major_issue"]) or section_map.get(K["issue"]) or []
    if not conclusion:
        conclusion = K["default_conclusion"]
    return {"conclusion": conclusion, "issues": [item for item in issues if item]}


def first_text(section_map: dict[str, list[str]], names: list[str]) -> str:
    for name in names:
        values = section_map.get(name, [])
        if values:
            return values[0]
    return ""


def daily_title(report: dict) -> str:
    window = report.get("window", {})
    slot = str(window.get("slot") or os.getenv("REPORT_SLOT", "").strip() or "auto").zfill(2)
    return f"{K['media_trend']} {report.get('date', '')} {slot}"


def build_daily_payload(report: dict, link: str) -> tuple[str, dict]:
    metrics = report.get("metrics", {})
    sections = parse_briefing(report.get("briefing", ""))
    own_tone = metrics.get("own_by_tone", {})
    own_total = metrics.get("by_category", {}).get("own", metrics.get("own_total", 0))
    risk = metrics.get("risk_level", "-")
    analyzed = metrics.get("analyzed", metrics.get("total", 0))
    window = window_label(report.get("window", {}))
    title = daily_title(report)
    issues = sections["issues"][:3]

    fields = [
        f"*{K['basis']}*\n{short_report_date(report.get('date', ''))} {window['name']} | {window['range']}",
        f"*{K['risk']}*\n{risk}",
        f"*{K['analyzed_articles']}*\n{analyzed}{K['count']}",
        f"*{K['own_mentions']}*\n{own_total}{K['count']}",
        f"*{K['own_negative']}*\n{own_tone.get('negative', metrics.get('own_negative', 0))}{K['count']}",
        f"*{K['positive_neutral']}*\n{own_tone.get('positive', 0)} / {own_tone.get('neutral', 0)}",
    ]
    issue_text = "\n".join([f"- {compact(issue, 100, ellipsis=False)}" for issue in issues])
    if not issue_text:
        issue_text = f"- {K['check_report_articles']}"

    fallback = f"{title} | {K['risk']} {risk} | {K['own_mentions']} {own_total}{K['count']}"
    payload = {
        "text": fallback,
        "blocks": [
            section(f"*{title}*\n{compact(sections['conclusion'], 220, ellipsis=False)}", fields),
            divider(),
            section(f"*{K['key_issue']}*\n{issue_text}"),
            actions((K["open_report"], link), (K["dashboard"], join_public_url(DEFAULT_REPORT_URL, "dashboard.html"))),
        ],
    }
    return fallback, payload


PERIODS = {
    "weekly": {
        "label": K["weekly"],
        "path": "weekly.html",
        "title": K["weekly_title"],
        "desc": K["weekly_desc"],
    },
    "monthly": {
        "label": K["monthly"],
        "path": "monthly.html",
        "title": K["monthly_title"],
        "desc": K["monthly_desc"],
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


def build_period_payload(period: str, report_month: str = "") -> tuple[str, str, dict]:
    info = PERIODS[period]
    link = with_cache_buster(base_url() + period_path(period, report_month))
    date_line = f"{report_month} {K['report_basis']}" if report_month else datetime.now(KST).strftime("%Y-%m-%d")
    title = f"{info['label']} {K['media_trend']} {(' ' + report_month) if report_month else ''}".strip()
    fallback = f"{title} | {date_line}"
    payload = {
        "text": fallback,
        "blocks": [
            section(f"*{info['title']}*\n{date_line}\n{info['desc']}"),
            actions((K["open_report"], link), (K["dashboard"], join_public_url(DEFAULT_REPORT_URL, "dashboard.html"))),
        ],
    }
    return title, link, payload


def build_alert_payload(text: str, link_url: str, *, title: str = K["alert_title"], article_url: str = "") -> dict:
    buttons = [(K["check_monitoring"], link_url)]
    if article_url and article_url != "#":
        buttons.insert(0, (K["open_original"], article_url))
    return {
        "text": title,
        "blocks": [
            section(f"*{title}*\n{compact(text, 900, ellipsis=False)}"),
            actions(*buttons),
        ],
    }


def send_alert(text: str, link_url: str, *, title: str = K["alert_title"], article_url: str = "") -> dict:
    return post_to_slack(build_alert_payload(text, link_url, title=title, article_url=article_url), kind="alert")


def needs_ai_usage_alert(report: dict) -> bool:
    metrics = report.get("metrics", {})
    return bool(metrics.get("ai_quota_exhausted") or metrics.get("ai_primary_failed") or metrics.get("ai_fallback_used"))


def ai_usage_alert_title(report: dict) -> str:
    return f"{K['ai_usage_title']} {report.get('date', '')}"


def build_ai_usage_payload(report: dict) -> tuple[str, dict]:
    metrics = report.get("metrics", {})
    window = window_label(report.get("window", {}))
    reason = K["ai_quota_reason"] if metrics.get("ai_quota_exhausted") else K["ai_fallback_reason"]
    link = os.getenv("GEMINI_USAGE_URL", "").strip() or config.GEMINI_USAGE_URL
    title = ai_usage_alert_title(report)
    payload = {
        "text": title,
        "blocks": [
            section(
                f"*{title}*\n"
                f"{short_report_date(report.get('date', ''))} {window['name']} | {reason}\n"
                f"{K['ai_usage_body']}"
            ),
            actions((K["check_usage"], link)),
        ],
    }
    return link, payload


def maybe_send_ai_usage_alert(report: dict) -> None:
    if not needs_ai_usage_alert(report):
        return
    if not os.getenv("SLACK_AI_USAGE_WEBHOOK_URL", "").strip():
        print("AI usage alert skipped: SLACK_AI_USAGE_WEBHOOK_URL is not configured.")
        return
    title = ai_usage_alert_title(report)
    if not force_send_enabled() and notification_already_sent("ai_usage_alert", title):
        print(f"AI usage alert already sent: {title}")
        return
    link, payload = build_ai_usage_payload(report)
    try:
        result = post_to_slack(payload, kind="ai_usage")
        save_notification_send(
            message_type="ai_usage_alert",
            title=title,
            body=payload["text"],
            link_url=link,
            status="success",
            provider_response=result,
            channel="slack",
        )
        print("Slack AI usage alert result:", result)
    except Exception as error:
        save_notification_send(
            message_type="ai_usage_alert",
            title=title,
            body=payload["text"],
            link_url=link,
            status="failed",
            error=str(error),
            channel="slack",
        )
        print(f"Slack AI usage alert failed: {error}")


def send_daily() -> None:
    report = load_latest_daily()
    link = report_link(report)
    title = daily_title(report)
    if not force_send_enabled() and notification_already_sent("daily_report", title, strict=True):
        print(f"Slack daily report already sent: {title}")
        maybe_send_ai_usage_alert(report)
        return
    log_title = notification_log_title(title)
    log_dedupe_key = forced_resend_dedupe_key("daily_report", title)
    fallback, payload = build_daily_payload(report, link)
    try:
        verify_public_report_link(link, label=title)
        result = post_to_slack(payload, kind="report")
        save_notification_send(
            message_type="daily_report",
            title=log_title,
            body=fallback,
            link_url=link,
            status="success",
            provider_response=result,
            channel="slack",
            dedupe_key=log_dedupe_key,
            require_log=False,
        )
        print("Slack daily report result:", result)
        print("Report link:", link)
        maybe_send_ai_usage_alert(report)
    except Exception as error:
        save_notification_send(
            message_type="daily_report",
            title=log_title,
            body=fallback,
            link_url=link,
            status="failed",
            error=str(error),
            channel="slack",
            dedupe_key=log_dedupe_key,
            require_log=False,
        )
        raise


def send_period(period: str, report_month: str = "") -> None:
    if period not in PERIODS:
        raise SystemExit(f"Unknown period: {period}")
    report_month = normalize_report_month(report_month)
    title, link, payload = build_period_payload(period, report_month)
    message_type = f"{period}_report"
    if not force_send_enabled() and notification_already_sent(message_type, title, strict=True):
        print(f"Slack period report already sent: {title}")
        return
    log_dedupe_key = forced_resend_dedupe_key(message_type, title)
    try:
        verify_public_report_link(link, label=title)
        result = post_to_slack(payload, kind="report")
        save_notification_send(
            message_type=message_type,
            title=title,
            body=payload["text"],
            link_url=link,
            status="success",
            provider_response=result,
            channel="slack",
            dedupe_key=log_dedupe_key,
            require_log=False,
        )
        print("Slack period report result:", result)
        print("Period report link:", link)
    except Exception as error:
        save_notification_send(
            message_type=message_type,
            title=title,
            body=payload["text"],
            link_url=link,
            status="failed",
            error=str(error),
            channel="slack",
            dedupe_key=log_dedupe_key,
            require_log=False,
        )
        raise


def main() -> None:
    load_dotenv()
    command = sys.argv[1] if len(sys.argv) > 1 else "daily"
    if command == "daily":
        send_daily()
        return
    if command == "period":
        period = sys.argv[2] if len(sys.argv) > 2 else "weekly"
        month = sys.argv[3] if len(sys.argv) > 3 else ""
        send_period(period, month)
        return
    raise SystemExit(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
