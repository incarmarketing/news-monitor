"""Conservative, evidence-backed author extraction. Never infer from article subjects."""

from __future__ import annotations

from html.parser import HTMLParser
import json
import re
from publisher_identity import KNOWN_NAMES

VERSION = "byline-v1"
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BYLINE = re.compile(r"(?:^|[ _-])(byline|writer|reporter|journalist|article-writer|article-info)(?:$|[ _-])", re.I)


def author_name(value):
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    value = EMAIL.sub("", value)
    value = re.sub(r"(?:(?:선임|전문|수석|객원|명예)\s*)?(?:기자|특파원|논설위원|편집위원)\s*$", "", value).strip(" []()·,")
    if value in KNOWN_NAMES or value in {"선임", "전문", "수석", "객원", "명예", "편집국", "구독한", "구독", "사진", "영상", "취재", "보도", "경제부", "사회부", "연예부", "스포츠부"}:
        return ""
    if re.search(r"(?:취재|편집|체육|정치|경제|사회|금융|산업|문화).*(?:부|팀|국)$", value):
        return ""
    if any(word in value for word in ("뉴스", "신문", "편집부", "관리자", "취재팀", "온라인", "대표", "지점장", "admin", "http", "@")):
        return ""
    if re.fullmatch(r"[가-힣]{2,5}", value) or re.fullmatch(r"[A-Za-z][A-Za-z.'-]+(?: [A-Za-z][A-Za-z.'-]+){1,4}", value):
        return value
    return ""


class BylinePage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = []
        self.blocks = []
        self.jsonld = []
        self.stack = []
        self.capture = None
        self.script = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and (attrs.get("name") or attrs.get("property") or "").lower() in {"author", "article:author", "parsely-author", "dc.creator"}:
            self.meta.append(attrs.get("content", ""))
        if tag in {"meta", "link", "br", "hr", "img", "input", "source", "wbr", "area", "base", "embed", "param", "track", "col"}:
            return
        self.stack.append(tag)
        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self.script = []
        marker = f"{attrs.get('class','')} {attrs.get('id','')}"
        if self.capture is None and "footer" not in self.stack and (BYLINE.search(marker) or attrs.get("itemprop") == "author"):
            self.capture = (len(self.stack), [])

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            self.jsonld.append("".join(self.script))
            self.script = None
        if tag not in self.stack:
            return
        index = len(self.stack) - 1 - self.stack[::-1].index(tag)
        if self.capture and index < self.capture[0]:
            self.blocks.append(" ".join(self.capture[1]))
            self.capture = None
        self.stack = self.stack[:index]

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)
        elif self.capture and "script" not in self.stack and "style" not in self.stack:
            self.capture[1].append(data)


def extract_bylines(document):
    page = BylinePage()
    page.feed(document[:2_000_000])
    found = {}
    article_seen = False

    def add(value, method, email=""):
        name = author_name(value)
        if not name:
            return
        row = found.setdefault(name, {"name": name, "method": method})
        if EMAIL.fullmatch(email or ""):
            row["email"] = email

    def visit(node):
        nonlocal article_seen
        if isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, dict):
            types = node.get("@type", [])
            if isinstance(types, str):
                types = [types]
            if not article_seen and any(t in {"NewsArticle", "Article", "ReportageNewsArticle", "AnalysisNewsArticle"} for t in types):
                article_seen = True
                authors = node.get("author", [])
                for author in authors if isinstance(authors, list) else [authors]:
                    if isinstance(author, str):
                        add(author, "article_jsonld")
                    elif isinstance(author, dict) and author.get("@type", "Person") == "Person":
                        add(author.get("name"), "article_jsonld", author.get("email", ""))
            for key in ("@graph", "mainEntity"):
                visit(node.get(key))

    for data in page.jsonld:
        try:
            visit(json.loads(data))
        except (ValueError, TypeError, RecursionError):
            pass
    if not found:
        for value in page.meta:
            for part in re.split(r"[,;]|\s+및\s+", value):
                add(part, "author_meta")
    primary_names = set(found)
    for block in page.blocks:
        if len(block) > 450:
            continue
        names = [name for name in re.findall(r"(?<![가-힣])([가-힣]{2,5})\s*(?:(?:선임|전문|수석|객원|명예)\s*)?(?:기자|특파원|논설위원)(?![가-힣])", block) if author_name(name)]
        emails = EMAIL.findall(block)
        unambiguous_contact = len(set(names)) == 1 and len(set(emails)) == 1
        if primary_names:
            names = [name for name in names if name in primary_names]
        for name in names:
            add(name, "byline", emails[0] if unambiguous_contact else "")
        if names and not primary_names:
            break
    return list(found.values())[:10]
