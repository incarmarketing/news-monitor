"""Build a static news database dashboard for GitHub Pages."""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

import supabase_store
import config

BASE_DIR = Path(__file__).parent
ARCHIVE_DIR = BASE_DIR / "data" / "daily"
PUBLIC_DIR = BASE_DIR / "public"
PUBLIC_DATA_DIR = PUBLIC_DIR / "data"
TEMPLATE_DIR = BASE_DIR / "templates"

CATEGORY_LABELS = {
    "own": "당사 보도",
    "regulation": "규제/정책",
    "competitor": "경쟁사",
    "industry": "업계 동향",
    "other": "기타",
}

TONE_LABELS = {
    "positive": "긍정",
    "neutral": "중립",
    "negative": "부정",
}


def load_daily_archives() -> list[dict]:
    if not ARCHIVE_DIR.exists():
        return []
    archives = []
    for path in sorted(ARCHIVE_DIR.glob("*.json")):
        try:
            archives.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            print(f"Skip invalid archive: {path}")
    return archives


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
            tone = article.get("_tone", "neutral")
            rows.append(
                {
                    "id": f"{date}-{index}",
                    "date": date,
                    "window": window.get("label", ""),
                    "slot": window.get("slot", ""),
                    "risk": metrics.get("risk_level", "LOW"),
                    "title": title,
                    "link": link,
                    "source": article.get("source", ""),
                    "keyword": article.get("keyword", ""),
                    "pub_date": article.get("pub_date", ""),
                    "score": article.get("_score", 0),
                    "category": category,
                    "category_label": CATEGORY_LABELS.get(category, "기타"),
                    "tone": tone,
                    "tone_label": TONE_LABELS.get(tone, "중립"),
                    "cluster_size": article.get("_cluster_size", 1),
                }
            )

    rows.sort(key=lambda row: (row["date"], row["score"]), reverse=True)
    return rows


def load_supabase_articles() -> list[dict]:
    try:
        rows = supabase_store.load_dashboard_articles()
    except Exception as exc:
        print(f"Supabase dashboard source skipped: {exc}")
        return []

    articles = []
    for row in rows:
        category = row.get("category", "other")
        tone = row.get("tone", "neutral")
        articles.append(
            {
                "id": row.get("article_hash", ""),
                "date": row.get("report_date", ""),
                "window": row.get("window_label", ""),
                "slot": row.get("report_slot", ""),
                "risk": row.get("risk_level", "LOW"),
                "title": row.get("title", ""),
                "link": row.get("link", ""),
                "source": row.get("source", ""),
                "keyword": row.get("keyword", ""),
                "pub_date": row.get("pub_date") or row.get("pub_date_raw", ""),
                "score": row.get("score", 0),
                "category": category,
                "category_label": CATEGORY_LABELS.get(category, "기타"),
                "tone": tone,
                "tone_label": TONE_LABELS.get(tone, "중립"),
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


def load_dashboard_keywords() -> list[str]:
    try:
        keywords = supabase_store.load_monitor_keywords()
        if keywords:
            return keywords
    except Exception as exc:
        print(f"Supabase keyword source skipped: {exc}")
    return list(config.KEYWORDS)


def publish_dashboard() -> Path:
    archives = load_daily_archives()
    articles = build_articles(archives)
    summary = build_summary(archives, articles)
    keywords = load_dashboard_keywords()

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
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    publish_supabase_public_config()

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


def publish_supabase_public_config() -> None:
    url = (os.getenv("PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").rstrip("/")
    project_ref = os.getenv("SUPABASE_PROJECT_REF", "").strip()
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
