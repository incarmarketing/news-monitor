"""Optional Supabase persistence for collected monitoring data."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote

import requests
from dotenv import load_dotenv

import analyzer

load_dotenv()
KST = timezone(timedelta(hours=9))

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

MEDIA_RELATION_EXCLUDED_SOURCES = {
    "google",
    "naver",
    "daum",
    "bing",
    "금융감독원",
    "금융위원회",
    "금융보안원",
    "금융소비자보호처",
}

CATEGORY_FEEDBACK_MAP = {
    "own": "own",
    "company": "own",
    "당사": "own",
    "당사 보도": "own",
    "인카": "own",
    "regulation": "regulation",
    "policy": "regulation",
    "정책/규제": "regulation",
    "규제/정책": "regulation",
    "정책": "regulation",
    "규제": "regulation",
    "competitor": "competitor",
    "ga": "competitor",
    "GA": "competitor",
    "보험사": "competitor",
    "경쟁사": "competitor",
    "industry": "industry",
    "market": "industry",
    "업계동향": "industry",
    "업계 동향": "industry",
    "기타": "other",
    "other": "other",
    "제외": "other",
    "exclude": "other",
    "noise": "other",
}

TONE_FEEDBACK_MAP = {
    "positive": "positive",
    "긍정": "positive",
    "neutral": "neutral",
    "중립": "neutral",
    "caution": "caution",
    "warning": "caution",
    "주의": "caution",
    "negative": "negative",
    "high": "negative",
    "부정": "negative",
    "exclude": "exclude",
    "excluded": "exclude",
    "noise": "exclude",
    "제외": "exclude",
    "노이즈": "exclude",
}

EXCLUDE_CATEGORY_LABELS = {"제외", "exclude", "excluded", "noise", "노이즈"}


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


def normalize_feedback_link(value: object) -> str:
    raw = str(value or "").strip()
    if not raw or raw == "#":
        return ""
    return raw.split("#", 1)[0].split("?", 1)[0].rstrip("/").lower()


def normalize_feedback_title(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def normalize_feedback_category(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return CATEGORY_FEEDBACK_MAP.get(text) or CATEGORY_FEEDBACK_MAP.get(text.lower(), "")


def normalize_feedback_tone(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return TONE_FEEDBACK_MAP.get(text) or TONE_FEEDBACK_MAP.get(text.lower(), "")


def feedback_index_key(kind: str, value: str) -> str:
    return f"{kind}:{value}"


def build_classification_feedback_index(rows: list[dict]) -> dict[str, dict]:
    """Build a latest-first correction lookup keyed by hash, link, and title."""
    index: dict[str, dict] = {}
    for row in rows:
        category = normalize_feedback_category(row.get("corrected_category"))
        tone = normalize_feedback_tone(row.get("corrected_tone"))
        if str(row.get("corrected_category") or "").strip() in EXCLUDE_CATEGORY_LABELS and not tone:
            tone = "exclude"
        if not category and not tone:
            continue
        correction = {
            "category": category,
            "tone": tone,
            "reason": row.get("reason", ""),
            "created_at": row.get("created_at", ""),
        }
        keys = []
        article_hash_value = str(row.get("article_hash") or "").strip()
        if article_hash_value:
            keys.append(feedback_index_key("hash", article_hash_value))
        link = normalize_feedback_link(row.get("link"))
        if link:
            keys.append(feedback_index_key("link", link))
        title = normalize_feedback_title(row.get("title"))
        if title:
            keys.append(feedback_index_key("title", title))
        for key in keys:
            index.setdefault(key, correction)
    return index


def load_classification_feedback_index(limit: int = 5000) -> dict[str, dict]:
    if not is_enabled():
        return {}
    query = (
        "classification_feedback?"
        "select=article_hash,title,link,corrected_category,corrected_tone,reason,created_at"
        "&order=created_at.desc"
        f"&limit={limit}"
    )
    try:
        rows = request("GET", query).json()
        return build_classification_feedback_index(rows if isinstance(rows, list) else [])
    except Exception as error:
        print(f"Supabase classification feedback lookup skipped: {error}")
        return {}


def classification_feedback_keys_for_article(article: dict) -> list[str]:
    keys = []
    existing_hash = str(article.get("article_hash") or article.get("id") or "").strip()
    if existing_hash and len(existing_hash) >= 24:
        keys.append(feedback_index_key("hash", existing_hash))
    try:
        keys.append(feedback_index_key("hash", article_hash(article)))
    except Exception:
        pass
    link = normalize_feedback_link(article.get("link"))
    if link:
        keys.append(feedback_index_key("link", link))
    title = normalize_feedback_title(article.get("title"))
    if title:
        keys.append(feedback_index_key("title", title))
    return list(dict.fromkeys(keys))


def apply_classification_feedback(article: dict, feedback_index: dict[str, dict]) -> bool:
    if not feedback_index:
        return False
    correction = None
    for key in classification_feedback_keys_for_article(article):
        correction = feedback_index.get(key)
        if correction:
            break
    if not correction:
        return False

    category = correction.get("category", "")
    tone = correction.get("tone", "")
    if category:
        article["_category"] = category
        article["category"] = category
    if tone:
        article["_tone"] = tone
        article["tone"] = tone
    if tone == "exclude":
        article["_score"] = min(int(article.get("_score") or article.get("score") or 0), 0)
        article["status"] = "excluded_by_feedback"
    article["_feedback_applied"] = True
    if correction.get("reason"):
        article["_feedback_reason"] = correction.get("reason")
    return bool(category or tone)


def apply_classification_feedback_to_articles(
    articles: list[dict],
    feedback_index: dict[str, dict] | None = None,
) -> int:
    feedback_index = feedback_index if feedback_index is not None else load_classification_feedback_index()
    if not feedback_index:
        return 0
    applied = 0
    for article in articles:
        if apply_classification_feedback(article, feedback_index):
            applied += 1
    if applied:
        print(f"Classification feedback applied: {applied} article(s)")
    return applied


def parse_pub_date(value: str) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    try:
        parsed = parsedate_to_datetime(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    normalized = (
        raw.replace("년", "-")
        .replace("월", "-")
        .replace("일", "")
        .replace(".", "-")
        .strip()
    )
    normalized = " ".join(normalized.split())
    normalized = re.sub(r"(\d{4}-\d{1,2}-\d{1,2})-\s+", r"\1 ", normalized)
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(normalized, fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=KST)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
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

    articles = archive_payload.get("articles", [])
    apply_classification_feedback_to_articles(articles)
    rows = [
        normalize_article(article, archive_payload)
        for article in articles
    ]
    if rows:
        request("POST", "news_articles?on_conflict=article_hash", data=json.dumps(rows, ensure_ascii=False))
        save_own_media_relations(rows)


def save_dashboard_articles(articles: list[dict], *, report_date: str, window: dict, metrics: dict | None = None) -> None:
    """Persist analyzed articles without creating a report run."""
    if not is_enabled() or not articles:
        return
    archive_payload = {
        "date": report_date,
        "window": window,
        "metrics": metrics or {},
    }
    apply_classification_feedback_to_articles(articles)
    rows = [normalize_article(article, archive_payload) for article in articles]
    if rows:
        request("POST", "news_articles?on_conflict=article_hash", data=json.dumps(rows, ensure_ascii=False))
        save_own_media_relations(rows)


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


def notification_already_sent(message_type: str, title: str, status: str = "success") -> bool:
    """Return True when the same notification title already has a successful send log."""
    if not is_enabled() or not message_type or not title:
        return False
    query = (
        "notification_sends?select=id"
        f"&message_type=eq.{quote(message_type, safe='')}"
        f"&title=eq.{quote(title, safe='')}"
        f"&status=eq.{quote(status, safe='')}"
        "&limit=1"
    )
    try:
        rows = request("GET", query).json()
        return bool(rows)
    except Exception as error:
        print(f"Supabase notification duplicate check skipped: {error}")
        return False


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
    request(
        "POST",
        "negative_watch_runs?on_conflict=run_key",
        data=json.dumps([{key: row.get(key) for key in NEGATIVE_WATCH_COLUMNS}], ensure_ascii=False),
    )


def load_latest_negative_watch_run() -> dict | None:
    if not is_enabled():
        return None
    response = request(
        "GET",
        "negative_watch_runs?select=scanned_at,status&order=scanned_at.desc,created_at.desc&limit=1",
    )
    rows = response.json()
    return rows[0] if rows else None


def load_recent_negative_articles(minutes_back: int, limit: int = 20) -> list[dict]:
    """Load company-negative articles recently inserted into the shared DB.

    This catches articles discovered by scheduled reports even when the portal
    RSS published time is older than the watcher's short polling window.
    """
    if not is_enabled():
        return []
    since = (datetime.now(timezone.utc) - timedelta(minutes=max(1, minutes_back))).isoformat()
    query = (
        "news_articles?"
        "select=article_hash,report_date,report_slot,window_label,risk_level,title,link,source,"
        "keyword,summary,pub_date,pub_date_raw,score,category,tone,cluster_size,status,created_at"
        "&category=eq.own"
        "&tone=eq.negative"
        f"&created_at=gte.{quote(since, safe='')}"
        "&order=created_at.desc"
        f"&limit={limit}"
    )
    try:
        return request("GET", query).json()
    except Exception as error:
        print(f"Supabase recent negative article lookup skipped: {error}")
        return []


def article_risk_level(article: dict, metrics: dict | None = None) -> str:
    """Return the direct company-risk level for a single article."""
    category = article.get("_category") or article.get("category") or "other"
    tone = article.get("_tone") or article.get("tone") or "neutral"
    if category != "own" or tone != "negative":
        return "LOW"

    source = (metrics or {}).get("risk_level") or article.get("risk_level") or "MEDIUM"
    risk = str(source).upper()
    return risk if risk in {"MEDIUM", "HIGH"} else "MEDIUM"


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
        "risk_level": article_risk_level(article, metrics),
        "title": article.get("title", ""),
        "link": article.get("link", ""),
        "source": article.get("source", ""),
        "keyword": article.get("keyword", ""),
        "summary": article.get("_summary", "") or analyzer.build_quality_summary(article),
        "pub_date": parse_pub_date(article.get("pub_date", "")),
        "pub_date_raw": article.get("pub_date", ""),
        "score": article.get("_score", 0),
        "category": article.get("_category", "other"),
        "tone": article.get("_tone", "neutral"),
        "cluster_size": article.get("_cluster_size", 1),
        "raw": article,
    }
    return {key: row.get(key) for key in ARTICLE_COLUMNS}


def save_own_media_relations(article_rows: list[dict]) -> None:
    """Ensure every outlet that has carried a company article has a media row."""
    own_sources = sorted(
        {
            str(row.get("source") or "").strip()
            for row in article_rows
            if row.get("category") == "own" and is_manageable_media_source(row.get("source"))
        }
    )
    for source in own_sources:
        try:
            if media_relation_exists(source):
                continue
            row = {
                "name": source,
                "status": "중립",
                "grade": "B",
                "owner": "",
                "contact_date": None,
                "memo": "당사 기사 게재 이력으로 자동 등록된 관리 대상",
                "hidden": False,
            }
            request("POST", "media_relations", data=json.dumps([row], ensure_ascii=False))
        except Exception as error:
            print(f"Supabase media relation seed skipped for {source}: {error}")


def is_manageable_media_source(source: object) -> bool:
    name = str(source or "").strip()
    if not name:
        return False
    lower = name.lower()
    if name in MEDIA_RELATION_EXCLUDED_SOURCES or lower in MEDIA_RELATION_EXCLUDED_SOURCES:
        return False
    return not any(token in lower for token in ("google", "naver", "daum"))


def media_relation_exists(name: str) -> bool:
    if not name:
        return False
    response = request(
        "GET",
        f"media_relations?select=name&name=eq.{quote(name, safe='')}&limit=1",
    )
    rows = response.json()
    return bool(rows)


def load_dashboard_articles(limit: int = 50000, page_size: int = 1000) -> list[dict]:
    if not is_enabled():
        return []
    rows: list[dict] = []
    select = (
        "news_articles?"
        "select=article_hash,report_date,report_slot,window_label,risk_level,title,link,source,"
        "keyword,summary,pub_date,pub_date_raw,score,category,tone,cluster_size,status"
        "&order=report_date.desc,score.desc"
    )
    for offset in range(0, limit, page_size):
        response = request("GET", f"{select}&limit={page_size}&offset={offset}")
        page = response.json()
        if not isinstance(page, list) or not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
    if rows:
        save_own_media_relations(rows)
    return rows


def load_dashboard_report_runs(limit: int = 1000) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "report_runs?"
            "select=run_key,report_date,report_slot,timestamp,window_label,window_start,window_end,risk_level,metrics"
            f"&order=report_date.desc,report_slot.desc&limit={limit}"
        ),
    )
    return response.json()


def load_report_run_archives(limit: int = 60) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "report_runs?"
            "select=run_key,report_date,report_slot,timestamp,window_label,window_start,window_end,risk_level,metrics,briefing"
            f"&order=report_date.desc,report_slot.desc&limit={limit}"
        ),
    )
    return response.json()


def load_articles_for_report_slot(report_date: str, report_slot: str, limit: int = 5000) -> list[dict]:
    if not is_enabled() or not report_date or not report_slot:
        return []
    response = request(
        "GET",
        (
            "news_articles?"
            "select=article_hash,report_date,report_slot,window_label,risk_level,title,link,source,"
            "keyword,summary,pub_date,pub_date_raw,score,category,tone,cluster_size,status"
            f"&report_date=eq.{quote(report_date, safe='')}"
            f"&report_slot=eq.{quote(str(report_slot).zfill(2), safe='')}"
            f"&order=score.desc&limit={limit}"
        ),
    )
    return response.json()


def load_dashboard_notifications(limit: int = 80) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "notification_sends?"
            "select=id,sent_at,channel,message_type,title,body,link_url,status,error,created_at"
            f"&order=sent_at.desc&limit={limit}"
        ),
    )
    return response.json()


def load_dashboard_watch_runs(limit: int = 20) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "negative_watch_runs?"
            "select=run_key,scanned_at,minutes_back,scanned_count,negative_count,new_negative_count,status,message"
            f"&order=scanned_at.desc&limit={limit}"
        ),
    )
    return response.json()


def load_dashboard_scraps(limit: int = 100) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        (
            "article_scraps?"
            "select=article_hash,article_snapshot,created_at"
            f"&order=created_at.desc&limit={limit}"
        ),
    )
    return response.json()


def load_monitor_keyword_rows() -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        "monitor_keywords?select=keyword,category,enabled&enabled=eq.true&order=category.asc,created_at.asc",
    )
    rows = []
    for row in response.json():
        keyword = str(row.get("keyword") or "").strip()
        if not keyword:
            continue
        rows.append(
            {
                "keyword": keyword,
                "category": row.get("category") or "other",
                "enabled": row.get("enabled", True) is not False,
            }
        )
    return rows


def load_press_alias_rows(limit: int = 1000) -> list[dict]:
    if not is_enabled():
        return []
    response = request(
        "GET",
        f"press_aliases?select=host,press_name&order=press_name.asc,host.asc&limit={limit}",
    )
    rows = []
    for row in response.json():
        host = str(row.get("host") or "").strip().lower()
        press_name = str(row.get("press_name") or "").strip()
        if not host or not press_name:
            continue
        rows.append({"host": host, "press_name": press_name})
    return rows


def load_monitor_profile() -> dict:
    if not is_enabled():
        return {}
    response = request(
        "GET",
        "monitor_profiles?select=profile_key,profile,updated_at,updated_by&profile_key=eq.default&limit=1",
    )
    rows = response.json()
    if not rows:
        return {}
    row = rows[0]
    profile = row.get("profile") if isinstance(row.get("profile"), dict) else {}
    return {
        **profile,
        "updatedAt": row.get("updated_at") or profile.get("updatedAt"),
        "updatedBy": row.get("updated_by") or profile.get("updatedBy"),
    }


def load_monitor_keywords() -> list[str]:
    keywords = []
    seen = set()
    for row in load_monitor_keyword_rows():
        keyword = row["keyword"]
        if keyword in seen:
            continue
        seen.add(keyword)
        keywords.append(keyword)
    return keywords
