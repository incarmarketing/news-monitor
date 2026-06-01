"""Collect official press releases from Korean financial regulators."""

from __future__ import annotations

import html as html_module
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from urllib.parse import urlencode, urljoin

import requests


KST = timezone(timedelta(hours=9))

FSS_LIST_URL = "https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218"
FSS_OPEN_API_URL = "https://www.fss.or.kr/fss/kr/openApi/api/bodoInfo.jsp"
FSC_LIST_URL = "https://www.fsc.go.kr/no010101"

REGULATOR_CONTEXT_WORDS = [
    "보험",
    "손해보험",
    "생명보험",
    "보험사",
    "보험업법",
    "보험대리점",
    "법인보험대리점",
    "GA",
    "보험설계사",
    "설계사",
    "전속설계사",
    "모집인",
    "보험모집",
    "판매수수료",
    "수수료",
    "정착지원금",
    "1200%",
    "불완전판매",
    "내부통제",
    "금융소비자보호",
    "보험검사",
    "보험감독",
    "보험사기",
    "손보",
    "생보",
]

REGULATOR_GENERIC_WORDS = {"수수료", "내부통제", "금융소비자보호", "감독"}
REGULATOR_DIRECT_WORDS = [word for word in REGULATOR_CONTEXT_WORDS if word not in REGULATOR_GENERIC_WORDS]


def fetch_regulator_releases(days_back: int = 45, max_pages: int = 3) -> list[dict]:
    """Return relevant FSS/FSC official releases as article-shaped rows."""
    cutoff = datetime.now(KST).date() - timedelta(days=days_back)
    rows: list[dict] = []
    rows.extend(fetch_fss_api_releases(cutoff))
    rows.extend(fetch_fss_releases(cutoff, max_pages=max_pages))
    rows.extend(fetch_fsc_releases(cutoff, max_pages=max_pages))
    return deduplicate_releases(rows)


def fetch_fss_api_releases(cutoff) -> list[dict]:
    auth_key = os.getenv("FSS_API_AUTH_KEY") or os.getenv("FSS_OPENAPI_AUTH_KEY")
    if not auth_key:
        return []
    today = datetime.now(KST).date()
    params = {
        "apiType": "json",
        "authKey": auth_key,
        "startDate": cutoff.strftime("%Y-%m-%d"),
        "endDate": today.strftime("%Y-%m-%d"),
    }
    try:
        response = requests.get(FSS_OPEN_API_URL, params=params, timeout=20, headers={"User-Agent": "Mozilla/5.0 news-monitor/1.0"})
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    releases: list[dict] = []
    for row in flatten_api_rows(payload):
        title = clean_text(first_value(row, "title", "sj", "subject", "bbsSj", "nttSj"))
        date_text = normalize_date_text(first_value(row, "date", "regDate", "regDt", "rgsde", "nttDate", "wrtDt"))
        dept = clean_text(first_value(row, "dept", "deptNm", "department", "chrgDeptNm", "orgNm"))
        link = first_value(row, "url", "link", "viewUrl", "bbsUrl")
        if not title or not date_text or not is_recent_date(date_text, cutoff):
            continue
        if not is_relevant_release(title, dept):
            continue
        stable_link = link if str(link).startswith("http") else f"{FSS_LIST_URL}#api-{date_text}-{stable_slug(title)}"
        releases.append(build_release_article(
            source="금융감독원",
            title=title,
            link=stable_link,
            dept=dept,
            date_text=date_text,
        ))
    return releases


def fetch_fss_releases(cutoff, max_pages: int = 3) -> list[dict]:
    releases: list[dict] = []
    for page in range(1, max_pages + 1):
        url = f"{FSS_LIST_URL}&pageIndex={page}"
        html = fetch_html(url)
        if not html:
            continue
        page_has_recent = False
        page_had_dated_rows = False
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
            link_match = re.search(r'<td[^>]*class=["\']title["\'][^>]*>\s*<a\s+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', row, re.S | re.I)
            if not link_match:
                continue
            title = clean_text(link_match.group(2))
            cells = [clean_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
            date_text = first_match(row, r"(\d{4}-\d{2}-\d{2})")
            dept = cells[2] if len(cells) >= 4 else ""
            file_names = " ".join(re.findall(r'<span[^>]*class=["\']name["\'][^>]*>(.*?)</span>', row, re.S | re.I))
            if date_text:
                page_had_dated_rows = True
            if not title or not date_text:
                continue
            if not is_recent_date(date_text, cutoff):
                continue
            page_has_recent = True
            if not is_relevant_release(title, dept, clean_text(file_names)):
                continue
            releases.append(build_release_article(
                source="금융감독원",
                title=title,
                link=urljoin(FSS_LIST_URL, link_match.group(1)),
                dept=dept,
                date_text=date_text,
            ))
        if page_had_dated_rows and not page_has_recent:
            break
    return releases


def fetch_fsc_releases(cutoff, max_pages: int = 3) -> list[dict]:
    releases: list[dict] = []
    today = datetime.now(KST).date()
    for page in range(1, max_pages + 1):
        query = urlencode({
            "curPage": page,
            "srchBeginDt": cutoff.strftime("%Y-%m-%d"),
            "srchEndDt": today.strftime("%Y-%m-%d"),
        })
        url = f"{FSC_LIST_URL}?{query}"
        html = fetch_html(url)
        if not html:
            continue
        page_has_recent = False
        page_had_dated_rows = False
        for row in re.findall(r"<li[^>]*>\s*<div[^>]*class=[\"']inner[\"'][^>]*>(.*?)</li>", html, re.S | re.I):
            if "subject" not in row or "day" not in row:
                continue
            link_match = re.search(r'<div[^>]*class=["\']subject["\'][^>]*>.*?<a\s+href=["\']([^"\']+)["\']([^>]*)>(.*?)</a>', row, re.S | re.I)
            if not link_match:
                continue
            title_attr = first_match(link_match.group(2), r'title=["\']([^"\']+)["\']')
            title = clean_text(title_attr or link_match.group(3))
            title = re.sub(r"\.\s*금일 등록된 게시글$", "", title).strip()
            dept = first_match(row, r"담당부서\s*:\s*([^<]+)")
            date_text = first_match(row, r'<div[^>]*class=["\']day["\'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*</div>')
            file_names = " ".join(re.findall(r'<span[^>]*class=["\']name["\'][^>]*>(.*?)</span>', row, re.S | re.I))
            if date_text:
                page_had_dated_rows = True
            if not title or not date_text:
                continue
            if not is_recent_date(date_text, cutoff):
                continue
            page_has_recent = True
            if not is_relevant_release(title, dept, clean_text(file_names)):
                continue
            releases.append(build_release_article(
                source="금융위원회",
                title=title,
                link=urljoin(FSC_LIST_URL, link_match.group(1)),
                dept=clean_text(dept),
                date_text=date_text,
            ))
        if page_had_dated_rows and not page_has_recent:
            break
    return releases


def fetch_html(url: str) -> str:
    try:
        response = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0 news-monitor/1.0"})
        response.raise_for_status()
        return response.text or ""
    except Exception:
        return ""


def build_release_article(*, source: str, title: str, link: str, dept: str, date_text: str) -> dict:
    pub_date = datetime.strptime(date_text, "%Y-%m-%d").replace(hour=9, minute=0, tzinfo=KST)
    return {
        "title": title,
        "link": link,
        "description": f"{source} 공식 보도자료입니다. 담당부서: {dept or '확인 필요'}. 보험/GA/설계사/감독 문맥 중심으로 별도 확인합니다.",
        "pub_date": format_datetime(pub_date),
        "source": source,
        "keyword": "금융당국 보도자료",
        "keyword_query": "금융당국 보도자료",
        "keyword_category": "regulation",
        "keyword_strict_query": False,
        "portal": "regulator",
    }


def flatten_api_rows(value) -> list[dict]:
    rows: list[dict] = []
    if isinstance(value, dict):
        if any(key in value for key in ("title", "sj", "subject", "bbsSj", "nttSj")):
            rows.append(value)
        for item in value.values():
            rows.extend(flatten_api_rows(item))
    elif isinstance(value, list):
        for item in value:
            rows.extend(flatten_api_rows(item))
    return rows


def first_value(row: dict, *keys: str) -> str:
    for key in keys:
        if key in row and row[key]:
            return str(row[key])
    lowered = {str(key).lower(): value for key, value in row.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value:
            return str(value)
    return ""


def normalize_date_text(value: str) -> str:
    text = clean_text(value)
    match = re.search(r"(\d{4})[.-]?(\d{2})[.-]?(\d{2})", text)
    if not match:
        return ""
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"


def stable_slug(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]+", "-", clean_text(value)).strip("-")[:80]


def is_relevant_release(*parts: str) -> bool:
    text = " ".join(str(part or "") for part in parts)
    if any(word in text for word in REGULATOR_DIRECT_WORDS):
        return True
    has_generic_signal = any(word in text for word in REGULATOR_GENERIC_WORDS)
    has_insurance_context = any(word in text for word in ("보험", "손보", "생보", "GA", "설계사", "보험대리점"))
    return has_generic_signal and has_insurance_context


def is_recent_date(date_text: str, cutoff) -> bool:
    try:
        return datetime.strptime(date_text, "%Y-%m-%d").date() >= cutoff
    except ValueError:
        return False


def deduplicate_releases(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for row in rows:
        key = row.get("link") or row.get("title")
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def first_match(text: str, pattern: str) -> str:
    match = re.search(pattern, text or "", re.S | re.I)
    return clean_text(match.group(1)) if match else ""


def clean_text(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = html_module.unescape(text)
    return re.sub(r"\s+", " ", text).strip()
