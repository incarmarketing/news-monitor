"""Watch for new negative articles that directly mention the company.

This is intentionally separate from the scheduled daily report. The daily report
summarizes a time window; this watcher stays quiet unless a new company-negative
article appears.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from dotenv import load_dotenv

import analyzer
import config
import news_collector
import slack_notify
from supabase_store import (
    apply_classification_feedback_to_articles,
    article_hash as supabase_article_hash,
    load_latest_negative_watch_run,
    load_recent_negative_articles,
    notification_already_sent,
    save_dashboard_articles,
    save_negative_watch_run,
    save_notification_send,
    save_risk_response_drafts,
)

KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).parent
STATE_DIR = BASE_DIR / ".watch-state"
STATE_PATH = STATE_DIR / "negative_alerts.json"
DASHBOARD_REFRESH_STATE_PATH = STATE_DIR / "dashboard_refresh.json"
MAX_SENT_KEYS = 500
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def github_output(name: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as file:
            file.write(f"{name}={value}\n")
    print(f"{name}={value}")


def now_kst() -> datetime:
    return datetime.now(KST)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except ValueError:
        return None


def effective_minutes_back(default_minutes: int, current: datetime | None = None) -> int:
    current = current or now_kst()
    max_catchup = max(default_minutes, int(os.getenv("NEGATIVE_WATCH_MAX_CATCHUP_MINUTES", "1440")))
    try:
        latest = load_latest_negative_watch_run()
    except Exception as error:
        print("Negative watch latest-run lookup skipped:", error)
        return default_minutes

    latest_at = parse_datetime(str(latest.get("scanned_at", "")) if latest else "")
    if not latest_at:
        return default_minutes

    elapsed_minutes = math.ceil((current.astimezone(timezone.utc) - latest_at).total_seconds() / 60) + 1
    if elapsed_minutes <= default_minutes:
        return default_minutes
    return min(max(default_minutes, elapsed_minutes), max_catchup)


def is_active_time(current: datetime | None = None) -> bool:
    """Return whether the watcher should run now.

    Defaults to 24/7. Set NEGATIVE_WATCH_DAYS=weekdays and/or
    NEGATIVE_WATCH_START_HOUR / NEGATIVE_WATCH_END_HOUR to narrow the window.
    """
    if os.getenv("NEGATIVE_WATCH_ALWAYS_ON", "").lower() in {"1", "true", "yes", "y"}:
        return True

    current = current or now_kst()
    days = os.getenv("NEGATIVE_WATCH_DAYS", "all").lower()
    if days in {"weekday", "weekdays", "business"} and current.weekday() >= 5:
        return False

    start_hour = int(os.getenv("NEGATIVE_WATCH_START_HOUR", "0"))
    end_hour = int(os.getenv("NEGATIVE_WATCH_END_HOUR", "23"))
    if start_hour <= end_hour:
        return start_hour <= current.hour <= end_hour
    return current.hour >= start_hour or current.hour <= end_hour


def load_state() -> dict:
    STATE_DIR.mkdir(exist_ok=True)
    if not STATE_PATH.exists():
        return {"sent_keys": [], "alerts": []}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"sent_keys": [], "alerts": []}


def save_state(state: dict) -> None:
    sent_keys = state.get("sent_keys", [])
    state["sent_keys"] = sent_keys[-MAX_SENT_KEYS:]
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def load_dashboard_refresh_state() -> dict:
    STATE_DIR.mkdir(exist_ok=True)
    if not DASHBOARD_REFRESH_STATE_PATH.exists():
        return {}
    try:
        return json.loads(DASHBOARD_REFRESH_STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_dashboard_refresh_state(state: dict) -> None:
    DASHBOARD_REFRESH_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def dashboard_refresh_interval_minutes() -> int:
    value = os.getenv("NEGATIVE_WATCH_DASHBOARD_REFRESH_MINUTES", "15").strip()
    try:
        return max(0, int(value))
    except ValueError:
        return 15


def dashboard_refresh_due(scanned_at: str, *, negative_count: int, new_negative_count: int, status: str) -> bool:
    mode = os.getenv("NEGATIVE_WATCH_DASHBOARD_REFRESH", "throttled").strip().lower()
    if mode in {"0", "false", "no", "never", "off"} or status in {"skipped", "dry_run"}:
        return False

    interval = dashboard_refresh_interval_minutes()
    state = load_dashboard_refresh_state()
    last_refresh = parse_datetime(str(state.get("last_refresh_at", "")))
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)

    interval_due = not last_refresh or (interval > 0 and (current - last_refresh).total_seconds() >= interval * 60)
    should_refresh = mode == "always" or new_negative_count > 0 or status in {"alert_sent", "alert_failed"}
    if not should_refresh and interval > 0:
        should_refresh = interval_due
    if not should_refresh and negative_count > 0:
        should_refresh = interval_due

    if should_refresh:
        save_dashboard_refresh_state(
            {
                "last_refresh_at": scanned_at,
                "status": status,
                "new_negative_count": new_negative_count,
            }
        )
    return should_refresh


def article_key(article: dict) -> str:
    raw = article.get("link") or article.get("article_hash") or article.get("title", "")
    normalized = re.sub(r"\s+", " ", raw).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]


def collect_recent_company_news(minutes_back: int) -> list[dict]:
    articles: list[dict] = []
    for keyword in analyzer.OWN_NAMES:
        articles.extend(news_collector.fetch_naver_news(keyword))
        articles.extend(news_collector.fetch_google_news(keyword))

    articles = news_collector.deduplicate(articles)
    articles = news_collector.apply_exclude_filter(articles)
    articles = news_collector.apply_recency_filter(articles, max(1, (minutes_back + 59) // 60))
    articles = [article for article in articles if is_within_minutes(article, minutes_back)]
    return articles


def is_within_minutes(article: dict, minutes_back: int) -> bool:
    parsed = news_collector.parse_pub_date(article.get("pub_date", ""))
    if not parsed:
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes_back)
    return parsed >= cutoff


def find_negative_articles(articles: list[dict]) -> tuple[list[dict], dict]:
    analyzed, metrics = analyzer.analyze(articles, top_n=max(len(articles), 1))
    if apply_classification_feedback_to_articles(analyzed):
        metrics = analyzer.build_metrics(analyzed, analyzed)
    negatives = [
        article
        for article in analyzed
        if analyzer.is_direct_own_negative_article(article)
    ]
    negatives.sort(key=lambda item: item.get("_score", 0), reverse=True)
    return negatives, metrics


def collect_recent_db_negatives(minutes_back: int) -> list[dict]:
    lookback = max(minutes_back, int(os.getenv("NEGATIVE_WATCH_DB_LOOKBACK_MINUTES", "30")))
    rows = load_recent_negative_articles(lookback)
    articles = []
    for row in rows:
        articles.append(
            {
                "article_hash": row.get("article_hash", ""),
                "title": row.get("title", ""),
                "link": row.get("link", ""),
                "description": row.get("summary", "") or row.get("raw", {}).get("description", ""),
                "summary": row.get("summary", ""),
                "source": row.get("source", ""),
                "keyword": row.get("keyword", ""),
                "pub_date": row.get("pub_date_raw") or row.get("pub_date", ""),
                "created_at": row.get("created_at", ""),
                "_category": row.get("category", "own"),
                "_tone": row.get("tone", "negative"),
                "_score": row.get("score", 0),
                "_cluster_size": row.get("cluster_size", 1),
                "_watch_source": "db",
                "_ai_context": (row.get("raw") or {}).get("_ai_context") or (row.get("raw") or {}).get("ai_context") or {},
            }
        )
    return articles


def merge_negative_candidates(*groups: list[dict]) -> list[dict]:
    seen: set[str] = set()
    merged: list[dict] = []
    for group in groups:
        for article in group:
            if analyzer.is_relief_support_article(article):
                continue
            key = article_key(article)
            if key in seen:
                continue
            seen.add(key)
            merged.append(article)
    return merged


def build_watch_window(scanned_at: str, minutes_back: int) -> dict:
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)
    start = current - timedelta(minutes=max(1, minutes_back))
    return {
        "slot": "watch",
        "label": f"부정기사 감시 최근 {minutes_back}분",
        "start": start.isoformat(),
        "end": current.isoformat(),
    }


def persist_negative_articles(articles: list[dict], metrics: dict, scanned_at: str, minutes_back: int) -> None:
    """Store watch-only detections so the dashboard can show the same articles."""
    if not articles:
        return
    current = parse_datetime(scanned_at) or datetime.now(timezone.utc)
    try:
        save_dashboard_articles(
            articles,
            report_date=current.astimezone(KST).date().isoformat(),
            window=build_watch_window(scanned_at, minutes_back),
            metrics={**(metrics or {}), "risk_level": "MEDIUM"},
        )
        print(f"Persisted negative watch articles: {len(articles)}")
    except Exception as error:
        print(f"Negative watch article persistence failed: {error}")
        if os.getenv("NEGATIVE_WATCH_REQUIRE_ARTICLE_PERSIST", "true").lower() in {"1", "true", "yes", "y"}:
            raise


def alert_state_articles(state: dict, limit: int = 30) -> list[dict]:
    """Rehydrate already-sent alert rows so legacy alerts also appear in the dashboard."""
    alerts = state.get("alerts", [])
    if not isinstance(alerts, list):
        return []
    rows: list[dict] = []
    for alert in alerts[-limit:]:
        title = str(alert.get("title") or "").strip()
        link = str(alert.get("link") or "").strip()
        if not title and not link:
            continue
        sent_at = str(alert.get("sent_at") or "").strip()
        rows.append(
            {
                "title": title or "부정기사 감시 알림 기사",
                "link": link,
                "source": alert.get("source", ""),
                "keyword": alert.get("keyword", ""),
                "pub_date": sent_at,
                "_summary": "부정기사 감시 알림으로 발송된 기사입니다. 원문 기준으로 사실관계를 확인합니다.",
                "_category": "own",
                "_tone": "negative",
                "_score": 950,
                "_cluster_size": 1,
                "_watch_source": "alert_state",
            }
        )
    return rows


def compact(text: str, limit: int) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 1].rstrip() + "…"


def dashboard_base_url() -> str:
    return (
        os.getenv("NEGATIVE_ALERT_DASHBOARD_URL")
        or os.getenv("DASHBOARD_URL")
        or "https://incarmarketing.github.io/news-monitor/dashboard.html"
    )


def clean_alert_title(value: object, limit: int = 80) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+-\s+[^-]{2,24}$", "", text).strip()
    if not text:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_alert_link(article: dict) -> str:
    """Open the shared dashboard and target the exact article when possible."""
    base = dashboard_base_url()
    split = urlsplit(base)
    params = dict(parse_qsl(split.query, keep_blank_values=True))
    params.update(
        {
            "section": "monitoring",
            "tone": "negative",
            "category": "own",
        }
    )

    title = clean_alert_title(article.get("title", "") or article.get("source", ""))
    if title:
        params["article_title"] = title
    if article.get("article_hash"):
        params["article"] = str(article["article_hash"]).strip()
    if article.get("link") and article.get("link") != "#":
        params["article_link"] = str(article["link"]).strip()

    # Legacy alerts used query=. Keep future alert links from putting article
    # summaries into the dashboard search box.
    params.pop("query", None)
    params.pop("q", None)
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(params), split.fragment))


def build_alert_message(articles: list[dict], metrics: dict, minutes_back: int, db_count: int = 0) -> str:
    current = now_kst().strftime("%Y-%m-%d %H:%M")
    scope = f"최근 {minutes_back}분"
    if db_count:
        scope += f" · DB 신규 {db_count}건 포함"
    lines = [
        "[부정기사 감지]",
        f"{current} 기준 · {scope}",
        f"당사 부정 {len(articles)}건 / 당사 언급 {metrics.get('own_total', 0)}건",
        "",
        "확인 필요 기사",
    ]
    for idx, article in enumerate(articles[:3], 1):
        source = (article.get("source") or "").upper()
        lines.append(f"{idx}. {compact(article.get('title', ''), 46)}")
        if source:
            lines.append(f"   출처 {source} · 키워드 {article.get('keyword', '')}")
    return "\n".join(lines)[:900]


def risk_draft_model() -> str:
    return (
        os.getenv("GEMINI_RISK_RESPONSE_MODEL")
        or os.getenv("GEMINI_EDGE_MODEL")
        or os.getenv("GEMINI_MODEL")
        or "gemini-2.5-pro"
    ).strip()


def risk_draft_article_limit() -> int:
    try:
        return max(1, int(os.getenv("NEGATIVE_WATCH_DRAFT_MAX_ARTICLES", "3")))
    except ValueError:
        return 3


def persist_risk_response_drafts(articles: list[dict], scanned_at: str) -> None:
    if not articles:
        return
    if os.getenv("NEGATIVE_WATCH_AUTO_DRAFTS", "true").lower() not in {"1", "true", "yes", "y"}:
        return
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("Risk response draft generation skipped: GEMINI_API_KEY is missing.")
        return

    model = risk_draft_model()
    rows: list[dict] = []
    for article in articles[: risk_draft_article_limit()]:
        issue = build_risk_draft_issue(article)
        for draft_type in ("press", "internal"):
            try:
                draft = request_risk_response_draft(
                    api_key=api_key,
                    model=model,
                    draft_type=draft_type,
                    issue=issue,
                    article=article,
                )
                status = "draft"
            except Exception as error:
                print(f"Gemini risk draft failed for {draft_type}: {error}")
                draft = fallback_risk_response_draft(draft_type, article, issue)
                status = "fallback"
            rows.append(
                {
                    "article_hash": supabase_article_hash(article),
                    "draft_type": draft_type,
                    "title": article.get("title", ""),
                    "link": article.get("link", ""),
                    "source": article.get("source", ""),
                    "tone": "negative",
                    "risk_level": article.get("risk_level") or "MEDIUM",
                    "issue": issue,
                    "draft": draft,
                    "status": status,
                    "model": model,
                    "context": {
                        "scanned_at": scanned_at,
                        "keyword": article.get("keyword", ""),
                        "summary": analyzer.build_quality_summary(article),
                        "ai_context": article.get("_ai_context") or {},
                    },
                    "created_by": "negative_watch",
                    "article": article,
                }
            )
    try:
        save_risk_response_drafts(rows)
        print(f"Persisted risk response drafts: {len(rows)}")
    except Exception as error:
        print(f"Risk response draft persistence failed: {error}")
        if os.getenv("NEGATIVE_WATCH_REQUIRE_DRAFT_PERSIST", "").lower() in {"1", "true", "yes", "y"}:
            raise


def build_risk_draft_issue(article: dict) -> str:
    title = clean_alert_title(article.get("title", ""), 140)
    source = str(article.get("source") or "").strip()
    keyword = str(article.get("keyword") or "").strip()
    summary = analyzer.build_quality_summary(article)
    description = re.sub(r"\s+", " ", str(article.get("description") or article.get("summary") or "")).strip()
    lines = [
        f"기사 제목: {title}",
        f"출처: {source or '확인 필요'}",
        f"키워드: {keyword or '확인 필요'}",
        f"핵심 요약: {summary}",
    ]
    if description and description != summary:
        lines.append(f"원문 단서: {compact(description, 360)}")
    return "\n".join(lines)


def request_risk_response_draft(*, api_key: str, model: str, draft_type: str, issue: str, article: dict) -> str:
    prompt = build_risk_draft_prompt(draft_type, issue, article)
    response = requests.post(
        GEMINI_GENERATE_URL.format(model=model),
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        data=json.dumps(
            {
                "systemInstruction": {
                    "parts": [
                        {
                            "text": (
                                "당신은 보험/GA 업계 언론홍보 리스크 대응 초안을 작성하는 한국어 PR 실무자입니다. "
                                "사실 확인 전 단정 표현, 법적 책임 인정처럼 보이는 표현, 기사 문장 복붙을 피하고 "
                                "확인 범위와 대응 원칙을 실무자가 바로 검토할 수 있게 씁니다."
                            )
                        }
                    ]
                },
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": int(os.getenv("GEMINI_RISK_RESPONSE_MAX_TOKENS", "3200")),
                },
            },
            ensure_ascii=False,
        ).encode("utf-8"),
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    draft = "\n".join(part.get("text", "") for part in parts).strip()
    if not draft:
        raise RuntimeError("empty_gemini_response")
    return normalize_generated_draft(draft)


def build_risk_draft_prompt(draft_type: str, issue: str, article: dict) -> str:
    purpose = (
        "언론 문의 대응용 공식 입장 초안"
        if draft_type == "press"
        else "사내 공유 및 임원 보고용 대응 메모"
    )
    sections = (
        "입장 요지 / 확인 중인 사항 / 당사 대응 방향 / 기자 문의 응대 문구"
        if draft_type == "press"
        else "이슈 개요 / 리스크 판단 / 확인 필요 사항 / 즉시 조치 / 대외 커뮤니케이션 원칙"
    )
    return "\n".join(
        [
            f"목적: {purpose}",
            "회사: 인카금융서비스",
            f"작성일: {now_kst().strftime('%Y-%m-%d')}",
            f"기사 URL: {article.get('link') or '확인 필요'}",
            "",
            "기사 정보:",
            issue,
            "",
            "작성 조건:",
            "- Markdown 제목 기호(#, **, ---) 없이 작성",
            "- 기사 제목을 반복하지 말고 쟁점의 성격을 먼저 정의",
            "- 당사가 직접 언급된 부정 보도라는 전제로 사실 확인 범위를 분리",
            "- 불확실한 내용은 '확인 중' 또는 '확인 필요'로 표현",
            "- 법적 책임 인정, 사과, 유감 표명은 사실 확인 전 쓰지 않음",
            "- 각 항목은 2~4개 불릿, 문장은 끝까지 완결",
            "- 언론용은 외부 전달 가능 표현, 사내용은 담당부서 행동 중심",
            f"- 항목 구성: {sections}",
        ]
    )


def normalize_generated_draft(value: str) -> str:
    text = re.sub(r"\*\*|^#{1,6}\s*|---+", "", value, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fallback_risk_response_draft(draft_type: str, article: dict, issue: str) -> str:
    title = clean_alert_title(article.get("title", ""), 120) or "부정 보도"
    if draft_type == "press":
        return "\n".join(
            [
                "[입장 요지]",
                f"- '{title}' 보도와 관련해 기사에 제기된 사안의 사실관계를 확인하고 있습니다.",
                "- 확인 전 단계에서 단정적 입장 표명은 지양하되, 필요한 자료는 신속히 점검하겠습니다.",
                "",
                "[확인 중인 사항]",
                "- 기사에 언급된 당사 관련 수치, 행위, 이해관계자 범위를 확인합니다.",
                "- 반복 보도 여부와 원문 출처, 보도 확산 경로를 함께 확인합니다.",
                "",
                "[문의 대응 문구]",
                "- 현재 관련 내용을 확인 중이며, 확인된 사실에 근거해 필요한 설명을 드리겠습니다.",
            ]
        )
    return "\n".join(
        [
            "[이슈 개요]",
            f"- '{title}' 보도가 감지되어 당사 관련 사실관계 확인이 필요합니다.",
            "",
            "[리스크 판단]",
            "- 당사명이 직접 언급된 부정 보도이므로 기사 원문, 수치, 반복 보도 여부를 우선 확인합니다.",
            "",
            "[즉시 조치]",
            "- 원문 저장, 기사 내 당사 관련 문장 추출, 유관부서 사실 확인 요청을 진행합니다.",
            "- 외부 문의가 있을 경우 확인 중인 범위와 확인 완료 후 안내 가능 항목을 구분해 응대합니다.",
        ]
    )


def send_slack_alert(text: str, link_url: str, article: dict) -> dict:
    title = clean_alert_title(article.get("title", ""), 100) or "부정/주의 기사 감지"
    article_url = str(article.get("link") or "").strip()
    return slack_notify.send_alert(text, link_url, title=title, article_url=article_url)


def mark_alerts_sent(state: dict, sent: set[str], articles: list[dict], sent_at: str) -> None:
    for article in articles:
        key = article_key(article)
        sent.add(key)
        state.setdefault("alerts", []).append(
            {
                "sent_at": sent_at,
                "key": key,
                "title": article.get("title", ""),
                "link": article.get("link", ""),
                "source": article.get("source", ""),
                "keyword": article.get("keyword", ""),
            }
        )
    state["sent_keys"] = list(sent)
    state["alerts"] = state.get("alerts", [])[-MAX_SENT_KEYS:]


def record_watch_run(
    *,
    scanned_at: str,
    minutes_back: int,
    scanned_count: int,
    negative_count: int,
    new_negative_count: int,
    status: str,
    message: str = "",
) -> None:
    try:
        save_negative_watch_run(
            run_key=f"negative-watch-{scanned_at[:16]}",
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=scanned_count,
            negative_count=negative_count,
            new_negative_count=new_negative_count,
            status=status,
            message=message,
        )
    except Exception as error:
        print("Negative watch Supabase log failed:", error)
        if os.getenv("NEGATIVE_WATCH_REQUIRE_DB_LOG", "").lower() in {"1", "true", "yes", "y"}:
            raise


def finish_watch_run(
    *,
    scanned_at: str,
    minutes_back: int,
    scanned_count: int,
    negative_count: int,
    new_negative_count: int,
    status: str,
    message: str = "",
) -> None:
    record_watch_run(
        scanned_at=scanned_at,
        minutes_back=minutes_back,
        scanned_count=scanned_count,
        negative_count=negative_count,
        new_negative_count=new_negative_count,
        status=status,
        message=message,
    )
    should_refresh = dashboard_refresh_due(
        scanned_at,
        negative_count=negative_count,
        new_negative_count=new_negative_count,
        status=status,
    )
    github_output("scanned_count", str(scanned_count))
    github_output("negative_count", str(negative_count))
    github_output("new_negative_count", str(new_negative_count))
    github_output("watch_status", status)
    github_output("should_refresh_dashboard", "true" if should_refresh else "false")


def main() -> None:
    load_dotenv()
    base_minutes_back = int(os.getenv("NEGATIVE_WATCH_MINUTES", "5"))
    minutes_back = effective_minutes_back(base_minutes_back)
    scanned_at = now_kst().isoformat()
    if minutes_back > base_minutes_back:
        print(f"Negative watcher catch-up window expanded to {minutes_back} minutes.")

    if not is_active_time():
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=0,
            negative_count=0,
            new_negative_count=0,
            status="skipped",
            message="outside active time",
        )
        print("Negative watcher skipped: outside active time.")
        return

    articles = collect_recent_company_news(minutes_back)
    negatives, metrics = find_negative_articles(articles)
    db_negatives = collect_recent_db_negatives(minutes_back)
    if apply_classification_feedback_to_articles(db_negatives):
        db_negatives = [
            article
            for article in db_negatives
            if analyzer.is_direct_own_negative_article(article)
        ]
    else:
        db_negatives = [article for article in db_negatives if analyzer.is_direct_own_negative_article(article)]
    if db_negatives:
        metrics["own_total"] = max(metrics.get("own_total", 0), len(db_negatives))

    state = load_state()
    sent = set(state.get("sent_keys", []))
    all_negatives = merge_negative_candidates(db_negatives, negatives, alert_state_articles(state))
    persist_negative_articles(all_negatives, metrics, scanned_at, minutes_back)
    new_negatives = [article for article in all_negatives if article_key(article) not in sent]

    print(
        f"Negative watcher scanned {len(articles)} company articles; "
        f"rss_negative={len(negatives)}, db_negative={len(db_negatives)}, new={len(new_negatives)}"
    )

    if not new_negatives:
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=0,
            status="scanned",
            message="no new negative article",
        )
        save_state(state)
        return

    if os.getenv("NEGATIVE_WATCH_DRY_RUN", "").lower() in {"1", "true", "yes", "y"}:
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="dry_run",
            message="dry run",
        )
        print("Dry run: Slack alert was not sent.")
        print(build_alert_message(new_negatives, metrics, minutes_back, len(db_negatives)))
        return

    persist_risk_response_drafts(new_negatives, scanned_at)

    link = build_alert_link(new_negatives[0])
    message = build_alert_message(new_negatives, metrics, minutes_back, len(db_negatives))
    alert_title = f"부정기사 감지 {article_key(new_negatives[0])}"
    if notification_already_sent("negative_alert", alert_title):
        print(f"Negative alert already sent: {alert_title}")
        for article in new_negatives:
            sent.add(article_key(article))
        state["sent_keys"] = list(sent)
        save_state(state)
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=0,
            status="scanned",
            message="duplicate alert already sent",
        )
        return
    state_persisted = False
    try:
        result = send_slack_alert(message, link, new_negatives[0])
        mark_alerts_sent(state, sent, new_negatives, scanned_at)
        save_state(state)
        state_persisted = True
        save_notification_send(
            message_type="negative_alert",
            title=alert_title,
            body=message,
            link_url=link,
            status="success",
            provider_response=result,
            channel="slack",
        )
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="alert_sent",
            message=f"{len(new_negatives)} new negative article(s)",
        )
        print("Slack negative alert result:", result)
    except Exception as error:
        save_notification_send(
            message_type="negative_alert",
            title=alert_title,
            body=message,
            link_url=link,
            status="failed",
            error=str(error),
            channel="slack",
        )
        finish_watch_run(
            scanned_at=scanned_at,
            minutes_back=minutes_back,
            scanned_count=len(articles) + len(db_negatives),
            negative_count=len(all_negatives),
            new_negative_count=len(new_negatives),
            status="alert_failed",
            message=str(error),
        )
        raise

    if not state_persisted:
        mark_alerts_sent(state, sent, new_negatives, scanned_at)
        save_state(state)


if __name__ == "__main__":
    main()
