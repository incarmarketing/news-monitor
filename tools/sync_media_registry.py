"""Bounded byline enrichment; never sends messages or changes article classification."""

from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media_byline import VERSION, extract_bylines
from tools.backfill_publisher_identity import save_page_evidence
import publisher_identity
import supabase_store

USER_AGENT = os.getenv("NEWS_COLLECTOR_USER_AGENT", "NewsRSSReader/1.0")
_host_locks = {}
_robots = {}
_lock = threading.Lock()


def public_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.port not in {None, 80, 443}:
        raise ValueError("invalid_public_article_url")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    if not addresses or any(not ipaddress.ip_address(entry[4][0]).is_global for entry in addresses):
        raise ValueError("non_public_article_url")
    return parsed


def fetch_document(url):
    deadline = time.monotonic() + 20
    for _ in range(5):
        public_url(url)
        with requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"}, timeout=(4, 6), stream=True, allow_redirects=False) as response:
            if response.is_redirect:
                url = urljoin(url, response.headers.get("Location", ""))
                continue
            response.raise_for_status()
            if "text/" not in response.headers.get("Content-Type", "text/html"):
                raise ValueError("not_text")
            chunks, size = [], 0
            for chunk in response.iter_content(16384):
                size += len(chunk)
                if size > 2_000_000 or time.monotonic() > deadline:
                    raise ValueError("article_fetch_limit")
                chunks.append(chunk)
            response._content = b"".join(chunks)
            if not response.encoding or response.encoding.lower() == "iso-8859-1":
                response.encoding = response.apparent_encoding or "utf-8"
            return response.text, url
    raise ValueError("redirect_limit")


def inspect_article(row):
    raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
    evidence = raw.get("publisher_evidence") if isinstance(raw.get("publisher_evidence"), dict) else {}
    evidence_url = row.get("publisher_evidence_url") or evidence.get("url", "")
    url = row.get("original_url") or (evidence_url if publisher_identity.is_daum_article(evidence_url) else "") or row.get("link") or ""
    result = {"article_hash": row["article_hash"], "authors": [], "status": "fetch_failed",
              "evidence_url": url, "checked_at": datetime.now(timezone.utc).isoformat(),
              "attempts": int(row.get("attempts") or 0) + 1, "parser_version": VERSION}
    if not url or (publisher_identity.is_portal(url) and not publisher_identity.is_daum_article(url)):
        result["status"] = "needs_original"
        return result
    host = urlparse(url).netloc
    with _lock:
        host_lock = _host_locks.setdefault(host, threading.Lock())
    try:
        with host_lock:
            if host not in _robots:
                robot_url = urljoin(url, "/robots.txt")
                robots = RobotFileParser(robot_url)
                try:
                    content, _ = fetch_document(robot_url)
                    robots.parse(content.splitlines())
                except requests.HTTPError as error:
                    if error.response.status_code not in {404, 410}:
                        raise
                    robots.parse([])
                _robots[host] = robots
            if not _robots[host].can_fetch(USER_AGENT, url):
                result["status"] = "not_found"
                return result
            delay = max(_robots[host].crawl_delay(USER_AGENT) or 1, 1)
            if delay > 10:
                return result
            time.sleep(delay)
            document, final_url = fetch_document(url)
            result["evidence_url"] = final_url
            if publisher_identity.resolve_publisher(row)["name"] == publisher_identity.UNKNOWN:
                evidence = publisher_identity.publisher_from_html(document, final_url)
                if evidence:
                    result["publisher_evidence"] = evidence
            result["authors"] = extract_bylines(document)
            result["status"] = "verified" if result["authors"] else "not_found"
    except (requests.RequestException, ValueError, OSError):
        pass
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--input", help="Offline candidate JSON for an authorized one-off audit")
    parser.add_argument("--output", default="out/media-byline-audit.json")
    args = parser.parse_args()
    rows = (json.loads(Path(args.input).read_text(encoding="utf-8")) if args.input else
            supabase_store.request("POST", "rpc/get_media_byline_candidates", json={"p_limit": args.limit}).json())
    counts = Counter()
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(inspect_article, rows[:args.limit]):
            if args.apply:
                evidence = result.get("publisher_evidence")
                publisher_status = "unchanged"
                if evidence:
                    publisher_status = save_page_evidence(result["article_hash"], evidence)
                    counts["publisher_" + publisher_status] += 1
                byline = {key: value for key, value in result.items() if key != "publisher_evidence"}
                # Do not mark the candidate complete before its publisher is
                # saved; a concurrent update must remain eligible for retry.
                if publisher_status not in {"conflict", "failed"}:
                    supabase_store.request("POST", "article_byline_evidence?on_conflict=article_hash", json=[byline])
            results.append(result)
            counts[result["status"]] += 1
            if len(results) % 25 == 0:
                print(json.dumps({"checked": len(results), "status": counts}), flush=True)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"checked": len(results), "status": counts, "applied": args.apply}), flush=True)


if __name__ == "__main__":
    main()
