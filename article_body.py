"""Extract article text from its DOM scope, excluding surrounding page content."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import html
from html.parser import HTMLParser
import re


SOURCE_SCOPE_VERSION = "article-body-dom-2026-10-13-v1"
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
BLOCK_TAGS = {"article", "blockquote", "div", "h1", "h2", "h3", "h4", "li", "p", "section", "tr", "ul", "ol"}
EXCLUDED_TAGS = {"aside", "nav", "footer", "header", "script", "style", "figure", "figcaption", "button", "noscript", "iframe"}
EXCLUDED_MARKER = re.compile(
    r"(?:^|[\s_-])(?:related(?:articles?)?|relation|relate|recommend(?:ed|ation)?|popular|ranking|sidebar|"
    r"copyright|share|social|byline|author|reporter|comments?|advert(?:isement)?|ads?|"
    r"photo(?:layout)?|caption|tag(?:s|box)?|auto-article|box-skin)(?:$|[\s_-])", re.I,
)
BODY_IDS = {"article-view-content-div", "articlebody", "articlebodycontents", "dic_area", "newsct_article", "arttext", "newsendcontents", "newsbody", "news_body", "article_body", "articlebodycontent", "articlecontent", "contentbody", "readarea", "ctl00_contentplaceholder1_webnewsview_ltcontentdiv"}
BODY_MARKER = re.compile(
    r"(?:^|\s)(?:article[-_](?:body|content|cont|veiw-body)|article-view-content(?:-div)?|"
    r"news[-_](?:body|content|article)|view-content|view_con_wrap|rns_text|contentbody)(?:$|\s)", re.I,
)


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list = field(default_factory=list)
    excluded: bool = False


class ArticleDocument(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]
        self.candidates = []
        self.titles = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("property", "").lower() == "og:title":
            self.titles.append(attrs.get("content", ""))
        if tag in BLOCK_TAGS and self.stack[-1].tag == "p":
            self.stack.pop()
        marker = " ".join(attrs.get(key, "") for key in ("id", "class", "role"))
        # ASP.NET pages wrap the whole document in a form; only embedded forms
        # inside an article are non-editorial widgets.
        embedded_form = tag == "form" and any(
            node is ancestor for _, node, _ in self.candidates for ancestor in self.stack)
        excluded = (self.stack[-1].excluded or tag in EXCLUDED_TAGS
                    or embedded_form
                    or bool(EXCLUDED_MARKER.search(marker)) or attrs.get("aria-hidden") == "true"
                    or "hidden" in attrs)
        node = Node(tag, attrs, excluded=excluded)
        self.stack[-1].children.append(node)
        if not excluded:
            identity = attrs.get("id", "").lower()
            if attrs.get("itemprop", "").lower() == "articlebody" or identity in BODY_IDS:
                self.candidates.append((0, node, "explicit_body"))
            elif BODY_MARKER.search(marker):
                self.candidates.append((1, node, "explicit_body"))
            elif tag == "article":
                self.candidates.append((2, node, "article_element"))
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                break

    def handle_data(self, data):
        if not self.stack[-1].excluded:
            self.stack[-1].children.append(data)


def node_text(node):
    if node.excluded:
        return ""
    parts = [child if isinstance(child, str) else node_text(child) for child in node.children]
    text = "".join(parts)
    return "\n" + text + "\n" if node.tag in BLOCK_TAGS or node.tag in {"br", "hr"} else text


def normalize_text(text):
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def extract_article_body(document, *, min_length=120):
    parser = ArticleDocument()
    parser.feed(document or "")
    candidates = [(rank, normalize_text(node_text(node)), method) for rank, node, method in parser.candidates]
    candidates = [item for item in candidates if len(item[1]) >= min_length]
    if not candidates:
        return {"body": "", "method": "unverified", "version": SOURCE_SCOPE_VERSION}
    best_rank = min(item[0] for item in candidates)
    # Length resolves only equally scoped bodies, never an entire-page fallback.
    _, body, method = max((item for item in candidates if item[0] == best_rank), key=lambda item: len(item[1]))
    return {"body": body, "method": method, "version": SOURCE_SCOPE_VERSION}


def sanitize_rss_body(fragment):
    parser = ArticleDocument()
    parser.feed(fragment or "")
    return normalize_text(node_text(parser.root))


def body_scope(body, method, source_url):
    return {"version": SOURCE_SCOPE_VERSION, "method": method, "source_url": source_url,
            "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest()}


def verified_body(article):
    scope = article.get("_body_scope") or {}
    body = str(article.get("body") or article.get("content") or "")
    return bool(body and isinstance(scope, dict) and scope.get("version") == SOURCE_SCOPE_VERSION
                and scope.get("method") in {"explicit_body", "article_element", "official_rss"}
                and scope.get("body_sha256") == hashlib.sha256(body.encode("utf-8")).hexdigest())


def replace_source_fields(article, *, title, description, body, method, source_url):
    """Replace source text together; never mix a new body with old raw text."""
    updated = dict(article)
    raw = dict(article.get("raw") or {})
    for target in (updated, raw):
        for key in ("title", "description", "body", "content", "_body_scope",
                    "_source_evidence_scope", "_ai_context", "ai_context"):
            target.pop(key, None)
    fields = {"title": title, "description": description, "body": body, "content": body,
              "_body_scope": body_scope(body, method, source_url)}
    updated.update(fields)
    raw.update(fields)
    updated["raw"] = raw
    return updated


def source_evidence_scope(article, text):
    """Keep a bounded, verbatim evidence sentence when full-body storage is off."""
    text = str(text or "")[:500].strip()
    body = str(article.get("body") or article.get("content") or "")
    if not text or not verified_body(article):
        return None
    if re.sub(r"\s+", " ", html.unescape(text)) not in re.sub(r"\s+", " ", html.unescape(body)):
        return None
    return {"version": "article-source-evidence-2026-10-14-v1", "text": text,
            "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "title_sha256": hashlib.sha256(str(article.get("title") or "").encode("utf-8")).hexdigest(),
            "article_link": str(article.get("link") or ""), "body_scope": dict(article["_body_scope"])}


def verified_source_evidence(article):
    raw = article.get("raw") if isinstance(article.get("raw"), dict) else {}
    proof = article.get("_source_evidence_scope") or raw.get("_source_evidence_scope") or {}
    if not isinstance(proof, dict):
        return ""
    scope = proof.get("body_scope") or {}
    text = str(proof.get("text") or "")
    title = str(article.get("title") or raw.get("title") or "")
    link = str(article.get("link") or raw.get("link") or "")
    if (not isinstance(scope, dict) or not 0 < len(text) <= 500
            or proof.get("version") != "article-source-evidence-2026-10-14-v1"
            or scope.get("version") != SOURCE_SCOPE_VERSION
            or scope.get("method") not in {"explicit_body", "article_element", "official_rss"}
            or not re.fullmatch(r"[0-9a-f]{64}", str(scope.get("body_sha256") or ""))
            or not link or proof.get("article_link") != link
            or proof.get("title_sha256") != hashlib.sha256(title.encode("utf-8")).hexdigest()
            or proof.get("text_sha256") != hashlib.sha256(text.encode("utf-8")).hexdigest()):
        return ""
    current_scope = article.get("_body_scope") or raw.get("_body_scope") or {}
    if current_scope and (not isinstance(current_scope, dict)
                          or current_scope.get("body_sha256") != scope.get("body_sha256")):
        return ""
    return text
