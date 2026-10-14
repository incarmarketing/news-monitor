"""Manually recover reviewed, unsent historical alerts without changing watch rules."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

import article_body
import deterministic_risk
import negative_watch
import supabase_store as store

KST = timezone(timedelta(hours=9))


def rows(path: str) -> list[dict]:
    value = store.request("GET", path).json()
    if not isinstance(value, list):
        raise RuntimeError("Database lookup returned invalid rows; delivery stopped")
    return value


def already_sent(article: dict) -> bool:
    # Fail closed on ledger errors; historical recovery must never guess.
    titles = {negative_watch.alert_title_for_article(article),
              f"부정기사 감지 {negative_watch.legacy_article_key(article)}"}
    return any(store.notification_already_sent("negative_alert", title, channel="slack", strict=True)
               for title in titles)


def validate_reviewed_article(article: dict, repair: dict, now: datetime) -> str:
    before = repair.get("before") or {}
    expected = repair.get("patch") or {}
    if (article.get("id") != repair.get("id")
            or article.get("article_hash") != before.get("article_hash")
            or article.get("title") != before.get("title") or article.get("link") != before.get("link")):
        raise RuntimeError("Reviewed article identity changed; delivery stopped")
    for key, value in {"tone": "negative", "own_mentioned": True,
                       "negative_target": "own", "alert_eligible": True}.items():
        if article.get(key) != value or expected.get(key) != value:
            raise RuntimeError("Article is no longer a reviewed own-negative alert")
    evidence = article_body.verified_source_evidence(article)
    reviewed_evidence = article_body.verified_source_evidence({**before, **expected})
    if not evidence or evidence != reviewed_evidence:
        raise RuntimeError("Reviewed source evidence changed or is missing")
    if deterministic_risk.classify(article).get("alert_eligible") is not True:
        raise RuntimeError("Current source-only classifier does not allow this alert")
    published = datetime.fromisoformat(str(article.get("pub_date") or "").replace("Z", "+00:00"))
    if published.tzinfo is None or not timedelta(days=1) < now - published <= timedelta(days=14):
        raise RuntimeError("Recovery is restricted to reviewed historical articles within 14 days")
    return evidence


def claim_delivery(key: str, article_id: int, review_id: str) -> bool:
    existing = rows(f"classification_maintenance_runs?select=run_id&run_id=eq.{quote(key, safe='')}&limit=1")
    if existing:
        return False
    # A plain INSERT (never upsert) is an atomic claim across manual runs.
    store.request("POST", "classification_maintenance_runs", data=json.dumps([{
        "run_id": key, "report": {"mode": "reviewed_alert_recovery", "status": "sending",
                                  "article_id": article_id, "review_id": review_id}, "repairs": [],
    }]))
    return True


def deliver(article: dict, evidence: str, review_id: str) -> None:
    claim_key = f"reviewed-alert-recovery:{negative_watch.article_key(article)}"
    if not claim_delivery(claim_key, article["id"], review_id):
        raise RuntimeError(f"Article {article['id']} has a previous delivery attempt; verify Slack before retrying")
    published = datetime.fromisoformat(article["pub_date"].replace("Z", "+00:00")).astimezone(KST)
    message = (f"[원문 확인 부정기사]\n기사 발행: {published:%Y.%m.%d %H:%M} (과거 기사)\n"
               f"[{article['source']}] {article['title']}\n\n확인 근거: {evidence}")
    link = negative_watch.build_alert_link(article)
    # No automatic retry after Slack/network uncertainty. The persistent claim
    # keeps a rerun from duplicating a message that Slack may have accepted.
    result = negative_watch.send_slack_alert(message, link, article)
    store.save_notification_send(message_type="negative_alert",
        title=negative_watch.alert_title_for_article(article), body=message, link_url=link,
        status="success", provider_response=result, channel="slack", require_log=True)
    store.request("PATCH", f"classification_maintenance_runs?run_id=eq.{quote(claim_key, safe='')}",
                  data=json.dumps({"report": {"mode": "reviewed_alert_recovery", "status": "sent",
                    "article_id": article["id"], "review_id": review_id,
                    "sent_at": datetime.now(timezone.utc).isoformat()}}))
    print(json.dumps({"article_id": article["id"], "status": "sent"}))


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-id", required=True)
    parser.add_argument("--article-ids", required=True)
    parser.add_argument("--send", action="store_true")
    args = parser.parse_args()
    if not store.is_enabled() or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", args.review_id):
        raise RuntimeError("Valid review ID and database credentials required")
    if not re.fullmatch(r"[0-9]+(?:,[0-9]+){0,5}", args.article_ids):
        raise RuntimeError("Provide at most six reviewed article IDs")
    ids = list(dict.fromkeys(int(value) for value in args.article_ids.split(",")))
    reviews = rows(f"classification_maintenance_runs?run_id=eq.{quote(args.review_id, safe='')}&limit=1")
    if len(reviews) != 1 or reviews[0].get("report", {}).get("status") != "applied":
        raise RuntimeError("An applied source-review ledger is required")
    repairs = {repair["id"]: repair for repair in reviews[0].get("repairs", [])}
    articles = rows(f"news_articles?select=*&id=in.({','.join(map(str, ids))})")
    if {row["id"] for row in articles} != set(ids) or not set(ids).issubset(repairs):
        raise RuntimeError("One or more requested articles are absent from the applied review")
    pending = []
    for article in articles:
        if already_sent(article):
            print(json.dumps({"article_id": article["id"], "status": "already_sent"}))
            continue
        evidence = validate_reviewed_article(article, repairs[article["id"]], datetime.now(timezone.utc))
        pending.append((article, evidence))
    print(json.dumps({"review_id": args.review_id, "unsent_count": len(pending), "send": args.send}))
    if args.send:
        for article, evidence in pending:
            # Re-read mutable facts just before claiming and sending.
            fresh = rows(f"news_articles?select=*&id=eq.{article['id']}&limit=1")
            if len(fresh) != 1:
                raise RuntimeError("Article disappeared before delivery")
            if already_sent(fresh[0]):
                continue
            evidence = validate_reviewed_article(fresh[0], repairs[article["id"]], datetime.now(timezone.utc))
            deliver(fresh[0], evidence, args.review_id)


if __name__ == "__main__":
    main()
