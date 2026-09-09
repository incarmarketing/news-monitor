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


def is_daum_article(value: object) -> bool:
    try:
        url = urlparse(str(value or ""))
        return (url.scheme in {"http", "https"} and url.hostname == "v.daum.net"
                and not url.username and not url.password and url.port in {None, 80, 443}
                and re.fullmatch(r"/v/\d{17}", url.path) is not None)
    except ValueError:
        return False


def valid_page_evidence(evidence: dict) -> bool:
    if not isinstance(evidence, dict):
        return False
    name, url = valid_name(evidence.get("name")), evidence.get("url", "")
    host = host_of(url)
    if not name or not host or evidence.get("host") != host:
        return False
    if evidence.get("method") not in {"page_metadata", "page_copyright"}:
        return False
    if not is_portal(host):
        return True
    signals = evidence.get("signals")
    return (is_daum_article(url) and name in KNOWN_NAMES and evidence.get("method") == "page_copyright"
            and isinstance(signals, list) and "daum_site_name" in signals and "article_copyright" in signals)


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
    # Only spaced dashes separate the headline from its source. A hyphen
    # inside an official domain (g-enews.com) belongs to the publisher.
    parts = re.split(r"\s[-–]\s", text)
    suffix = parts[-1] if len(parts) > 1 else ""
    candidates = [suffix] if re.fullmatch(r"[^\n|]{2,60}", suffix) else []
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
    """Read site metadata and scoped copyright notices, not article prose."""

    _void = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
    _blocks = {"br", "div", "footer", "li", "p", "section", "ul"}

    def __init__(self, daum_article=False):
        super().__init__(convert_charrefs=True)
        self.site_names = set()
        self.titles = []
        self.schemas = []
        self.copyright_lines = set()
        self.daum_names = set()
        self.daum_copyright_lines = set()
        self._daum_article = daum_article
        self._frames = []
        self._title = False
        self._schema = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in self._blocks:
            self._copyright_text("\n")
        identity = " ".join(str(attrs.get(key) or "") for key in ("id", "class", "role"))
        blocked = (bool(self._frames and self._frames[-1]["blocked"])
                   or tag in {"script", "style", "noscript", "template", "blockquote", "figure", "figcaption", "aside"}
                   or bool(re.search(r"related|recommend|comment|photo|caption|advert|powered", identity, re.I)))
        scoped = tag == "footer" or attrs.get("role") == "contentinfo" or bool(re.search(r"copyright|copy[-_]right|footer", identity, re.I))
        # Daum places the ownership notice in a plain paragraph immediately
        # outside article_view, but inside news_view. Prose/photos stay excluded.
        daum_notice = (self._daum_article and tag == "p" and self._frames
                       and self._frames[-1].get("daum_body") and not blocked)
        if tag not in self._void:
            if len(self._frames) >= 256:
                raise ValueError("publisher_html_nesting_limit")
            self._frames.append({"tag": tag, "blocked": blocked,
                                 "text": [] if scoped and not blocked else None,
                                 "daum_body": self._daum_article and "news_view" in str(attrs.get("class") or "").split(),
                                 "daum_text": [] if daum_notice else None})
        if tag == "meta" and (attrs.get("property") or attrs.get("name") or "").lower() == "og:site_name":
            name = valid_name(attrs.get("content"))
            if name:
                self.site_names.add(name)
            if self._daum_article and not blocked:
                match = re.fullmatch(r"Daum\s*\|\s*(.+)", clean(attrs.get("content")), re.I)
                if match:
                    self.daum_names.add(valid_name(match.group(1)))
        if tag == "title":
            self._title = True
        if tag == "script" and (attrs.get("type") or "").lower() == "application/ld+json":
            self._schema = []

    def handle_endtag(self, tag):
        if tag in self._blocks:
            self._copyright_text("\n")
        for index in range(len(self._frames) - 1, -1, -1):
            if self._frames[index]["tag"] == tag:
                for frame in self._frames[index:]:
                    if frame["text"] is not None:
                        self.copyright_lines.update(clean(line) for line in "".join(frame["text"]).splitlines() if clean(line))
                    if frame.get("daum_text") is not None:
                        self.daum_copyright_lines.add(clean("".join(frame["daum_text"])))
                del self._frames[index:]
                break
        if tag == "title":
            self._title = False
        if tag == "script" and self._schema is not None:
            try:
                self.schemas.append(json.loads("".join(self._schema)))
            except (ValueError, RecursionError):
                pass
            self._schema = None

    def handle_data(self, data):
        self._copyright_text(data)
        if self._title:
            self.titles.append(data)
        if self._schema is not None:
            self._schema.append(data)

    def _copyright_text(self, text):
        if self._frames and self._frames[-1]["blocked"]:
            return
        for frame in self._frames:
            if frame["text"] is not None:
                frame["text"].append(text)
            if frame.get("daum_text") is not None:
                frame["daum_text"].append(text)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self._void:
            self.handle_endtag(tag)


def _copyright_owner(line: str) -> str:
    """Require an ownership notice, never a loose publisher-name substring."""
    if len(line) > 500:
        return ""
    text = clean(line).lstrip("[ ")
    prefix = re.match(r"^(?:copyright(?:s)?\s*(?:©|ⓒ|\(c\))?|저작권자\s*(?:©|ⓒ)?|©|ⓒ)\s*", text, re.I)
    if prefix:
        owner = text[prefix.end():]
        owner = re.sub(r"^\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?\s*[.,]?\s*)", "", owner)
        owner = re.split(r"all\s+rights|무단|재배포|unauthori[sz]ed|\s*[|\[\]]", owner, maxsplit=1, flags=re.I)[0]
    else:
        suffix = re.match(r"^([^©ⓒ]{2,60})\s*[©ⓒ]", text)
        if not suffix:
            return ""
        owner = suffix.group(1)
    owner = re.sub(r"^(?:주식회사|\(주\)|㈜)\s*", "", owner.strip())
    owner = owner.strip(" .,;:[]()")
    # Newsroom software, a photo agency and a parent company are not inferred
    # from generic corporate text. New brands need corroborating site metadata.
    return domain_name(owner) or valid_name(owner)


def publisher_from_html(document: str, page_url: str) -> dict | None:
    """Resolve original sites from metadata or a verified copyright notice.

    Uses HTML already fetched for body enrichment, so publisher recovery adds
    no requests or collection latency from a second crawl. Portal site branding
    and conflicting child/parent publication names must never become a source.
    """
    host = host_of(page_url)
    daum_article = is_daum_article(page_url)
    if not host or (is_portal(host) and not daum_article) or not document:
        return None
    page = _PublisherPage(daum_article=daum_article)
    try:
        page.feed(document[:2_000_000])
    except (ValueError, RecursionError):
        return None
    if daum_article:
        owners = {_copyright_owner(line) for line in page.daum_copyright_lines}
        owners.discard("")
        if len(page.daum_names) != 1 or owners != page.daum_names:
            return None
        owner = next(iter(owners))
        if owner not in KNOWN_NAMES:
            return None
        return {"name": owner, "method": "page_copyright", "host": host, "url": page_url,
                "signals": ["daum_site_name", "article_copyright"]}
    if len(page.site_names) > 1:
        return None
    name = next(iter(page.site_names), "")
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
    if len(schema_names) > 1 or (name and schema_names and schema_names != {name}):
        return None
    owners = {_copyright_owner(line) for line in page.copyright_lines}
    owners = {owner for owner in owners if owner and (owner in KNOWN_NAMES or owner in page.site_names or owner in schema_names)}
    if len(owners) > 1:
        return None
    if owners:
        owner = next(iter(owners))
        title_brands = {valid_name(part) for part in title_parts if valid_name(part) in KNOWN_NAMES}
        identities = page.site_names | schema_names | title_brands
        mapped = domain_name(page_url)
        if (identities and identities != {owner}) or (mapped and mapped != owner):
            return None
        signals = ["copyright"]
        if owner in page.site_names:
            signals.append("og_site_name")
        if owner in schema_names:
            signals.append("schema_publisher")
        return {"name": owner, "method": "page_copyright", "host": host, "url": page_url, "signals": signals}
    if name and (title_agrees or schema_names == {name}):
        return {"name": name, "method": "page_metadata", "host": host, "url": page_url}
    return None


def enrich_from_html(article: dict, document: str, page_url: str) -> None:
    if resolve_publisher(article)["name"] != UNKNOWN:
        return
    evidence = publisher_from_html(document, page_url)
    if evidence:
        article.setdefault("source_raw", article.get("source", ""))
        article["source"] = evidence["name"]
        article["publisher_evidence"] = evidence
