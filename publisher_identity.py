"""Resolve publisher identity without confusing a distributor with a publisher.

This module is deliberately network-free: collection, historical repair and
rendering use the same registry without adding per-article HTTP requests.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from urllib.parse import urlparse

REGISTRY = json.loads(Path(__file__).with_name("publisher_registry.json").read_text(encoding="utf-8"))
DOMAIN_NAMES = REGISTRY["domains"]
NAME_ALIASES = REGISTRY["name_aliases"]
UNKNOWN = "언론사 확인 필요"
ALIASES: dict[str, str] = {}
PORTAL_NAMES = {value.lower() for value in REGISTRY["portal_names"]}
KNOWN_NAMES = set(DOMAIN_NAMES.values()) | set(NAME_ALIASES.values()) | set(REGISTRY["known_names"])


def clean(value: object) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]*>", "", str(value or ""))).split()).strip()


def host_of(value: object) -> str:
    raw = clean(value).rstrip("./").lower()
    if not raw or " " in raw or "." not in raw:
        return ""
    try:
        host = urlparse(raw if "://" in raw else "https://" + raw).hostname or ""
    except ValueError:
        return ""
    return host.removeprefix("www.").rstrip(".")


def is_portal(value: object) -> bool:
    if clean(value).lower() in PORTAL_NAMES:
        return True
    host = host_of(value)
    return any(host == domain or host.endswith("." + domain) for domain in REGISTRY["portal_domains"])


def valid_name(value: object) -> str:
    name = clean(value)
    name = NAME_ALIASES.get(name, name)
    if not name or is_portal(name) or name in {UNKNOWN, "언론사 확인", "미확인", "출처 확인"}:
        return ""
    if name in KNOWN_NAMES:
        return name
    if host_of(name) or len(name) > 40 or re.search(r"[<>{}]|https?://", name):
        return ""
    return name


def configure_aliases(rows: list[dict]) -> None:
    ALIASES.clear()
    for row in rows:
        host, name = host_of(row.get("host")), valid_name(row.get("press_name"))
        if host and name and not is_portal(host):
            ALIASES[host] = name


def domain_name(value: object, aliases_only: bool = False) -> str:
    host = host_of(value)
    if not host or is_portal(host):
        return ""
    mapping = ALIASES if aliases_only else {**DOMAIN_NAMES, **ALIASES}
    # Exact domains and only www/mobile variants. A parent brand must not
    # swallow distinct publications such as IT Chosun and Sports Chosun.
    return mapping.get(host) or (mapping.get(host[2:]) if host.startswith("m.") else "") or ""


def title_publisher(title: object) -> str:
    text = clean(title)
    match = re.search(r"\s[-–]\s([^-–\n|]{2,60})$", text)
    candidates = [match.group(1)] if match else []
    bracket = re.match(r"^\[([^\]]{2,30})\]", text)
    if bracket:
        # Bracket text is commonly a column name, so require a known publisher.
        candidate = domain_name(bracket.group(1)) or NAME_ALIASES.get(bracket.group(1), bracket.group(1))
        if candidate in KNOWN_NAMES:
            candidates.append(candidate)
    for candidate in candidates:
        mapped = domain_name(candidate)
        if mapped:
            return mapped
        name = valid_name(candidate)
        if name in KNOWN_NAMES:
            return name
        if name and len(name) <= 20 and not re.search(r"기자|특파원|단독|종합|속보|기획", name) and re.search(
            r"(뉴스|신문|경제|일보|저널|매일|타임스|투데이|데일리|포스트|방송|스포츠|신보|이슈|프레스)$", name
        ):
            return name
    return ""


def resolve_publisher(article: dict) -> dict:
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    source = article.get("source") or raw.get("source") or raw.get("source_raw") or ""
    rss_name = article.get("rss_source_name") or raw.get("rss_source_name")
    rss_url = article.get("source_url") or raw.get("source_url")
    link = article.get("link") or raw.get("link") or ""
    for value in (rss_url, link, source):
        name = domain_name(value, aliases_only=True)
        if name:
            return {"name": name, "method": "admin_alias", "host": host_of(value)}
    for value, method in ((rss_url, "rss_source_domain"), (link, "original_domain"), (source, "source_domain")):
        name = domain_name(value)
        if name:
            return {"name": name, "method": method, "host": host_of(value)}
    # <source> is Google RSS's publisher field, not the feed/channel title.
    name = valid_name(rss_name)
    if name:
        return {"name": name, "method": "rss_source_name", "host": host_of(rss_url)}
    name = valid_name(source)
    if name:
        return {"name": name, "method": "stored_name", "host": host_of(link)}
    name = title_publisher(article.get("title") or raw.get("title"))
    if name:
        return {"name": name, "method": "title_suffix", "host": host_of(link)}
    original_source = article.get("source_raw") or raw.get("source_raw")
    name = domain_name(original_source)
    if name:
        return {"name": name, "method": "preserved_source_domain", "host": host_of(original_source)}
    return {"name": UNKNOWN, "method": "unresolved", "host": host_of(rss_url or link or source)}


def normalize_article(article: dict) -> dict:
    result = resolve_publisher(article)
    return {
        **article,
        "source_raw": article.get("source_raw", article.get("source", "")),
        "source": result["name"],
        "publisher_resolution": result,
    }
