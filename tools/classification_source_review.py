"""Bounded source rechecks. Evidence is private; no article or alert is changed."""

import hashlib
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import re
import time
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests

import analyzer
import publisher_identity
from article_quality import is_media_url
from tools.audit_classification_drift import article_from_row
from tools import validate_classification_gold as gold
from tools.sync_media_registry import USER_AGENT, fetch_document

MAX_RECHECKS = 5
MAX_SECONDS = 120


class ArticleBody(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.parts, self.titles = [], [], []
        self.root = None
        self.title_depth = None
        self.skip_depth = None
        self.completed = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"meta", "link", "img", "br", "hr", "input", "source", "wbr"}:
            if tag == "meta" and attrs.get("property") == "og:title":
                self.titles.append(attrs.get("content", ""))
            if tag in {"br", "hr"} and self.root is not None:
                self.parts.append(" ")
            return
        self.stack.append(tag)
        depth = len(self.stack)
        marker = " ".join(attrs.get(key, "") for key in ("id", "class", "itemprop"))
        if self.root is None and not self.completed and (tag == "article" or re.search(
                r"article-view-content-div|articleBody|article[_-](?:body|content)|news[_-]body", marker, re.I)):
            self.root = depth
        if tag == "h1" and self.title_depth is None:
            self.title_depth = depth
        if self.root is not None and self.skip_depth is None and (
                tag in {"aside", "nav", "footer", "header", "figure", "figcaption", "script", "style", "form"}
                or re.search(r"related|copyright|caption|recommend|byline", marker, re.I)):
            self.skip_depth = depth

    def handle_endtag(self, tag):
        if tag not in self.stack:
            return
        depth = len(self.stack) - self.stack[::-1].index(tag)
        if self.title_depth is not None and depth <= self.title_depth:
            self.title_depth = None
        if self.skip_depth is not None and depth <= self.skip_depth:
            self.skip_depth = None
        if self.root is not None and depth <= self.root:
            self.root, self.completed = None, True
        self.stack = self.stack[:depth - 1]
        self.parts.append(" ")

    def handle_data(self, data):
        if self.title_depth is not None:
            self.titles.append(data)
        if self.root is not None and self.skip_depth is None:
            self.parts.append(data)

    def body(self):
        return re.sub(r"\s+", " ", "".join(self.parts)).strip()


def fingerprint(row):
    article = article_from_row(row)
    return hashlib.sha256("\n".join(str(article.get(key) or "") for key in
                                  ("title", "link", "description", "body", "content")).encode()).hexdigest()


def check_robots(url, cache):
    host = urlparse(url).netloc
    if host not in cache:
        robot_url = urljoin(url, "/robots.txt")
        robot = RobotFileParser(robot_url)
        try:
            document, _ = fetch_document(robot_url, deadline=cache.get("deadline"))
            robot.parse(document.splitlines())
        except requests.HTTPError as error:
            if error.response.status_code not in {404, 410}:
                raise
            robot.parse([])
        cache[host] = robot
    robot = cache[host]
    if not robot.can_fetch(USER_AGENT, url):
        raise ValueError("robots_disallowed")
    delay = max(robot.crawl_delay(USER_AGENT) or 1, 1)
    if delay > 5:
        raise ValueError("crawl_delay_exceeds_review_budget")
    time.sleep(delay)


def inspect(row, cache):
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    url = raw.get("_original_url") or row.get("link") or ""
    if not url or is_media_url(url) or publisher_identity.host_of(url) == "news.google.com":
        return {"status": "needs_original"}
    document, final_url = fetch_document(url, before_request=lambda u: check_robots(u, cache), deadline=cache.get("deadline"))
    if is_media_url(final_url):
        return {"status": "non_article"}
    parser = ArticleBody()
    parser.feed(document)
    tokens = set(re.findall(r"[가-힣A-Za-z0-9]{2,}", row.get("title") or ""))
    heading = " ".join(parser.titles)
    overlap = sum(token in heading for token in tokens) / max(1, len(tokens))
    body = parser.body()
    if overlap < .6 or len(body) < 120:
        return {"status": "source_unverified"}
    article = article_from_row(row)
    article["body"] = body[:16000]
    context = gold.classify(article)
    return {"status": "source_verified_review", "evidence_url": final_url,
            "source_excerpt": body[:800], "source_hash": hashlib.sha256(body.encode()).hexdigest(),
            "proposed": {key: context.get(key) for key in
                         ("category", "tone", "own_mentioned", "negative_target", "alert_eligible")},
            "reason": context.get("reason") or "원문을 확보해 재검사했습니다. 당사·논조·경보 변경은 검토 후 확정합니다."}


def recheck(rows, reviews, previous, now=None, inspect_fn=inspect):
    now = now or datetime.now(timezone.utc)
    index = {row["id"]: row for row in rows}
    results, cache = [], {}
    started = time.monotonic()
    cache["deadline"] = started + MAX_SECONDS
    for review in reviews:
        if len(results) >= MAX_RECHECKS or time.monotonic() - started >= MAX_SECONDS:
            break
        if review.get("manual") or review.get("evidence_status") not in {"original_required", "limited_source"}:
            continue
        row = index.get(review["id"])
        if not row:
            continue
        key = fingerprint(row)
        old = previous.get(key, {})
        checked = datetime.fromisoformat(old["checked_at"]) if old.get("checked_at") else None
        if checked and now - checked < timedelta(hours=24):
            continue
        if old.get("attempts", 0) >= 3:
            continue
        result = {"id": row["id"], "fingerprint": key, "checked_at": now.isoformat(),
                  "attempts": old.get("attempts", 0) + 1}
        try:
            result.update(inspect_fn(row, cache))
        except (ValueError, OSError, requests.RequestException):
            result["status"] = "source_fetch_failed"
        results.append(result)
        if result.get("status") == "source_verified_review":
            review.update(proposed=result["proposed"], source_excerpt=result["source_excerpt"][:240],
                          evidence_status=result["status"], reason=result["reason"], protected=True)
    return results
