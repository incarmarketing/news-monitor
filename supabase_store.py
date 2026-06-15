"""Optional Supabase persistence for collected monitoring data."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

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
    "own_mentioned",
    "negative_target",
    "classification_evidence",
    "classification_reason",
    "classification_confidence",
    "classification_provider",
    "clipping_recommended",
    "clipping_reason",
    "cluster_size",
    "raw",
)

LEGACY_ARTICLE_COLUMNS = tuple(
    column
    for column in ARTICLE_COLUMNS
    if column
    not in {
        "own_mentioned",
        "negative_target",
        "classification_evidence",
        "classification_reason",
        "classification_confidence",
        "classification_provider",
        "clipping_recommended",
        "clipping_reason",
    }
)

NOTIFICATION_COLUMNS = (
    "sent_at",
    "channel",
    "message_type",
    "dedupe_key",
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

RISK_RESPONSE_DRAFT_COLUMNS = (
    "article_hash",
    "draft_type",
    "title",
    "link",
    "source",
    "tone",
    "risk_level",
    "issue",
    "draft",
    "status",
    "model",
    "context",
    "created_by",
)

GA_COMPANY_COLUMNS = (
    "name",
    "short_name",
    "display_order",
    "active",
    "source_note",
)

GA_DISCLOSURE_COLUMNS = (
    "company_name",
    "stand_mm",
    "period_label",
    "planners",
    "stay_rate",
    "retention_13_life",
    "retention_13_nonlife",
    "retention_25_life",
    "retention_25_nonlife",
    "poor_sales_life",
    "poor_sales_nonlife",
    "withdrawal_life",
    "withdrawal_nonlife",
    "source_url",
    "source_payload",
)

GA_REVENUE_COLUMNS = (
    "company_name",
    "period_key",
    "period_label",
    "amount_krw_100m",
    "operating_profit_krw_100m",
    "net_income_krw_100m",
    "status",
    "source_label",
    "source_url",
    "note",
    "confirmed_at",
)

GA_MARKET_COLUMNS = (
    "stand_mm",
    "period_label",
    "companies_count",
    "total_planners",
    "stay_rate",
    "retention_13_life",
    "retention_13_nonlife",
    "retention_25_life",
    "retention_25_nonlife",
    "poor_sales_life",
    "poor_sales_nonlife",
)

GA_COLLECT_RUN_COLUMNS = (
    "run_key",
    "job_type",
    "stand_mm",
    "status",
    "message",
    "rows_collected",
    "started_at",
    "finished_at",
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
    extra_headers = kwargs.pop("headers", None) or {}
    request_headers = headers()
    request_headers.update(extra_headers)
    response = requests.request(
        method,
        f"{base_url()}/rest/v1/{path}",
        headers=request_headers,
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


def load_classification_feedback_rows(limit: int = 500) -> list[dict]:
    """Return recent manual classification corrections for the operations ledger."""
    if not is_enabled():
        return []
    query = (
        "classification_feedback?"
        "select=id,article_hash,title,link,previous_category,previous_tone,corrected_category,corrected_tone,reason,created_by,created_at"
        "&order=created_at.desc"
        f"&limit={limit}"
    )
    try:
        rows = request("GET", query).json()
    except Exception as error:
        print(f"Supabase classification feedback rows skipped: {error}")
        return []
    if not isinstance(rows, list):
        return []
    sanitized: list[dict] = []
    for row in rows:
        title = str(row.get("title") or "").strip()
        article_hash_value = str(row.get("article_hash") or "").strip()
        link = str(row.get("link") or "").strip()
        if not title and not article_hash_value and not link:
            continue
        sanitized.append(
            {
                "id": row.get("id"),
                "article_hash": article_hash_value,
                "title": title,
                "link": link,
                "previous_category": row.get("previous_category") or "",
                "previous_tone": row.get("previous_tone") or "",
                "corrected_category": row.get("corrected_category") or "",
                "corrected_tone": row.get("corrected_tone") or "",
                "reason": row.get("reason") or "",
                "created_by": "운영자" if row.get("created_by") else "",
                "created_at": row.get("created_at") or "",
            }
        )
    return sanitized


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


def load_article_analysis_cache(articles: list[dict], batch_size: int = 80) -> dict[str, dict]:
    """Return existing article analysis keyed by article_hash.

    This keeps scheduled jobs light: previously analyzed articles reuse stored
    classification/summary values instead of spending AI tokens again.
    """
    if not is_enabled() or not articles:
        return {}
    hashes = []
    for article in articles:
        try:
            value = article_hash(article)
        except Exception:
            continue
        if value:
            hashes.append(value)
    hashes = list(dict.fromkeys(hashes))
    if not hashes:
        return {}

    columns = (
        "article_hash,title,link,source,keyword,summary,score,category,tone,"
        "own_mentioned,negative_target,classification_evidence,classification_reason,"
        "classification_confidence,classification_provider,clipping_recommended,clipping_reason,"
        "raw,created_at"
    )
    fallback_columns = "article_hash,title,link,source,keyword,summary,score,category,tone,raw,created_at"
    result: dict[str, dict] = {}
    for index in range(0, len(hashes), batch_size):
        batch = hashes[index : index + batch_size]
        hash_filter = ",".join(batch)
        try:
            rows = request(
                "GET",
                "news_articles?"
                f"select={columns}"
                f"&article_hash=in.({quote(hash_filter, safe=',')})"
                "&order=created_at.desc",
            ).json()
        except Exception as error:
            try:
                rows = request(
                    "GET",
                    "news_articles?"
                    f"select={fallback_columns}"
                    f"&article_hash=in.({quote(hash_filter, safe=',')})"
                    "&order=created_at.desc",
                ).json()
            except Exception as fallback_error:
                print(f"Supabase article analysis cache skipped: {error}; fallback: {fallback_error}")
                continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            key = str(row.get("article_hash") or "").strip()
            if key and key not in result:
                result[key] = row
    return result


def apply_article_analysis_cache(article: dict, cache_index: dict[str, dict]) -> bool:
    if not cache_index or article.get("_feedback_applied"):
        return False
    try:
        key = article_hash(article)
    except Exception:
        return False
    row = cache_index.get(key)
    if not row:
        return False

    category = str(row.get("category") or "").strip()
    tone = str(row.get("tone") or "").strip()
    summary = str(row.get("summary") or "").strip()
    if category not in analyzer.AI_CONTEXT_CATEGORIES - {"exclude"}:
        category = ""
    if tone not in analyzer.AI_CONTEXT_TONES - {"exclude"}:
        tone = ""
    if not category and not tone and not summary:
        return False

    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    cached_context = raw.get("_ai_context") if isinstance(raw.get("_ai_context"), dict) else raw.get("ai_context")
    cached_context = cached_context if isinstance(cached_context, dict) else {}
    context = {
        **cached_context,
        "category": category or cached_context.get("category") or article.get("_category") or article.get("category") or "",
        "tone": tone or cached_context.get("tone") or article.get("_tone") or article.get("tone") or "",
        "own_mentioned": row.get("own_mentioned", cached_context.get("own_mentioned")),
        "negative_target": row.get("negative_target") or cached_context.get("negative_target") or "none",
        "evidence": row.get("classification_evidence") or cached_context.get("evidence") or "",
        "reason": row.get("classification_reason") or cached_context.get("reason") or "",
        "confidence": row.get("classification_confidence") or cached_context.get("confidence") or 0,
        "provider": row.get("classification_provider") or cached_context.get("provider") or "news_articles_cache",
        "clipping_recommended": row.get("clipping_recommended", cached_context.get("clipping_recommended")),
        "clipping_reason": row.get("clipping_reason") or cached_context.get("clipping_reason") or "",
    }
    if category:
        article["_category"] = category
        article["category"] = category
    if tone:
        article["_tone"] = tone
        article["tone"] = tone
    if summary:
        article["_summary"] = summary
    if row.get("score") is not None:
        article["_cached_score"] = row.get("score")
    article["_ai_context"] = context
    article["_analysis_cache_applied"] = True
    article["_analysis_cache_source"] = "news_articles"
    return True


def apply_cached_analysis_to_articles(
    articles: list[dict],
    cache_index: dict[str, dict] | None = None,
) -> int:
    cache_index = cache_index if cache_index is not None else load_article_analysis_cache(articles)
    if not cache_index:
        return 0
    applied = 0
    for article in articles:
        if apply_article_analysis_cache(article, cache_index):
            applied += 1
    if applied:
        print(f"Article analysis cache applied: {applied} article(s)")
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
        save_news_article_rows(rows)
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
        save_news_article_rows(rows)
        save_own_media_relations(rows)


def save_risk_response_drafts(rows: list[dict]) -> None:
    """Persist AI-generated risk response drafts for dashboard review."""
    if not is_enabled() or not rows:
        return
    payload = []
    for row in rows:
        article = row.get("article") if isinstance(row.get("article"), dict) else {}
        article_key = str(row.get("article_hash") or "").strip()
        if not article_key and article:
            article_key = article_hash(article)
        title = str(row.get("title") or article.get("title") or "").strip()
        draft = str(row.get("draft") or "").strip()
        draft_type = str(row.get("draft_type") or "").strip()
        if not article_key or not title or not draft or draft_type not in {"press", "internal"}:
            continue
        payload.append(
            {
                "article_hash": article_key,
                "draft_type": draft_type,
                "title": title,
                "link": str(row.get("link") or article.get("link") or "").strip(),
                "source": str(row.get("source") or article.get("source") or "").strip(),
                "tone": str(row.get("tone") or article.get("_tone") or article.get("tone") or "negative").strip() or "negative",
                "risk_level": str(row.get("risk_level") or article.get("risk_level") or "MEDIUM").strip() or "MEDIUM",
                "issue": str(row.get("issue") or "").strip(),
                "draft": draft,
                "status": str(row.get("status") or "draft").strip() or "draft",
                "model": str(row.get("model") or "").strip(),
                "context": row.get("context") if isinstance(row.get("context"), dict) else {},
                "created_by": str(row.get("created_by") or "negative_watch").strip() or "negative_watch",
            }
        )
    if not payload:
        return
    request(
        "POST",
        "risk_response_drafts?on_conflict=article_hash,draft_type",
        data=json.dumps([{column: row.get(column) for column in RISK_RESPONSE_DRAFT_COLUMNS} for row in payload], ensure_ascii=False),
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def save_ga_competitor_intel(
    *,
    companies: list[dict] | None = None,
    disclosure_metrics: list[dict] | None = None,
    revenue_metrics: list[dict] | None = None,
    market_metrics: list[dict] | None = None,
    collect_run: dict | None = None,
) -> None:
    """Persist GA competitor disclosure and revenue metrics."""
    if not is_enabled():
        return

    if companies:
        rows = [{column: row.get(column) for column in GA_COMPANY_COLUMNS} for row in companies if row.get("name")]
        if rows:
            request(
                "POST",
                "ga_companies?on_conflict=name",
                data=json.dumps(rows, ensure_ascii=False),
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    if market_metrics:
        rows = [{column: row.get(column) for column in GA_MARKET_COLUMNS} for row in market_metrics if row.get("stand_mm")]
        if rows:
            request(
                "POST",
                "ga_market_metrics?on_conflict=stand_mm",
                data=json.dumps(rows, ensure_ascii=False),
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    if disclosure_metrics:
        rows = [
            {column: row.get(column) for column in GA_DISCLOSURE_COLUMNS}
            for row in disclosure_metrics
            if row.get("company_name") and row.get("stand_mm")
        ]
        if rows:
            request(
                "POST",
                "ga_disclosure_metrics?on_conflict=company_name,stand_mm",
                data=json.dumps(rows, ensure_ascii=False),
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    if revenue_metrics:
        rows = [
            {column: row.get(column) for column in GA_REVENUE_COLUMNS if column in row and row.get(column) is not None}
            for row in revenue_metrics
            if row.get("company_name") and row.get("period_key")
        ]
        if rows:
            request(
                "POST",
                "ga_revenue_metrics?on_conflict=company_name,period_key",
                data=json.dumps(rows, ensure_ascii=False),
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    if collect_run:
        row = {column: collect_run.get(column) for column in GA_COLLECT_RUN_COLUMNS}
        if row.get("run_key"):
            request(
                "POST",
                "ga_collect_runs?on_conflict=run_key",
                data=json.dumps([row], ensure_ascii=False),
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )


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
    dedupe_key: str | None = None,
    require_log: bool | None = None,
) -> None:
    if not is_enabled():
        return
    normalized_status = str(status or "").lower()
    key = dedupe_key if dedupe_key is not None else notification_dedupe_key(
        message_type,
        title,
        normalized_status,
        channel=channel,
    )
    key = str(key or "").strip() or None
    row = {
        "sent_at": sent_at or datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "message_type": message_type,
        "dedupe_key": key,
        "title": title,
        "body": body,
        "link_url": link_url,
        "status": status,
        "error": error,
        "provider_response": provider_response or {},
    }
    must_log = require_log
    if must_log is None:
        must_log = normalized_status == "success" and message_type in {"daily_report", "negative_alert"}
    path = "notification_sends"
    request_headers: dict[str, str] = {}
    if key:
        path = "notification_sends?on_conflict=dedupe_key"
        request_headers["Prefer"] = "resolution=merge-duplicates"
    try:
        request(
            "POST",
            path,
            data=json.dumps([{column: row.get(column) for column in NOTIFICATION_COLUMNS}], ensure_ascii=False),
            headers=request_headers,
        )
    except Exception as exc:
        text = str(exc)
        if key and ("dedupe_key" in text and ("schema cache" in text or "column" in text)):
            legacy_row = {column: row.get(column) for column in NOTIFICATION_COLUMNS if column != "dedupe_key"}
            try:
                request("POST", "notification_sends", data=json.dumps([legacy_row], ensure_ascii=False))
                print("Supabase notification log used legacy schema without dedupe_key.")
                return
            except Exception as legacy_exc:
                text = str(legacy_exc)
                exc = legacy_exc
        if key and notification_dedupe_key_exists(key, channel=channel):
            print(f"Supabase notification log already exists: {key}")
            return
        print(f"Supabase notification log failed: {exc}")
        if must_log:
            raise


def notification_dedupe_key(message_type: str, title: str, status: str = "success", *, channel: str = "") -> str:
    clean_type = re.sub(r"\s+", " ", str(message_type or "").strip())
    clean_title = re.sub(r"\s+", " ", str(title or "").strip())
    clean_channel = re.sub(r"\s+", " ", str(channel or "").strip().lower())
    prefix = f"{clean_channel}:" if clean_channel and clean_channel != "kakao" else ""
    if not clean_type or not clean_title:
        return ""
    if str(status or "").lower() != "success":
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        digest = hashlib.sha256(f"{clean_type}:{clean_title}:{status}:{stamp}".encode("utf-8")).hexdigest()[:12]
        return f"{prefix}{clean_type}:{clean_title}:{status}:{digest}"
    return f"{prefix}{clean_type}:{clean_title}"


def notification_dedupe_key_exists(dedupe_key: str, *, channel: str | None = None) -> bool:
    if not is_enabled() or not dedupe_key:
        return False
    try:
        channel_filter = f"&channel=eq.{quote(str(channel), safe='')}" if channel else ""
        rows = request(
            "GET",
            "notification_sends?select=id"
            f"&dedupe_key=eq.{quote(dedupe_key, safe='')}"
            f"{channel_filter}"
            "&limit=1",
        ).json()
        return bool(rows)
    except Exception:
        return False


def notification_already_sent(
    message_type: str,
    title: str,
    status: str = "success",
    *,
    strict: bool = False,
    channel: str | None = None,
) -> bool:
    """Return True when the same notification title already has a successful send log."""
    if not is_enabled() or not message_type or not title:
        return False
    dedupe_key = notification_dedupe_key(message_type, title, status, channel=channel or "")
    if dedupe_key and notification_dedupe_key_exists(dedupe_key, channel=channel):
        return True
    channel_filter = f"&channel=eq.{quote(str(channel), safe='')}" if channel else ""
    query = (
        "notification_sends?select=id"
        f"&message_type=eq.{quote(message_type, safe='')}"
        f"&title=eq.{quote(title, safe='')}"
        f"&status=eq.{quote(status, safe='')}"
        f"{channel_filter}"
        "&limit=1"
    )
    try:
        rows = request("GET", query).json()
        return bool(rows)
    except Exception as error:
        print(f"Supabase notification duplicate check skipped: {error}")
        if strict:
            raise
        return False


def repair_daily_notification_links(base_url: str = "https://incarmarketing.github.io/news-monitor/") -> int:
    """Point legacy daily notification rows at their stable report HTML files."""
    if not is_enabled():
        return 0
    rows = load_dashboard_notifications(limit=200)
    fixed = 0
    for row in rows:
        if str(row.get("status") or "").lower() != "success":
            continue
        if "daily" not in str(row.get("message_type") or row.get("type") or ""):
            continue
        date_slot = daily_notification_date_slot(row)
        if not date_slot:
            continue
        date_value, slot = date_slot
        expected_url = stable_daily_report_url(base_url, date_value, slot)
        current_link = str(row.get("link_url") or "")
        title = str(row.get("title") or "")
        update: dict[str, str] = {}
        if current_link != expected_url:
            update["link_url"] = expected_url
        if not re.search(r"(20\d{2}-\d{2}-\d{2})\s+\d{2}", title):
            update["title"] = re.sub(r"(20\d{2}-\d{2}-\d{2})", rf"\1 {slot}", title, count=1)
        if not update:
            continue
        try:
            request(
                "PATCH",
                f"notification_sends?id=eq.{quote(str(row.get('id')), safe='')}",
                data=json.dumps(update, ensure_ascii=False),
            )
            fixed += 1
        except Exception as error:
            print(f"Supabase notification link repair skipped for {row.get('id')}: {error}")
    return fixed


def daily_notification_date_slot(row: dict) -> tuple[str, str] | None:
    title = str(row.get("title") or "")
    link = str(row.get("link_url") or "")
    match = re.search(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2})", title)
    if match:
        return match.group(1), match.group(2)
    date_match = re.search(r"(20\d{2}-\d{2}-\d{2})", title)
    date_value = date_match.group(1) if date_match else ""
    if not date_value:
        return None
    slot = infer_notification_slot(row, link)
    return (date_value, slot) if slot else None


def infer_notification_slot(row: dict, link: str) -> str:
    parsed = urlparse(link)
    query = parse_qs(parsed.query)
    version = (query.get("v") or [""])[0]
    if re.match(r"^\d{12,14}$", version):
        hour = int(version[8:10])
    else:
        sent_at = str(row.get("sent_at") or row.get("created_at") or "")
        try:
            hour = datetime.fromisoformat(sent_at.replace("Z", "+00:00")).astimezone(KST).hour
        except ValueError:
            return ""
    if 5 <= hour <= 10:
        return "08"
    if 11 <= hour <= 15:
        return "13"
    return "18"


def stable_daily_report_url(base_url: str, date_value: str, slot: str) -> str:
    clean = (base_url or "https://incarmarketing.github.io/news-monitor/").split("?", 1)[0]
    if clean.endswith(".html"):
        clean = clean.rsplit("/", 1)[0] + "/"
    if not clean.endswith("/"):
        clean += "/"
    return f"{clean}reports/daily/{date_value}-{str(slot).zfill(2)}.html"


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
        "keyword,summary,pub_date,pub_date_raw,score,category,tone,cluster_size,status,created_at,raw"
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
    context = normalized_article_context(article)
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
        "own_mentioned": context.get("own_mentioned"),
        "negative_target": context.get("negative_target", ""),
        "classification_evidence": context.get("evidence", ""),
        "classification_reason": context.get("reason", ""),
        "classification_confidence": context.get("confidence", 0),
        "classification_provider": context.get("provider", ""),
        "clipping_recommended": context.get("clipping_recommended", False),
        "clipping_reason": context.get("clipping_reason", ""),
        "cluster_size": article.get("_cluster_size", 1),
        "raw": article,
    }
    return {key: row.get(key) for key in ARTICLE_COLUMNS}


def normalized_article_context(article: dict) -> dict:
    context = article.get("_ai_context") if isinstance(article.get("_ai_context"), dict) else {}
    if not context and isinstance(article.get("ai_context"), dict):
        context = article.get("ai_context")
    own_mentioned = context.get("own_mentioned")
    if own_mentioned is None:
        own_mentioned = analyzer.is_own_article(article)
    return {
        "own_mentioned": bool(own_mentioned),
        "negative_target": str(context.get("negative_target") or "none").strip() or "none",
        "evidence": str(context.get("evidence") or "").strip(),
        "reason": str(context.get("reason") or "").strip(),
        "confidence": safe_float(context.get("confidence"), 0),
        "provider": str(context.get("provider") or "").strip(),
        "clipping_recommended": bool(context.get("clipping_recommended") or False),
        "clipping_reason": str(context.get("clipping_reason") or "").strip(),
    }


def safe_float(value: object, default: float = 0) -> float:
    try:
        number = float(value)
        return number if number == number else default
    except (TypeError, ValueError):
        return default


def save_news_article_rows(rows: list[dict]) -> None:
    """Persist articles with a legacy fallback while migration rolls out."""
    try:
        request("POST", "news_articles?on_conflict=article_hash", data=json.dumps(rows, ensure_ascii=False))
    except requests.HTTPError as error:
        detail = str(error)
        missing_column = (
            "classification_evidence" in detail
            or "clipping_recommended" in detail
            or "own_mentioned" in detail
            or "negative_target" in detail
        )
        if not missing_column:
            raise
        legacy_rows = [{column: row.get(column) for column in LEGACY_ARTICLE_COLUMNS} for row in rows]
        print("Supabase news_articles context columns missing; retried with legacy article payload.")
        request("POST", "news_articles?on_conflict=article_hash", data=json.dumps(legacy_rows, ensure_ascii=False))


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
            "select=id,sent_at,channel,message_type,dedupe_key,title,body,link_url,status,error,created_at"
            "&channel=eq.slack"
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


def load_monitor_context_rules() -> list[dict]:
    if not is_enabled():
        return []
    try:
        response = request(
            "GET",
            (
                "monitor_context_rules?"
                "select=rule_key,label,category,tone,trigger_terms,required_terms,exclude_terms,priority,enabled"
                "&enabled=eq.true&order=priority.asc,rule_key.asc"
            ),
        )
    except requests.HTTPError as error:
        status = getattr(error.response, "status_code", None)
        if status in {400, 404}:
            return []
        raise
    rows = []
    for row in response.json():
        if not isinstance(row, dict):
            continue
        rows.append(
            {
                "rule_key": str(row.get("rule_key") or "").strip(),
                "label": str(row.get("label") or "").strip(),
                "category": row.get("category") or "other",
                "tone": row.get("tone") or "neutral",
                "trigger_terms": row.get("trigger_terms") if isinstance(row.get("trigger_terms"), list) else [],
                "required_terms": row.get("required_terms") if isinstance(row.get("required_terms"), list) else [],
                "exclude_terms": row.get("exclude_terms") if isinstance(row.get("exclude_terms"), list) else [],
                "priority": row.get("priority") or 100,
                "enabled": row.get("enabled", True) is not False,
            }
        )
    return rows


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
