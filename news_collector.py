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
import analyzer
import report_window
import supabase_store

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

load_dotenv()
console = Console()

PRESS_ALIAS_MAP = {}

NON_PRESS_TITLE_LABELS = {
    "포토",
    "단독",
    "속보",
    "인터뷰",
    "기획",
    "#금융톡톡",
    "Invest",
    "금융 HOT 뉴스",
    "금융지주 보험사 분석",
    "카드",
    "드림&CEO",
    "보험업계 소식",
}

PORTAL_HOSTS = {
    "news.naver.com",
    "n.news.naver.com",
    "m.news.naver.com",
    "m.naver.com",
    "sports.naver.com",
    "game.naver.com",
    "help.naver.com",
    "m.sports.naver.com",
    "sports.news.naver.com",
    "entertain.naver.com",
    "m.entertain.naver.com",
    "blog.naver.com",
    "v.daum.net",
    "news.daum.net",
    "news.google.com",
    "news.google.co.kr",
}

STATIC_HOSTS = {
    "ssl.pstatic.net",
    "static.naver.net",
    "static.news.naver.net",
    "www.gstatic.com",
    "fonts.gstatic.com",
    "fonts.googleapis.com",
    "lh3.googleusercontent.com",
    "angular.dev",
    "w3.org",
}

EXCLUDED_PRESS_HOSTS = {
    "mhnse.com",
    "mhns.co.kr",
    "mhnsports.com",
}

EXCLUDED_PRESS_NAMES = {
    "MHN스포츠",
    "MHN포토",
    "엠에이치앤포토",
    "mhn포토",
}

DOMAIN_PRESS_MAP = {
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
    "insnews.co.kr": "보험매일",
    "mt.co.kr": "머니투데이",
    "biz.heraldcorp.com": "헤럴드경제",
    "heraldcorp.com": "헤럴드경제",
    "view.asiae.co.kr": "아시아경제",
    "asiae.co.kr": "아시아경제",
    "edaily.co.kr": "이데일리",
    "sedaily.com": "서울경제",
    "bloter.net": "블로터",
    "ziksir.com": "직썰",
    "segyebiz.com": "세계비즈",
    "sisaon.co.kr": "시사오늘",
    "ttlnews.com": "티티엘뉴스",
    "popcornnews.net": "팝콘뉴스",
    "4th.kr": "포쓰저널",
    "footballist.co.kr": "풋볼리스트",
    "nocutnews.co.kr": "노컷뉴스",
    "osen.co.kr": "OSEN",
    "chosun.com": "조선일보",
    "sports.chosun.com": "스포츠조선",
    "sportsworldi.com": "스포츠월드",
    "kookje.co.kr": "국제신문",
    "newsworks.co.kr": "뉴스웍스",
    "youthdaily.co.kr": "청년일보",
    "joseilbo.com": "조세일보",
    "sisafocus.co.kr": "시사포커스",
    "dailian.co.kr": "데일리안",
    "ngetnews.com": "뉴스저널리즘",
    "ftoday.co.kr": "파이낸셜투데이",
    "sateconomy.co.kr": "시장경제",
    "dt.co.kr": "디지털타임스",
    "pointdaily.co.kr": "포인트데일리",
    "m.maniareport.com": "마니아리포트",
    "maniareport.com": "마니아리포트",
    "kmib.co.kr": "국민일보",
    "m.sportsworldi.com": "스포츠월드",
    "m.hankookilbo.com": "한국일보",
    "starin.edaily.co.kr": "이데일리",
    "mbn.co.kr": "MBN",
    "m.nocutnews.co.kr": "노컷뉴스",
    "cnbnews.com": "CNB뉴스",
    "sports.hankooki.com": "스포츠한국",
    "m-i.kr": "매일일보",
    "efnews.co.kr": "파이낸셜신문",
    "newsprime.co.kr": "프라임경제",
    "breaknews.com": "브레이크뉴스",
    "safetimes.co.kr": "세이프타임즈",
    "xportsnews.com": "엑스포츠뉴스",
    "fnnews.com": "파이낸셜뉴스",
}

AMBIGUOUS_COLLECTION_KEYWORDS = {"메가", "GA", "브랜드평판", "브랜드 평판", "평판"}
BROAD_REPUTATION_KEYWORDS = {"브랜드평판", "브랜드 평판", "평판"}
CONTEXTUAL_REPUTATION_QUERIES = [
    "보험대리점 브랜드평판",
    "GA 브랜드평판",
    "인카금융서비스 브랜드평판",
]

COLLECTION_CONTEXT_WORDS = [
    "인카금융", "인카금융서비스",
    "보험", "보험사", "생명보험", "손해보험", "보험대리점", "법인보험대리점",
    "보험설계사", "설계사", "전속설계사", "전속 설계사", "GA설계사",
    "GA 설계사", "보험모집인", "보험 모집인", "모집인", "보험GA",
    "보험 GA", "GA 보험", "GA업계", "대형 GA", "GA채널", "금융서비스",
    "금감원", "금융감독원", "금융위", "금융위원회", "보험업법",
    "수수료", "1200%", "정착지원금", "불완전판매", "내부통제",
    "손보", "생보",
]

NAVER_OFFICE_ID_MAP = {
    "001": "연합뉴스",
    "005": "국민일보",
    "009": "매일경제",
    "015": "한국경제",
    "016": "헤럴드경제",
    "018": "이데일리",
    "057": "MBN",
    "079": "노컷뉴스",
    "396": "스포츠월드",
    "425": "마이데일리",
    "436": "풋볼리스트",
    "469": "한국일보",
}

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
    articles = apply_relevance_filter(articles)
    after_relevance = len(articles)
    articles = apply_exclude_filter(articles)
    after_exclude = len(articles)
    articles = apply_collection_window_filter(articles, window)
    after_window = len(articles)

    print_collection_stats(stats, before, after_dedup, after_relevance, after_exclude, after_window, window["label"])
    return articles


def load_collection_keywords() -> list[str]:
    try:
        keywords = supabase_store.load_monitor_keywords()
        if keywords:
            return normalize_collection_keywords(keywords)
    except Exception as exc:
        console.print(f"[yellow]Supabase keyword config skipped:[/] {exc}")
    return normalize_collection_keywords(config.KEYWORDS)


def normalize_collection_keywords(keywords: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_keyword in keywords:
        keyword = str(raw_keyword).strip()
        if not keyword:
            continue
        expanded = CONTEXTUAL_REPUTATION_QUERIES if is_broad_reputation_keyword(keyword) else [keyword]
        for item in expanded:
            if item not in seen:
                normalized.append(item)
                seen.add(item)
    return normalized


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
        return normalize_press_name(title_press)
    domain_press = extract_press_from_url(link)
    return normalize_press_name(domain_press or fallback)


def normalize_press_name(value: str) -> str:
    press = clean_html(value or "")
    press = re.sub(r"\s+", " ", press).strip()
    press = re.sub(r"\s+\|\s*(네이버|다음|구글|네이트).*$", "", press, flags=re.I)
    if not press:
        return ""
    aliased = PRESS_ALIAS_MAP.get(press, press)
    host = canonical_host(aliased)
    return DOMAIN_PRESS_MAP.get(host, aliased)


def extract_press_from_title(title: str) -> str:
    bracket = re.match(r"^\s*\[([^\]]{2,15})\]", title or "")
    if bracket:
        candidate = bracket.group(1).strip()
        if is_likely_press_label(candidate):
            return candidate
    dash = re.search(r"\s[-\u2013]\s([^-\u2013]{2,18})$", title or "")
    if not dash:
        return ""
    candidate = re.sub(r"\s+", " ", dash.group(1)).strip()
    if candidate in NON_PRESS_TITLE_LABELS or re.search(r"기자|특파원|단독|종합|속보", candidate):
        return ""
    candidate = normalize_press_name(candidate)
    if is_likely_press_label(candidate):
        return candidate
    return DOMAIN_PRESS_MAP.get(canonical_host(candidate), "")


def is_likely_press_label(value: str) -> bool:
    candidate = normalize_press_name(value)
    if not candidate or candidate in NON_PRESS_TITLE_LABELS:
        return False
    if candidate in PRESS_ALIAS_MAP:
        return True
    if len(candidate) > 14:
        return False
    if re.search(r"[<>{}0-9]|시대|명암|기획|브리핑|단독|특징주|투자|판례", candidate):
        return False
    return bool(
        re.search(r"(뉴스|신문|경제|일보|저널|매일|타임스|투데이|데일리|포스트|방송|스포츠|신보|이슈|프레스)$", candidate)
        or candidate in {"더벨", "EBN", "FETV", "CEO스코어데일리", "CBC뉴스"}
    )


def extract_press_from_url(link: str) -> str:
    if not link:
        return ""
    host = urlparse(link).hostname or ""
    host = host.removeprefix("www.")
    if host in PORTAL_HOSTS:
        return resolve_portal_press_from_page(link)
    if not host:
        return ""
    return DOMAIN_PRESS_MAP.get(host, host)


def resolve_portal_press_from_page(link: str) -> str:
    """Best-effort publisher extraction for portal-hosted article pages."""
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
        r'class=["\'][^"\']*media_end_head_top_logo_img[^"\']*["\'][^>]+alt=["\']([^"\']+)["\']',
        r'alt=["\']([^"\']+)["\'][^>]+class=["\'][^"\']*media_end_head_top_logo_img[^"\']*["\']',
        r'class=["\'][^"\']*press_logo[^"\']*["\'][^>]+alt=["\']([^"\']+)["\']',
        r'alt=["\']([^"\']+)["\'][^>]+class=["\'][^"\']*press_logo[^"\']*["\']',
        r'data-office-name=["\']([^"\']+)["\']',
        r'"pressName"\s*:\s*"([^"]+)"',
        r'"officeName"\s*:\s*"([^"]+)"',
        r'"cpName"\s*:\s*"([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.S)
        if match:
            candidate = normalize_press_name(match.group(1))
            if candidate and candidate not in {"네이버뉴스", "네이버 스포츠", "구글뉴스"}:
                return candidate
    host = (urlparse(link).hostname or "").removeprefix("www.")
    original_url = "" if host.startswith("news.google.") else extract_original_article_url(html, response.url)
    if original_url:
        host = (urlparse(original_url).hostname or "").removeprefix("www.")
        if host in DOMAIN_PRESS_MAP:
            return DOMAIN_PRESS_MAP[host]
    office_id = extract_naver_office_id(html)
    if office_id in NAVER_OFFICE_ID_MAP:
        return NAVER_OFFICE_ID_MAP[office_id]
    return ""


def extract_original_article_url(html: str, final_url: str = "") -> str:
    patterns = [
        r'"orgUrl"\s*:\s*\{[\s\S]{0,1200}?"url"\s*:\s*"([^"]+)"',
        r'"officeOutlinkNews"\s*:\s*\[[\s\S]{0,1600}?"url"\s*:\s*"([^"]+)"',
        r'class=["\'][^"\']*media_end_head_origin_link[^"\']*["\'][^>]+href=["\']([^"\']+)["\']',
        r'href=["\']([^"\']+)["\'][^>]+class=["\'][^"\']*media_end_head_origin_link[^"\']*["\']',
        r'data-clk=["\']are\.ori["\'][^>]+href=["\']([^"\']+)["\']',
        r'href=["\']([^"\']+)["\'][^>]+data-clk=["\']are\.ori["\']',
        r'https?://[^"\'<>\\\s]+',
    ]
    candidates = []
    for pattern in patterns:
        for match in re.finditer(pattern, html, re.S):
            value = clean_html(match.group(1) if match.groups() else match.group(0)).replace("\\/", "/")
            if value.startswith("http") and not is_rejected_original_url(value):
                candidates.append(value)
    if final_url and not is_rejected_original_url(final_url):
        candidates.insert(0, final_url)
    return candidates[0] if candidates else ""


def extract_naver_office_id(html: str) -> str:
    match = re.search(r'"officeId"\s*:\s*"(\d{3})"', html or "")
    return match.group(1) if match else ""


def canonical_host(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"^https?://", "", value)
    value = re.sub(r"^www\.", "", value)
    value = value.split("/", 1)[0]
    return value


def article_host(article: dict) -> str:
    link = str(article.get("link") or article.get("url") or "")
    return canonical_host(link)


def is_excluded_press_article(article: dict) -> bool:
    raw_link = str(article.get("link") or article.get("url") or "").lower()
    host = article_host(article)
    names = {
        str(article.get("source") or "").strip(),
        str(article.get("press") or "").strip(),
    }
    title = str(article.get("title") or "")
    if host in EXCLUDED_PRESS_HOSTS or any(blocked in raw_link for blocked in EXCLUDED_PRESS_HOSTS):
        return True
    if any(name in EXCLUDED_PRESS_NAMES for name in names):
        return True
    if any(name.lower().startswith("mhn") for name in names if name):
        return True
    return bool(re.match(r"^\s*\[(?:MHN포토|MHN스포츠|엠에이치앤포토)\]", title, re.I))


def is_rejected_original_url(value: str) -> bool:
    host = (urlparse(value).hostname or "").removeprefix("www.").lower()
    if not host or host in PORTAL_HOSTS or host in STATIC_HOSTS:
        return True
    if "google." in host or "googleapis." in host or "gstatic." in host or "googleusercontent." in host:
        return True
    return bool(re.search(
        r"(/_next/static/|/static/|\.css(\?|$)|\.js(\?|$)|\.woff2?(\?|$)|\.ttf(\?|$)|\.otf(\?|$)|\.png(\?|$)|\.jpe?g(\?|$)|\.gif(\?|$)|\.svg(\?|$)|\.ico(\?|$)|\.webp(\?|$))",
        value,
        re.I,
    ))


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
        if is_excluded_press_article(article):
            continue
        text = article.get("title", "") + " " + article.get("description", "")
        if not any(word in text for word in config.EXCLUDE_KEYWORDS):
            result.append(article)
    return result


def apply_relevance_filter(articles: list[dict]) -> list[dict]:
    return [article for article in articles if is_relevant_article(article)]


def is_relevant_article(article: dict) -> bool:
    text = f"{article.get('title', '')} {article.get('description', '')}"
    keyword = str(article.get("keyword", "")).strip()
    if not text.strip():
        return False

    if has_collection_context(text):
        return True

    if keyword and keyword in text and not keyword_requires_context(keyword):
        return True

    return False


def has_collection_context(text: str) -> bool:
    if analyzer.contains_competitor_word(text):
        return True
    return any(word in text for word in COLLECTION_CONTEXT_WORDS)


def keyword_requires_context(keyword: str) -> bool:
    normalized = re.sub(r"\s+", "", keyword)
    if normalized in AMBIGUOUS_COLLECTION_KEYWORDS:
        return True
    return len(normalized) <= 2


def is_broad_reputation_keyword(keyword: str) -> bool:
    normalized = re.sub(r"\s+", "", keyword)
    return normalized in {re.sub(r"\s+", "", item) for item in BROAD_REPUTATION_KEYWORDS}


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
    relevant: int,
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
        f"[green]수집 {before}건[/] -> 중복제거 {dedup}건 -> 업종 관련성 {relevant}건 "
        f"-> 제외어 필터 {excluded}건 "
        f"-> {window_label} {in_window}건"
    )
