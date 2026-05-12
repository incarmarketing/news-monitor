"""Collect Naver and Google news, then keep only recent and relevant articles."""

from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TaskProgressColumn, TextColumn
from rich.table import Table

import config

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()
console = Console()

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")


def collect_news() -> list[dict]:
    console.print(Panel.fit(
        f"[bold cyan]뉴스 수집 시작[/]  [dim]{datetime.now().strftime('%Y-%m-%d %H:%M')}[/]",
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
        task = progress.add_task("[cyan]키워드 수집", total=len(config.KEYWORDS))
        for keyword in config.KEYWORDS:
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
    articles = apply_recency_filter(articles, config.HOURS_BACK)
    after_recency = len(articles)

    print_collection_stats(stats, before, after_dedup, after_exclude, after_recency)
    return articles


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
                "link": item.get("link", ""),
                "description": clean_html(item.get("description", "")),
                "pub_date": item.get("pubDate", ""),
                "source": "naver",
                "keyword": keyword,
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
                "source": "google",
                "keyword": keyword,
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


def print_collection_stats(stats: list[tuple[str, int, int]], before: int, dedup: int, excluded: int, recent: int) -> None:
    table = Table(title="수집 결과")
    table.add_column("키워드", style="cyan")
    table.add_column("Naver", justify="right")
    table.add_column("Google", justify="right")
    for keyword, naver, google in stats:
        table.add_row(keyword, str(naver), str(google))
    console.print(table)
    console.print(
        f"[green]수집 {before}건[/] -> 중복제거 {dedup}건 -> 제외어 필터 {excluded}건 "
        f"-> 최근 {config.HOURS_BACK}시간 {recent}건"
    )
