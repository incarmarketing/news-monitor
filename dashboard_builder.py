"""Build a static news database dashboard for GitHub Pages."""

from __future__ import annotations

import json
import os
import re
import shutil
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

import supabase_store
import config
import archiver
import groq_helper

BASE_DIR = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DATA_DIR = PUBLIC_DIR / "data"
TEMPLATE_DIR = BASE_DIR / "templates"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
DEFAULT_SUPABASE_PROJECT_REF = "moszekksbhprhevxdynb"
KST = timezone(timedelta(hours=9))

CATEGORY_LABELS = {
    "own": "당사 보도",
    "regulation": "규제/정책",
    "competitor": "경쟁사",
    "industry": "업계 동향",
    "other": "기타",
}

TONE_LABELS = {
    "positive": "긍정",
    "caution": "주의",
    "neutral": "중립",
    "negative": "부정",
}

STOCK_LISTING_NOISE_TITLE_RE = re.compile(
    r"(?:\[?52주\]?\s*)?(?:최저가|최고가)|장중\s*(?:신저가|신고가)|강세\s*토픽|약세\s*토픽|특징주|"
    r"오전\s*이슈\s*\[보험\]|\[리스트\]|MVP\s*상위|상위\s*\d+\s*선"
)
INVESTMENT_REPORT_RE = re.compile(r"투자의견|목표주가|목표가|증권가|리포트|애널리스트")
OWN_NAME_RE = re.compile(r"인카금융서비스|인카금융")


def load_daily_archives() -> list[dict]:
    return archiver.load_all_archives()


def build_articles(archives: list[dict]) -> list[dict]:
    supabase_articles = load_supabase_articles()
    if supabase_articles:
        return enrich_issue_summaries(supabase_articles)

    rows: list[dict] = []
    seen: set[str] = set()

    for archive in archives:
        date = archive.get("date", "")
        window = archive.get("window", {})
        metrics = archive.get("metrics", {})
        for index, article in enumerate(archive.get("articles", []), 1):
            if is_stock_listing_noise(article):
                continue
            link = article.get("link", "")
            title = article.get("title", "")
            dedupe_key = link or f"{date}:{title}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            category = article.get("_category", "other")
            tone = article.get("_tone", "caution")
            rows.append(
                {
                    "id": f"{date}-{index}",
                    "date": date,
                    "window": window.get("label", ""),
                    "slot": window.get("slot", ""),
                    "risk": supabase_store.article_risk_level(article, metrics),
                    "title": title,
                    "link": link,
                    "source": article.get("source", ""),
                    "keyword": article.get("keyword", ""),
                    "summary": article_summary(article, category, tone),
                    "pub_date": article.get("pub_date", ""),
                    "score": article.get("_score", 0),
                    "category": category,
                    "category_label": CATEGORY_LABELS.get(category, "기타"),
                    "tone": tone,
                    "tone_label": TONE_LABELS.get(tone, "주의"),
                    "cluster_size": article.get("_cluster_size", 1),
                }
            )

    rows.sort(key=lambda row: (row["date"], row["score"]), reverse=True)
    return enrich_issue_summaries(rows)


def article_summary(article: dict, category: str, tone: str) -> str:
    existing = clean_summary_text(article.get("description", "") or article.get("summary", ""))
    lines = []
    if existing:
        lines.extend(split_summary_sentences(existing)[:2])
    elif article.get("title"):
        lines.append(clean_summary_text(article.get("title", "")))
    if tone == "negative":
        lines.append("소비자 피해, 제재, 사칭, 법적 분쟁 등 직접 리스크 문맥이 있는지 확인합니다.")
    elif tone == "caution":
        lines.append("직접 부정과 분리해 시장 평가, 투자 의견, 규제성 신호로 추적합니다.")
    elif tone == "positive":
        lines.append("우호 보도나 성과 맥락이 있어 홍보 활용 가능성을 검토할 수 있습니다.")
    return " ".join(unique_lines(lines)[:4])


def clean_summary_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("&nbsp;", " ").replace("&amp;nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    text = " ".join(text.split())
    return text.rstrip(".… ")


def split_summary_sentences(value: object) -> list[str]:
    text = clean_summary_text(value)
    if not text:
        return []
    chunks = re.split(r"(?:[.!?。]\s+|(?:다|요|임|함)\.\s+)", text)
    return [chunk.strip() for chunk in chunks if len(chunk.strip()) >= 8]


def unique_lines(lines: list[str]) -> list[str]:
    seen = set()
    result = []
    for line in lines:
        clean = clean_summary_text(line)
        if not clean or is_generic_summary_line(clean) or clean in seen:
            continue
        seen.add(clean)
        result.append(clean)
    return result


def is_generic_summary_line(value: object) -> bool:
    text = clean_summary_text(value)
    return any(
        phrase in text
        for phrase in (
            "키워드 기준으로 수집된 기사입니다",
            "키워드로 수집됐습니다",
            "기준 핵심만 요약했습니다",
        )
    )


def load_supabase_articles() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_articles()
    except Exception as exc:
        print(f"Supabase dashboard source skipped: {exc}")
        return []

    articles = []
    for row in rows:
        if is_stock_listing_noise(row):
            continue
        category = row.get("category", "other")
        tone = row.get("tone", "caution")
        articles.append(
            {
                "id": row.get("article_hash", ""),
                "date": row.get("report_date", ""),
                "window": row.get("window_label", ""),
                "slot": row.get("report_slot", ""),
                "risk": supabase_store.article_risk_level(row),
                "title": row.get("title", ""),
                "link": row.get("link", ""),
                "source": row.get("source", ""),
                "keyword": row.get("keyword", ""),
                "summary": article_summary(row, category, tone),
                "pub_date": row.get("pub_date") or row.get("pub_date_raw", ""),
                "score": row.get("score", 0),
                "category": category,
                "category_label": CATEGORY_LABELS.get(category, "기타"),
                "tone": tone,
                "tone_label": TONE_LABELS.get(tone, "주의"),
                "cluster_size": row.get("cluster_size", 1),
                "status": row.get("status", "new"),
            }
        )
    return articles


def is_stock_listing_noise(row: dict) -> bool:
    title = str(row.get("title") or "")
    source = str(row.get("source") or "")
    link = str(row.get("link") or "")
    text = f"{title} {source} {link} {row.get('summary') or ''} {row.get('description') or ''} {row.get('keyword') or ''}"
    is_itooza_listing = "itooza" in f"{source} {link}".lower() and re.search(r"52주|최고가|최저가|MVP|리스트|상위\s*\d+\s*선", title)
    if not STOCK_LISTING_NOISE_TITLE_RE.search(title) and not is_itooza_listing:
        return False
    if OWN_NAME_RE.search(title) and INVESTMENT_REPORT_RE.search(text):
        return False
    return True


def enrich_issue_summaries(rows: list[dict]) -> list[dict]:
    if not rows or not groq_helper.is_enabled() or config.GROQ_MAX_ISSUE_SUMMARIES <= 0:
        return rows

    groups = build_related_article_groups(rows)
    selected = sorted(groups, key=issue_group_score, reverse=True)[: config.GROQ_MAX_ISSUE_SUMMARIES]
    generated = 0
    for group in selected:
        members = group.get("members", [])
        if not members:
            continue
        summary = groq_helper.summarize_issue(members)
        if not summary:
            continue
        generated += 1
        for article in members:
            article["issue_summary"] = summary
    if generated:
        print(f"Groq issue summaries generated: {generated}")
    return rows


def build_related_article_groups(rows: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for row in rows:
        seed = article_group_seed(row)
        target = next((group for group in groups if are_related_article_seeds(seed, group["seed"])), None)
        if target:
            target["members"].append(row)
            target["seed"] = merge_group_seed(target["seed"], seed)
        else:
            groups.append({"seed": seed, "members": [row]})
    for group in groups:
        group["members"].sort(key=article_importance_score, reverse=True)
    return groups


def article_group_seed(row: dict) -> dict:
    canonical = normalize_group_title(row.get("title", ""))
    topic = article_topic_signature(row)
    summary_tokens = article_tokens(row.get("summary", "") or row.get("description", ""))[:16]
    tokens = article_tokens(f"{canonical} {' '.join(summary_tokens)} {row.get('keyword', '')}")
    return {"canonical": canonical, "topic": topic, "tokens": tokens, "token_set": set(tokens)}


def merge_group_seed(current: dict, next_seed: dict) -> dict:
    tokens = unique_lines([*(current.get("tokens") or []), *(next_seed.get("tokens") or [])])
    return {
        "canonical": current.get("canonical", "")
        if len(current.get("canonical", "")) >= len(next_seed.get("canonical", ""))
        else next_seed.get("canonical", ""),
        "topic": current.get("topic") or next_seed.get("topic") or "",
        "tokens": tokens,
        "token_set": set(tokens),
    }


def are_related_article_seeds(a: dict, b: dict) -> bool:
    if not a.get("canonical") or not b.get("canonical"):
        return False
    if a.get("topic") and b.get("topic") and a["topic"] == b["topic"]:
        return True
    shorter, longer = sorted([a["canonical"], b["canonical"]], key=len)
    if len(shorter) >= 22 and shorter in longer:
        return True
    if a["canonical"][:28] == b["canonical"][:28]:
        return True
    overlap = token_overlap_ratio(a.get("token_set", set()), b.get("token_set", set()))
    return overlap >= 0.62 or (overlap >= 0.48 and shared_long_token(a.get("tokens", []), b.get("tokens", [])))


def article_topic_signature(row: dict) -> str:
    text = normalize_group_title(
        f"{row.get('title', '')} {row.get('summary', '') or row.get('description', '')} {row.get('keyword', '')}"
    )

    def includes_all(terms: list[str]) -> bool:
        return all(normalize_group_title(term) in text for term in terms)

    if (
        ("금감원" in text or "금융감독원" in text)
        and ("8대 금융지주" in text or "8대 지주" in text or "금융지주" in text)
        and ("소비자보호" in text or "소비자 중심" in text or "금융문화" in text)
    ):
        return "금감원-금융지주-소비자보호"
    if includes_all(["홍콩els", "제재"]):
        return "홍콩els-제재"
    if includes_all(["신협", "특혜대출"]):
        return "신협-특혜대출"
    if includes_all(["신협", "부실채권"]):
        return "신협-부실채권"
    if includes_all(["소비자보호", "금융현장"]) and ("금감원" in text or "금융감독원" in text):
        return "금감원-소비자보호-현장"
    return ""


def normalize_group_title(value: object) -> str:
    text = str(value or "").lower()
    text = re.sub(r"\[[^\]]+\]|\([^)]*\)|<[^>]+>", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[^\w\s가-힣]", " ", text)
    text = re.sub(r"\b(단독|종합|속보|영상|포토|인터뷰|기획|칼럼)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def article_tokens(value: object) -> list[str]:
    stop = {
        "기자",
        "뉴스",
        "보도",
        "관련",
        "통해",
        "대한",
        "위해",
        "올해",
        "지난",
        "이번",
        "추진",
        "확산",
        "맞손",
        "역량",
        "마음",
        "지원",
        "강화",
        "본격화",
    }
    return [
        token
        for token in normalize_group_title(value).split()
        if len(token) > 1 and token not in stop and not token.isdigit()
    ]


def token_overlap_ratio(a_set: set[str], b_set: set[str]) -> float:
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / min(len(a_set), len(b_set))


def shared_long_token(a_tokens: list[str], b_tokens: list[str]) -> bool:
    b_set = set(b_tokens)
    return any(len(token) >= 5 and token in b_set for token in a_tokens)


def issue_group_score(group: dict) -> int:
    members = group.get("members", [])
    if not members:
        return 0
    best = max(article_importance_score(row) for row in members)
    related = min(len(members), 8) * 25
    own = 520 if any(row.get("category") == "own" for row in members) else 0
    return best + related + own


def article_importance_score(row: dict) -> int:
    tone_score = {"negative": 420, "caution": 280, "positive": 170, "neutral": 90}.get(str(row.get("tone", "")), 0)
    category_score = 130 if row.get("category") == "regulation" else 80 if row.get("category") in {"competitor", "industry"} else 0
    own_score = 520 if row.get("category") == "own" else 0
    return own_score + tone_score + category_score + int(float(row.get("score") or 0))


def build_summary(archives: list[dict], articles: list[dict]) -> dict:
    category_counts = Counter(row["category"] for row in articles)
    tone_counts = Counter(row["tone"] for row in articles)
    risk_counts = Counter(archive.get("metrics", {}).get("risk_level", "LOW") for archive in archives)

    dates = [archive.get("date") for archive in archives if archive.get("date")]
    if not dates:
        dates = [article.get("date") for article in articles if article.get("date")]
    latest_archive = archives[-1] if archives else {}
    latest_window = latest_archive.get("window", {})

    return {
        "generated_at": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
        "days": len(dates),
        "first_date": min(dates) if dates else "",
        "last_date": max(dates) if dates else "",
        "latest_window": latest_window.get("label", ""),
        "latest_risk": latest_archive.get("metrics", {}).get("risk_level", "LOW"),
        "total_articles": len(articles),
        "own_articles": category_counts.get("own", 0),
        "negative_articles": tone_counts.get("negative", 0),
        "regulation_articles": category_counts.get("regulation", 0),
        "category_counts": dict(category_counts),
        "tone_counts": dict(tone_counts),
        "risk_counts": dict(risk_counts),
    }


def build_report_runs(archives: list[dict]) -> list[dict]:
    supabase_runs = load_supabase_report_runs()
    if supabase_runs:
        return supabase_runs

    rows = []
    for archive in archives:
        window = archive.get("window", {})
        metrics = archive.get("metrics", {})
        rows.append(
            {
                "run_key": f"{archive.get('date', '')}-{window.get('slot', '')}",
                "report_date": archive.get("date", ""),
                "report_slot": window.get("slot", ""),
                "timestamp": archive.get("timestamp", ""),
                "window_label": window.get("label", ""),
                "window_start": window.get("start", ""),
                "window_end": window.get("end", ""),
                "risk_level": metrics.get("risk_level", "LOW"),
                "metrics": metrics,
            }
        )
    rows.sort(key=report_run_sort_key, reverse=True)
    return rows


def load_supabase_report_runs() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_report_runs()
    except Exception as exc:
        print(f"Supabase report run source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def load_supabase_notifications() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_notifications()
    except Exception as exc:
        print(f"Supabase notification source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def load_supabase_watch_runs() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_watch_runs()
    except Exception as exc:
        print(f"Supabase watch source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def load_supabase_scraps() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_scraps()
    except Exception as exc:
        print(f"Supabase scrap source skipped: {exc}")
        return []
    return rows if isinstance(rows, list) else []


def report_run_sort_key(row: dict) -> tuple[str, int, str]:
    slot_order = {"08": 1, "13": 2, "18": 3}
    slot = str(row.get("report_slot", ""))
    return (
        str(row.get("report_date", "")),
        slot_order.get(slot, 0),
        str(row.get("timestamp", "")),
    )


def load_dashboard_keywords() -> list[dict]:
    try:
        rows = supabase_store.load_monitor_keyword_rows()
        if rows:
            return rows
    except Exception as exc:
        print(f"Supabase keyword source skipped: {exc}")
    return [{"keyword": keyword, "category": "other", "enabled": True} for keyword in config.KEYWORDS]


def load_dashboard_aliases() -> list[dict]:
    try:
        rows = supabase_store.load_press_alias_rows()
        if rows:
            return rows
    except Exception as exc:
        print(f"Supabase press alias source skipped: {exc}")
    return []


def publish_dashboard() -> Path:
    archives = load_daily_archives()
    articles = build_articles(archives)
    summary = build_summary(archives, articles)
    report_runs = build_report_runs(archives)
    keywords = load_dashboard_keywords()
    aliases = load_dashboard_aliases()
    notifications = load_supabase_notifications()
    watch_runs = load_supabase_watch_runs()
    scraps = load_supabase_scraps()

    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA_DIR / "articles.json").write_text(
        json.dumps(
            {
                "summary": summary,
                "articles": articles,
                "category_labels": CATEGORY_LABELS,
                "tone_labels": TONE_LABELS,
                "keywords": keywords,
                "aliases": aliases,
                "report_runs": report_runs,
                "notifications": notifications,
                "watch_runs": watch_runs,
                "scraps": scraps,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    publish_supabase_public_config()
    rebuilt_target = publish_rebuilt_dashboard()
    if rebuilt_target:
        print(f"Published dashboard: {rebuilt_target}")
        print(f"Dashboard articles: {len(articles)}")
        return rebuilt_target

    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template("dashboard.html")
    target = PUBLIC_DIR / "dashboard.html"
    target.write_text(template.render(summary=summary), encoding="utf-8")
    print(f"Published dashboard: {target}")
    print(f"Dashboard articles: {len(articles)}")
    return target


def publish_rebuilt_dashboard() -> Path | None:
    index_source = FRONTEND_DIST_DIR / "index.html"
    if not index_source.exists():
        print("Rebuilt frontend dist not found. Falling back to templates/dashboard.html.")
        return None

    assets_source = FRONTEND_DIST_DIR / "assets"
    assets_target = PUBLIC_DIR / "assets"
    if assets_source.exists():
        assets_target.mkdir(parents=True, exist_ok=True)
        for source in assets_source.iterdir():
            if source.is_file():
                shutil.copy2(source, assets_target / source.name)

    target = PUBLIC_DIR / "dashboard.html"
    target.write_text(index_source.read_text(encoding="utf-8"), encoding="utf-8")
    print("Published rebuilt React dashboard.")
    return target


def publish_supabase_public_config() -> None:
    url = (os.getenv("PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").rstrip("/")
    project_ref = os.getenv("SUPABASE_PROJECT_REF", "").strip() or DEFAULT_SUPABASE_PROJECT_REF
    if not url and project_ref:
        url = f"https://{project_ref}.supabase.co"
    anon_key = (
        os.getenv("PUBLIC_SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY")
        or ""
    )
    config_path = PUBLIC_DATA_DIR / "supabase.json"
    if not url or not anon_key:
        if config_path.exists():
            config_path.unlink()
        print("Supabase public config skipped: PUBLIC_SUPABASE_URL/SUPABASE_URL and public anon or publishable key are required.")
        return
    config_path.write_text(
        json.dumps({"url": url, "anon_key": anon_key}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    publish_dashboard()
