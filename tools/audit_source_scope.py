"""Read-only comparison of stored alerts with bounded original-page evidence."""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import analyzer
import article_body
import deterministic_risk
import news_collector
from tools import validate_classification_gold as gold
from tools.sync_media_registry import fetch_document


def inspect(row):
    result = {"id": row["id"], "title": row["title"], "link": row["link"], "expected_updated_at": row.get("updated_at"),
              "before": {key: row.get(key) for key in ("category", "tone", "own_mentioned", "alert_eligible")}}
    try:
        link = row.get("raw", {}).get("_original_url") or row["link"]
        try:
            document, final_url = fetch_document(link)
        except Exception:
            parsed = urlsplit(link)
            if parsed.scheme != "http":
                raise
            document, final_url = fetch_document(urlunsplit(parsed._replace(scheme="https")))
        heading = news_collector.extract_article_title_from_html(document)
        tokens = set(re.findall(r"[가-힣A-Za-z0-9]{2,}", row["title"]))
        overlap = sum(token in heading for token in tokens) / max(len(tokens), 1)
        extraction = article_body.extract_article_body(document)
        body = extraction["body"][:5000]
        if overlap < .6 or len(body) < 120:
            return {**result, "status": "source_unverified", "title_overlap": overlap, "body_length": len(body)}
        article = {"title": heading, "link": final_url, "description": news_collector.extract_article_description_from_html(document),
                   "body": body, "content": body, "source": row["source"], "keyword": row.get("raw", {}).get("keyword", ""),
                   "_body_scope": article_body.body_scope(body, extraction["method"], final_url)}
        context = gold.classify(article)
        decision = deterministic_risk.classify(article)
        status = "confirmed_page_contamination" if not decision["own_mentioned"] and (
            row.get("own_mentioned") or row.get("category") == "own" or row.get("alert_eligible")) else (
            "retained_direct_alert" if decision["alert_eligible"] else "review_required")
        return {**result, "status": status, "article": article, "after": context, "decision": decision,
                "title_overlap": overlap, "body_length": len(body)}
    except Exception as error:
        return {**result, "status": "source_fetch_failed", "error_type": type(error).__name__}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--rules", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if len(rows) > 60:
        raise ValueError("Source audit is limited to 60 articles")
    analyzer.configure_context_rules([r for r in json.loads(Path(args.rules).read_text(encoding="utf-8")) if r.get("enabled")])
    groups = defaultdict(list)
    for row in rows:
        groups[urlsplit(row["link"]).hostname].append(row)

    def inspect_host(group):
        results = []
        for row in group:
            results.append(inspect(row))
            time.sleep(1)
        return results

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = [item for group in pool.map(inspect_host, groups.values()) for item in group]
    report = {"ruleset": analyzer.classification_ruleset_version(), "counts": dict(Counter(row["status"] for row in results)), "items": results}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"counts": report["counts"], "items": [{k: r.get(k) for k in ("id", "title", "status", "body_length")} for r in results]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
