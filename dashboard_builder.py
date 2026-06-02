"""Build a static news database dashboard for GitHub Pages."""

from __future__ import annotations

import json
import os
import re
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

import supabase_store
import config
import archiver
import analyzer

BASE_DIR = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DATA_DIR = PUBLIC_DIR / "data"
TEMPLATE_DIR = BASE_DIR / "templates"
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
DEFAULT_SUPABASE_PROJECT_REF = "moszekksbhprhevxdynb"

CATEGORY_LABELS = {
    "own": "\ub2f9\uc0ac \ubcf4\ub3c4",
    "regulation": "\uaddc\uc81c/\uc815\ucc45",
    "competitor": "\uacbd\uc7c1\uc0ac",
    "industry": "\uc5c5\uacc4 \ub3d9\ud5a5",
    "other": "\uae30\ud0c0",
}

TONE_LABELS = {
    "positive": "\uae0d\uc815",
    "caution": "\uc8fc\uc758",
    "neutral": "\uc911\ub9bd",
    "negative": "\ubd80\uc815",
}

def load_daily_archives() -> list[dict]:
    return archiver.load_all_archives()


def build_articles(archives: list[dict]) -> list[dict]:
    supabase_articles = load_supabase_articles()
    if supabase_articles:
        return supabase_articles

    rows: list[dict] = []
    seen: set[str] = set()

    for archive in archives:
        date = archive.get("date", "")
        window = archive.get("window", {})
        metrics = archive.get("metrics", {})
        for index, article in enumerate(archive.get("articles", []), 1):
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
    return rows


def article_summary(article: dict, category: str, tone: str) -> str:
    article_for_summary = {**article, "_category": category, "_tone": tone}
    generated = analyzer.build_quality_summary(article_for_summary)
    existing = clean_summary_text(generated or article.get("description", "") or article.get("summary", ""))
    title = clean_summary_text(article.get("title", ""))
    lines = []
    sentences = [line for line in split_summary_sentences(existing) if not is_broken_summary_sentence(line)]
    if sentences:
        lines.extend(sentences[:2])
    elif title:
        lines.append(f"{title} \ubcf4\ub3c4\uc785\ub2c8\ub2e4.")
    filtered = unique_lines(lines)
    if not filtered and title:
        fallback = analyzer.headline_based_summary(title) or f"{title} \ubcf4\ub3c4\uc785\ub2c8\ub2e4."
        filtered = [fallback]
    return " ".join(ensure_sentence(line) for line in filtered[:2])


def clean_summary_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("&nbsp;", " ").replace("&amp;nbsp;", " ").replace("&quot;", '"').replace("&#39;", "'")
    text = re.sub("^\\[[^\\]]+\\s+[^\\]]*(?:\uae30\uc790|reporter)\\]\\s*", "", text, flags=re.IGNORECASE)
    text = re.sub("^[^\\s]+ (?:\uae30\uc790|reporter)\\s*=\\s*", "", text, flags=re.IGNORECASE)
    text = " ".join(text.split())
    return text.rstrip(".!? ")


def split_summary_sentences(value: object) -> list[str]:
    text = clean_summary_text(value)
    if not text:
        return []
    text = re.sub(r"([.!?])\s+", r"\1|", text)
    text = re.sub("(\ub2e4|\uc694|\ub2c8\ub2e4)\\s+", r"\1.|", text)
    chunks = text.split("|")
    return [chunk.strip() for chunk in chunks if len(chunk.strip()) >= 8]


def ensure_sentence(value: str) -> str:
    text = clean_summary_text(value)
    if not text:
        return ""
    if re.search("([.!?]|\ub2e4|\uc694|\ud568|\ub428)$", text):
        return text
    return f"{text}."


def is_broken_summary_sentence(value: object) -> bool:
    text = clean_summary_text(value)
    return (
        text.endswith(("\uace0", "\uba70", "\ub610\ud55c", "\uc774\ub77c\uace0", "\ud558\uace0"))
        or bool(re.search("(\ubc1d\ud600|\uc124\uba85|\uc804\ud588|\uac15\uc870)\\s*$", text))
        or len(text) > 160
    )


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
            "\ud0a4\uc6cc\ub4dc \uae30\uc900\uc73c\ub85c \uc218\uc9d1\ub41c \uae30\uc0ac\uc785\ub2c8\ub2e4",
            "\ud0a4\uc6cc\ub4dc\ub85c \uc218\uc9d1\ub418\uc5c8\uc2b5\ub2c8\ub2e4",
            "\uae30\uc0ac \uc6d0\ubb38\ub9cc \uc694\uc57d\ub418\uc5c8\uc2b5\ub2c8\ub2e4",
            "\ub2f9\uc0ac \uc9c1\uc811 \uc5b8\uae09 \uae30\uc0ac\uc785\ub2c8\ub2e4",
            "\ud3c9\ud310 \uc601\ud5a5\uacfc \uc0ac\uc2e4\uad00\uacc4 \ud655\uc778",
            "\uc5c5\uacc4 \ub3d9\ud5a5\uc785\ub2c8\ub2e4",
            "\ubcc4\ub3c4 \ucd94\uc801\ud569\ub2c8\ub2e4",
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
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
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
