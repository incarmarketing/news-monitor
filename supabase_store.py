"""Optional Supabase persistence for collected monitoring data."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

ARTICLE_COLUMNS = (
    "article_hash",
    "report_date",
    "report_slot",
    "window_label",
    "window_start",
    "window_end",
    "risk_level",
    "title",
    "link",
    "source",
    "keyword",
    "summary",
    "pub_date",
    "pub_date_raw",
    "score",
    "category",
    "tone",
    "cluster_size",
    "raw",
)

NOTIFICATION_COLUMNS = (
    "sent_at",
    "channel",
    "message_type",
    "title",
    "body",
    "link_url",
    "status",
    "error",
    "provider_response",
)

NEGATIVE_WATCH_COLUMNS = (
    "run_key",
    "scanned_at",
    "minutes_back",
    "scanned_count",
    "negative_count",
    "new_negative_count",
    "status",
    "message",
)


class SupabaseConfigError(RuntimeError):
    """Raised when Supabase credentials are incomplete."""


def is_enabled() -> bool:
    return bool(os.getenv("SUPABASE_URL") and write_key())


def write_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""


def headers() -> dict[str, str]:
    key = write_key()
    if not key:
        raise SupabaseConfigError("Supabase write key is not configured.")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def base_url() -> str:
    value = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not value:
        raise SupabaseConfigError("SUPABASE_URL is not configured.")
    return value


def request(method: str, path: str, **kwargs: Any) -> requests.Response:
    if isinstance(kwargs.get("data"), str):
        kwargs["data"] = kwargs["data"].encode("utf-8")
    response = requests.request(
        method,
        f"{base_url()}/rest/v1/{path}",
        headers=headers(),
        timeout=30,
        **kwargs,
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        detail = response.text[:500].replace("\n", " ")
        raise requests.HTTPError(f"{exc} - {detail}", response=response) from exc
    return response


def article_hash(article: dict) -> str:
    seed = article.get("link") or f"{article.get('title', '')}|{article.get('pub_date', '')}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def parse_pub_date(value: str) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def save_report_run(archive_payload: dict) -> None:
    if not is_enabled():
        return

    window = archive_payload.get("window", {})
    metrics = archive_payload.get("metrics", {})
    report_date = archive_payload.get("date")
    slot = window.get("slot", "")
    run_key = f"{report_date}-{slot}"

    run_row = {
        "run_key": run_key,
        "report_date": report_date,
        "report_slot": slot,
        "timestamp": archive_payload.get("timestamp"),
        "window_label": window.get("label", ""),
        "window_start": window.get("start"),
        "window_end": window.get("end"),
        "risk_level": metrics.get("risk_level", "LOW"),
        "metrics": metrics,
        "briefing": archive_payload.get("briefing", ""),
    }
    request("POST", "report_runs?on_conflict=run_key", data=json.dumps([run_row], ensure_ascii=False))

    rows = [
        normalize_article(article, archive_payload)
        for article in archive_payload.get("articles", [])
    ]
    if rows:
        request("POST", "news_articles?on_conflict=article_hash", data=json.dumps(rows, ensure_ascii=False))


def save_notification_send(
    *,
    message_type: str,
    title: str,
    body: str,
    link_url: str,
    status: str,
    error: str = "",
    provider_response: dict | None = None,
    channel: str = "kakao",
    sent_at: str | None = None,
) -> None:
    if not is_enabled():
        return
    row = {
        "sent_at": sent_at or datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "message_type": message_type,
        "title": title,
        "body": body,
        "link_url": link_url,
        "status": status,
        "error": error,
        "provider_response": provider_response or {},
    }
    try:
        request("POST", "notification_sends", data=json.dumps([{key: row.get(key) for key in NOTIFICATION_COLUMNS}], ensure_ascii=False))
    except Exception as error:
        print(f"Supabase notification log skipped: {error}")


def save_negative_watch_run(
    *,
    run_key: str,
    scanned_at: str,
    minutes_back: int,
    scanned_count: int,
    negative_count: int,
    new_negative_count: int,
    status: str,
    message: str = "",
) -> None:
    if not is_enabled():
        return
    row = {
        "run_key": run_key,
        "scanned_at": scanned_at,
        "minutes_back": minutes_back,
        "scanned_count": scanned_count,
        "negative_count": negative_count,
        "new_negative_count": new_negative_count,
        "status": status,
        "message": message,
    }
    try:
        request(
            "POST",
            "negative_watch_runs?on_conflict=run_key",
            data=json.dumps([{key: row.get(key) for key in NEGATIVE_WATCH_COLUMNS}], ensure_ascii=False),
        )
    except Exception as error:
        print(f"Supabase negative watch log skipped: {error}")


def normalize_article(article: dict, archive_payload: dict) -> dict:
    window = archive_payload.get("window", {})
    metrics = archive_payload.get("metrics", {})
    row = {
        "article_hash": article_hash(article),
        "report_date": archive_payload.get("date"),
        "report_slot": window.get("slot", ""),
        "window_label": window.get("label", ""),
        "window_start": window.get("start"),
        "window_end": window.get("end"),
        "risk_level": metrics.get("risk_level", "LOW"),
        "title": article.get("title", ""),
        "link": article.get("link", ""),
        "source": article.get("source", ""),
        "keyword": article.get("keyword", ""),
        "summary": article.get("description", "") or article.get("summary", ""),
        "pub_date": parse_pub_date(article.get("pub_date", "")),
        "pub_date_raw": article.get("pub_date", ""),
        "score": article.get("_score", 0),
        "category": article.get("_category", "other"),
        "tone": article.get("_tone", "neutral"),
        "cluster_size": article.get("_cluster_size", 1),
        "raw": article,
    }
    return {key: row.get(key) for key in ARTICLE_COLUMNS}


def load_dashboard_articles(limit: int = 2000) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "news_articles?"
            "select=article_hash,report_date,report_slot,window_label,risk_level,title,link,source,"
            "keyword,summary,pub_date,pub_date_raw,score,category,tone,cluster_size,status"
            f"&order=report_date.desc,score.desc&limit={limit}"
        ),
    )
    return response.json()


def load_monitor_keywords() -> list[str]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        "monitor_keywords?select=keyword&enabled=eq.true&order=category.asc,created_at.asc",
    )
    return [row["keyword"] for row in response.json() if row.get("keyword")]
