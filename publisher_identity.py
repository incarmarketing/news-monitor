"""Resolve publisher identity without confusing a distributor with a publisher.

This module is deliberately network-free: collection, historical repair and
rendering use the same registry without adding per-article HTTP requests.
"""

from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
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
    manual = valid_name(article.get("publisher_manual_override") or raw.get("publisher_manual_override"))
    if manual:
        return {"name": manual, "method": "admin_article_override", "host": host_of(article.get("link"))}
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


class _PublisherPage(HTMLParser):
    """Read only site identity fields, never arbitrary article/body text."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.site_names = set()
        self.titles = []
        self.schemas = []
        self._title = False
        self._schema = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and (attrs.get("property") or attrs.get("name") or "").lower() == "og:site_name":
            name = valid_name(attrs.get("content"))
            if name:
                self.site_names.add(name)
        if tag == "title":
            self._title = True
        if tag == "script" and (attrs.get("type") or "").lower() == "application/ld+json":
            self._schema = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._title = False
        if tag == "script" and self._schema is not None:
            try:
                self.schemas.append(json.loads("".join(self._schema)))
            except (ValueError, RecursionError):
                pass
            self._schema = None

    def handle_data(self, data):
        if self._title:
            self.titles.append(data)
        if self._schema is not None:
            self._schema.append(data)


def publisher_from_html(document: str, page_url: str) -> dict | None:
    """Resolve unknown original sites from two agreeing identity signals.

    Uses HTML already fetched for body enrichment, so publisher recovery adds
    no requests or collection latency from a second crawl. Portal site branding
    and conflicting child/parent publication names must never become a source.
    """
    host = host_of(page_url)
    if not host or is_portal(host) or not document:
        return None
    page = _PublisherPage()
    try:
        page.feed(document[:1_000_000])
    except (ValueError, RecursionError):
        return None
    if len(page.site_names) != 1:
        return None
    name = next(iter(page.site_names))
    # An arbitrary phrase in an article title is not site-brand evidence.
    title_parts = {clean(part) for part in re.split(r"\s+[|\-–]\s+", "".join(page.titles))}
    title_agrees = name in title_parts
    schema_names = set()
    nodes = list(page.schemas)
    examined = 0
    while nodes and examined < 100:
        node = nodes.pop()
        examined += 1
        if isinstance(node, list):
            nodes.extend(node[:100])
            continue
        if not isinstance(node, dict):
            continue
        graph = node.get("@graph")
        if isinstance(graph, list):
            nodes.extend(graph[:100])
        types = node.get("@type", [])
        types = [types] if isinstance(types, str) else types
        if not isinstance(types, list) or not any(t in {"NewsArticle", "Article", "ReportageNewsArticle", "WebSite"} for t in types if isinstance(t, str)):
            continue
        publisher = node.get("publisher")
        if not isinstance(publisher, dict):
            continue
        org_type = publisher.get("@type")
        if org_type not in ("Organization", "NewsMediaOrganization"):
            continue
        candidate = valid_name(publisher.get("name"))
        publisher_url = publisher.get("url") or publisher.get("@id")
        if candidate and (not publisher_url or host_of(publisher_url) == host):
            schema_names.add(candidate)
    if schema_names and schema_names != {name}:
        return None
    if not title_agrees and schema_names != {name}:
        return None
    return {"name": name, "method": "page_metadata", "host": host, "url": page_url}


def enrich_from_html(article: dict, document: str, page_url: str) -> None:
    if resolve_publisher(article)["name"] != UNKNOWN:
        return
    evidence = publisher_from_html(document, page_url)
    if evidence:
        article.setdefault("source_raw", article.get("source", ""))
        article["source"] = evidence["name"]
        article["publisher_evidence"] = evidence
