"""Collect Naver and Google news, then keep only recent and relevant articles."""

from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import feedparser
import requests
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TaskProgressColumn, TextColumn
from rich.table import Table

import config
import report_window
import supabase_store

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()
console = Console()

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")


def collect_news() -> list[dict]:
    window = report_window.current_window()
    console.print(Panel.fit(
        f"[bold cyan]뉴스 수집 시작[/]  [dim]{datetime.now().strftime('%Y-%m-%d %H:%M')} · {window['label']}[/]",
        border_style="cyan",
    ))

    all_articles: list[dict] = []
    stats = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        keywords = load_collection_keywords()
        task = progress.add_task("[cyan]키워드 수집", total=len(keywords))
        for keyword in keywords:
            progress.update(task, description=f"[cyan]'{keyword}' 수집 중")
            naver = fetch_naver_news(keyword)
            google = fetch_google_news(keyword)
            all_articles.extend(naver + google)
            stats.append((keyword, len(naver), len(google)))
            progress.advance(task)

    before = len(all_articles)
    articles = deduplicate(all_articles)
    after_dedup = len(articles)
    articles = apply_exclude_filter(articles)
    after_exclude = len(articles)
    articles = apply_collection_window_filter(articles, window)
    after_window = len(articles)

    print_collection_stats(stats, before, after_dedup, after_exclude, after_window, window["label"])
    return articles


def load_collection_keywords() -> list[str]:
    try:
        keywords = supabase_store.load_monitor_keywords()
        if keywords:
            return keywords
    except Exception as exc:
        console.print(f"[yellow]Supabase keyword config skipped:[/] {exc}")
    return config.KEYWORDS


def fetch_naver_news(keyword: str) -> list[dict]:
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        return []

    url = "https://openapi.naver.com/v1/search/news.json"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    params = {"query": keyword, "display": config.ARTICLES_PER_KEYWORD, "sort": "date"}

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        return [
            {
                "title": clean_html(item.get("title", "")),
                "link": item.get("originallink") or item.get("link", ""),
                "description": clean_html(item.get("description", "")),
                "pub_date": item.get("pubDate", ""),
                "source": infer_press_name(
                    clean_html(item.get("title", "")),
                    item.get("originallink") or item.get("link", ""),
                    "naver",
                ),
                "keyword": keyword,
                "portal": "naver",
            }
            for item in response.json().get("items", [])
        ]
    except Exception as exc:
        console.print(f"[red]Naver '{keyword}' 오류:[/] {exc}")
        return []


def fetch_google_news(keyword: str) -> list[dict]:
    encoded = requests.utils.quote(keyword)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=ko&gl=KR&ceid=KR:ko"

    try:
        feed = feedparser.parse(url)
        return [
            {
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "description": clean_html(entry.get("summary", "")),
                "pub_date": entry.get("published", ""),
                "source": infer_press_name(entry.get("title", ""), entry.get("link", ""), "google"),
                "keyword": keyword,
                "portal": "google",
            }
            for entry in feed.entries[:config.ARTICLES_PER_KEYWORD]
        ]
    except Exception as exc:
        console.print(f"[red]Google '{keyword}' 오류:[/] {exc}")
        return []


def clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return (
        text.replace("&quot;", '"')
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .strip()
    )


def infer_press_name(title: str, link: str, fallback: str) -> str:
    title_press = extract_press_from_title(title)
    if title_press:
        return title_press
    domain_press = extract_press_from_url(link)
    return domain_press or fallback


def extract_press_from_title(title: str) -> str:
    bracket = re.match(r"^\s*\[([^\]]{2,15})\]", title or "")
    if bracket:
        return bracket.group(1).strip()
    dash = re.search(r"\s[-–]\s([^-\u2013]{2,18})$", title or "")
    if not dash:
        return ""
    candidate = re.sub(r"\s+", " ", dash.group(1)).strip()
    if re.search(r"기자|특파원|단독|종합|속보", candidate):
        return ""
    return candidate


def extract_press_from_url(link: str) -> str:
    if not link:
        return ""
    host = urlparse(link).hostname or ""
    host = host.removeprefix("www.")
    if host in {"news.naver.com", "n.news.naver.com", "m.sports.naver.com", "sports.news.naver.com", "m.news.naver.com"}:
        return resolve_naver_press_from_page(link)
    if not host or host in {"news.google.com"}:
        return ""
    domain_map = {
        "fins.co.kr": "보험저널",
        "news2day.co.kr": "뉴스투데이",
        "econovill.com": "이코노믹리뷰",
        "pinpointnews.co.kr": "핀포인트뉴스",
        "bigdatanews.co.kr": "빅데이터뉴스",
        "enetnews.co.kr": "이넷뉴스",
        "energy-news.co.kr": "에너지경제",
        "mtn.co.kr": "머니투데이방송",
        "mk.co.kr": "매일경제",
        "hankyung.com": "한국경제",
        "yna.co.kr": "연합뉴스",
        "newsis.com": "뉴시스",
        "news1.kr": "뉴스1",
    }
    return domain_map.get(host, host)


def resolve_naver_press_from_page(link: str) -> str:
    """Best-effort publisher extraction for Naver-hosted article pages."""
    try:
        response = requests.get(
            link,
            timeout=5,
            headers={"User-Agent": "Mozilla/5.0 news-monitor/1.0"},
        )
        response.raise_for_status()
    except Exception:
        return ""

    html = response.text
    patterns = [
        r'property=["\']og:article:author["\']\s+content=["\']([^"\']+)["\']',
        r'content=["\']([^"\']+)["\']\s+property=["\']og:article:author["\']',
        r'class=["\']media_end_head_top_logo_img["\'][^>]+alt=["\']([^"\']+)["\']',
        r'alt=["\']([^"\']+)["\'][^>]+class=["\']media_end_head_top_logo_img["\']',
        r'"pressName"\s*:\s*"([^"]+)"',
        r'"officeName"\s*:\s*"([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            candidate = clean_html(match.group(1))
            if candidate and candidate not in {"네이버뉴스", "네이버 스포츠"}:
                return candidate
    return ""


def deduplicate(articles: list[dict]) -> list[dict]:
    seen = set()
    unique = []
    for article in articles:
        key = normalize_for_dedup(article.get("title", ""))
        if key and key not in seen:
            seen.add(key)
            unique.append(article)
    return unique


def normalize_for_dedup(title: str) -> str:
    title = re.sub(r"\[[^\]]+\]|\([^)]+\)", "", title)
    title = re.sub(r"[^0-9A-Za-z가-힣]", "", title)
    return title.lower()[:80]


def apply_exclude_filter(articles: list[dict]) -> list[dict]:
    result = []
    for article in articles:
        text = article.get("title", "") + " " + article.get("description", "")
        if not any(word in text for word in config.EXCLUDE_KEYWORDS):
            result.append(article)
    return result


def apply_recency_filter(articles: list[dict], hours_back: int) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    result = []
    for article in articles:
        parsed = parse_pub_date(article.get("pub_date", ""))
        if not parsed or parsed >= cutoff:
            result.append(article)
    return result


def apply_collection_window_filter(articles: list[dict], window: dict) -> list[dict]:
    start = window["start"].astimezone(timezone.utc)
    end = window["end"].astimezone(timezone.utc)
    result = []
    for article in articles:
        parsed = parse_pub_date(article.get("pub_date", ""))
        if not parsed or start <= parsed <= end:
            result.append(article)
    return result


def parse_pub_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def print_collection_stats(
    stats: list[tuple[str, int, int]],
    before: int,
    dedup: int,
    excluded: int,
    in_window: int,
    window_label: str,
) -> None:
    table = Table(title="수집 결과")
    table.add_column("키워드", style="cyan")
    table.add_column("Naver", justify="right")
    table.add_column("Google", justify="right")
    for keyword, naver, google in stats:
        table.add_row(keyword, str(naver), str(google))
    console.print(table)
    console.print(
        f"[green]수집 {before}건[/] -> 중복제거 {dedup}건 -> 제외어 필터 {excluded}건 "
        f"-> {window_label} {in_window}건"
    )
