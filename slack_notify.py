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
    "analyzed_short": "\ubd84\uc11d",
    "own_short": "\ub2f9\uc0ac",
    "negative_short": "\ubd80\uc815",
    "positive_neutral_short": "\uae0d/\uc911",
    "positive_short": "\uae0d\uc815",
    "neutral_short": "\uc911\ub9bd",
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


def raw_cell(value: object) -> dict:
    return {"type": "raw_text", "text": str(value or "")[:200]}


def metric_table_block(report: dict, metrics: dict) -> dict:
    own_tone = metrics.get("own_by_tone", {}) or {}
    own_total = metrics.get("by_category", {}).get("own", metrics.get("own_total", 0))
    own_negative = own_tone.get("negative", metrics.get("own_negative", 0))
    positive = own_tone.get("positive", 0)
    neutral = own_tone.get("neutral", 0)
    risk = metrics.get("risk_level", "-")
    analyzed = daily_analyzed_count(metrics)
    return {
        "type": "table",
        "column_settings": [
            {"align": "center"},
            {"align": "right"},
            {"align": "right"},
            {"align": "right"},
            {"align": "right"},
            {"align": "right"},
        ],
        "rows": [
            [
                raw_cell(K["risk"]),
                raw_cell(K["analyzed_short"]),
                raw_cell(K["own_short"]),
                raw_cell(K["negative_short"]),
                raw_cell(K["positive_short"]),
                raw_cell(K["neutral_short"]),
            ],
            [
                raw_cell(risk),
                raw_cell(analyzed),
                raw_cell(own_total),
                raw_cell(own_negative),
                raw_cell(positive),
                raw_cell(neutral),
            ],
        ],
    }


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
    return f"slack:{message_type}:{title}:resend:{datetime.now(KST):%Y%m%d%H%M%S}"


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


GENERIC_SUMMARY_MARKERS = (
    K["check_report_articles"],
    "\uc774\uc288\uac00 \ud575\uc2ec\uc785\ub2c8\ub2e4",
    "\uae30\uc900 \ud575\uc2ec\ub9cc \uc694\uc57d",
    "\ud0a4\uc6cc\ub4dc \uae30\uc900\uc73c\ub85c \uc218\uc9d1",
    "\ubcf4\uace0\uc11c\uc5d0\uc11c \uc8fc\uc694 \uadfc\uac70",
    "\ub2f9\uc0ac \uc9c1\uc811 \uc5b8\uae09 \uae30\uc0ac",
    "\uc9c1\uc811 \ubd80\uc815\uc740 \uc544\ub2c8\uc9c0\ub9cc",
)


def clean_slack_text(value: object) -> str:
    text = str(value or "")
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;nbsp;", " ")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    return compact(text, 800, ellipsis=False).strip(" .")


def normalize_issue_text(value: object) -> str:
    text = clean_slack_text(value).lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\[[^\]]+\]", " ", text)
    text = re.sub(r"\s+-\s+[a-z0-9_.-]+$", " ", text)
    text = re.sub(r"[^\w\uac00-\ud7a3]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def useful_slack_summary(value: object, *, title: str = "", min_len: int = 8) -> str:
    text = clean_slack_text(value)
    if len(text) < min_len:
        return ""
    if title and normalize_issue_text(text) == normalize_issue_text(title):
        return ""
    if any(marker in text for marker in GENERIC_SUMMARY_MARKERS):
        return ""
    return text


def article_title(article: dict) -> str:
    return clean_slack_text(article.get("title", ""))


def article_summary(article: dict, title: str) -> str:
    for key in ("_summary", "summary", "description"):
        summary = useful_slack_summary(article.get(key, ""), title=title, min_len=14)
        if summary:
            return compact(summary, 160, ellipsis=False)
    return ""


def article_issue_key(article: dict, title: str) -> str:
    text = normalize_issue_text(f"{title} {article.get('_summary', '')} {article.get('description', '')}")
    if "\uc778\uce74\uae08\uc735" in text and "\ub354\ud5e4\ube10" in text and "\ub9c8\uc2a4\ud130\uc988" in text:
        return "event:incar-the-heaven-masters"
    if "\uae08\uc735\uc18c\ube44\uc790\ubcf4\ud638" in text and "\uae08\uac10\uc6d0" in text:
        return "event:fss-consumer-protection"
    if "\uc2e0\ud611" in text and "\ub0b4\ubd80\ud1b5\uc81c" in text:
        return "event:cu-internal-control"
    key = normalize_issue_text(title)
    words = key.split()
    return " ".join(words[:12]) if words else key


def article_rank(article: dict) -> int:
    category = str(article.get("_category") or article.get("category") or "").lower()
    tone = str(article.get("_tone") or article.get("tone") or "").lower()
    score = int(float(article.get("_score") or article.get("score") or 0))
    cluster_size = int(float(article.get("_cluster_size") or article.get("cluster_size") or 1))
    score += min(cluster_size, 12) * 8
    score += {"own": 500, "regulation": 220, "competitor": 120, "industry": 80}.get(category, 0)
    score += {"negative": 500, "caution": 280, "positive": 180, "neutral": 40}.get(tone, 0)
    return score


def article_issue_lines(report: dict, limit: int = 3, *, include_summary: bool = True) -> list[str]:
    rows: list[tuple[int, int, dict, str]] = []
    seen: set[str] = set()
    for index, article in enumerate(report.get("articles", []) or []):
        title = article_title(article)
        if not title:
            continue
        key = article_issue_key(article, title)
        if key in seen:
            continue
        seen.add(key)
        rows.append((article_rank(article), index, article, title))

    rows.sort(key=lambda row: (-row[0], row[1]))
    lines: list[str] = []
    for _, _, article, title in rows[:limit]:
        headline = compact(title, 110, ellipsis=False)
        summary = article_summary(article, title) if include_summary else ""
        if include_summary and summary:
            lines.append(f"- *{headline}*\n  {summary}")
        else:
            lines.append(f"- *{headline}*")
    return lines


def parsed_issue_lines(issues: list[str], limit: int = 3) -> list[str]:
    lines = []
    for issue in issues:
        text = useful_slack_summary(issue, min_len=10)
        if text:
            lines.append(f"- {compact(text, 130, ellipsis=False)}")
        if len(lines) >= limit:
            break
    return lines


def daily_issue_lines(report: dict, sections: dict) -> list[str]:
    article_lines = article_issue_lines(report, limit=3, include_summary=False)
    if article_lines:
        return article_lines
    return parsed_issue_lines(sections.get("issues", []), limit=3)


def daily_conclusion(report: dict, sections: dict, issue_lines: list[str]) -> str:
    conclusion = useful_slack_summary(sections.get("conclusion", ""), min_len=20)
    if conclusion:
        return compact(conclusion, 220, ellipsis=False)

    metrics = report.get("metrics", {})
    first_issue = re.sub(r"[*\-]", "", issue_lines[0] if issue_lines else "").splitlines()[0].strip()
    risk = metrics.get("risk_level", "-")
    own_total = metrics.get("by_category", {}).get("own", metrics.get("own_total", 0))
    own_negative = metrics.get("own_by_tone", {}).get("negative", metrics.get("own_negative", 0))
    if first_issue:
        return compact(
            f"{first_issue} | {K['risk']} {risk}, {K['own_mentions']} {own_total}{K['count']}, "
            f"{K['own_negative']} {own_negative}{K['count']}",
            220,
            ellipsis=False,
        )
    return K["default_conclusion"]


def daily_title(report: dict) -> str:
    window = report.get("window", {})
    slot = str(window.get("slot") or os.getenv("REPORT_SLOT", "").strip() or "auto").zfill(2)
    return f"{K['media_trend']} {report.get('date', '')} {slot}"


def daily_analyzed_count(metrics: dict) -> int:
    for key in ("analyzed", "total_after_cluster", "total"):
        value = metrics.get(key)
        if value is None:
            continue
        try:
            return int(float(value))
        except (TypeError, ValueError):
            continue
    return 0


def daily_status_text(report: dict, metrics: dict, window: dict) -> str:
    return f"{short_report_date(report.get('date', ''))} {window['name']} \u00b7 {window['range']}"


def build_daily_payload(report: dict, link: str) -> tuple[str, dict]:
    metrics = report.get("metrics", {})
    sections = parse_briefing(report.get("briefing", ""))
    own_total = metrics.get("by_category", {}).get("own", metrics.get("own_total", 0))
    risk = metrics.get("risk_level", "-")
    window = window_label(report.get("window", {}))
    title = daily_title(report)
    issues = daily_issue_lines(report, sections)
    status_text = daily_status_text(report, metrics, window)
    issue_text = "\n".join(issues)
    if not issue_text:
        issue_text = f"- {K['check_report_articles']}"

    fallback = f"{title} | {K['risk']} {risk} | {K['own_mentions']} {own_total}{K['count']}"
    payload = {
        "text": fallback,
        "blocks": [
            section(f"*{title}*\n{status_text}"),
            metric_table_block(report, metrics),
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
    if not force_send_enabled() and notification_already_sent("ai_usage_alert", title, channel="slack"):
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
    if not force_send_enabled() and notification_already_sent("daily_report", title, strict=True, channel="slack"):
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
            require_log=True,
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
    if not force_send_enabled() and notification_already_sent(message_type, title, strict=True, channel="slack"):
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
            require_log=True,
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
