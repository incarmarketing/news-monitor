"""Generate a Groq-only preview for the dashboard's major issue candidates."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import config
import dashboard_builder
import groq_helper

KST = timezone(timedelta(hours=9))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--output-dir", default="artifacts/groq-major-issue-preview")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    articles = load_current_articles()
    groups = select_major_issue_groups(articles, max(1, args.count))
    preview = []
    for index, group in enumerate(groups, 1):
        members = dedupe_group_members(group.get("members", []))
        representative = choose_representative(members)
        summary = groq_helper.summarize_issue(members, retries=1)
        preview.append(
            {
                "rank": index,
                "groq_summary": summary,
                "current_summary": representative.get("issue_summary") or representative.get("summary", ""),
                "representative": article_payload(representative),
                "related_count": len(members),
                "related_sources": sorted({item.get("source", "") for item in members if item.get("source")}),
                "articles": [article_payload(item) for item in members[:8]],
            }
        )

    generated_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    payload = {
        "generated_at": generated_at,
        "model": config.GROQ_MODEL,
        "article_count": len(articles),
        "issue_count": len(preview),
        "issues": preview,
    }
    (output_dir / "groq_major_issue_preview.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "groq_major_issue_preview.md").write_text(render_markdown(payload), encoding="utf-8")
    print(f"Groq major issue preview generated: {len(preview)} issues")
    for item in preview:
        print(f"{item['rank']}. {item['groq_summary'] or '(empty)'}")


def load_current_articles() -> list[dict]:
    articles = dashboard_builder.load_supabase_articles()
    if articles:
        return articles
    return dashboard_builder.build_articles(dashboard_builder.load_daily_archives())


def select_major_issue_groups(articles: list[dict], count: int) -> list[dict]:
    usable = [item for item in articles if item.get("title") and item.get("tone") != "excluded"]
    groups = dashboard_builder.build_related_article_groups(usable)
    ranked = sorted(groups, key=major_issue_group_score, reverse=True)
    selected = []
    seen = set()
    for group in ranked:
        members = dedupe_group_members(group.get("members", []))
        if not members:
            continue
        representative = choose_representative(members)
        key = dashboard_builder.normalize_group_title(representative.get("title", ""))[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        selected.append({"seed": group.get("seed", {}), "members": members})
        if len(selected) >= count:
            break
    return selected


def major_issue_group_score(group: dict) -> int:
    members = group.get("members", [])
    if not members:
        return 0
    representative = choose_representative(members)
    related_score = min(len(members), 8) * 24
    own_score = 520 if any(item.get("category") == "own" for item in members) else 0
    return article_score(representative) + related_score + own_score


def article_score(article: dict) -> int:
    tone_score = {
        "negative": 420,
        "caution": 280,
        "positive": 170,
        "neutral": 90,
    }.get(str(article.get("tone", "")), 0)
    category_score = {
        "regulation": 130,
        "competitor": 80,
        "industry": 80,
    }.get(str(article.get("category", "")), 0)
    own_score = 520 if article.get("category") == "own" else 0
    try:
        raw_score = int(float(article.get("score") or 0))
    except (TypeError, ValueError):
        raw_score = 0
    return own_score + tone_score + category_score + raw_score


def choose_representative(members: list[dict]) -> dict:
    return sorted(members, key=article_score, reverse=True)[0] if members else {}


def dedupe_group_members(members: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for item in sorted(members, key=article_score, reverse=True):
        key = item.get("link") or dashboard_builder.normalize_group_title(item.get("title", ""))[:100]
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def article_payload(article: dict) -> dict:
    return {
        "title": article.get("title", ""),
        "source": article.get("source", ""),
        "keyword": article.get("keyword", ""),
        "category": article.get("category", ""),
        "tone": article.get("tone", ""),
        "published_at": article.get("pub_date") or article.get("date", ""),
        "summary": article.get("summary", ""),
        "link": article.get("link", ""),
    }


def render_markdown(payload: dict) -> str:
    lines = [
        "# Groq Major Issue Preview",
        "",
        f"- 생성: {payload['generated_at']}",
        f"- 모델: {payload['model']}",
        f"- 운영 기사: {payload['article_count']:,}건",
        f"- 미리보기 이슈: {payload['issue_count']}건",
        "",
    ]
    for issue in payload["issues"]:
        representative = issue["representative"]
        lines.extend(
            [
                f"## {issue['rank']}. {representative['title']}",
                "",
                f"- 분류/논조: {representative['category']} / {representative['tone']}",
                f"- 대표 출처: {representative['source']}",
                f"- 관련 기사: {issue['related_count']}건",
                f"- 관련 출처: {', '.join(issue['related_sources']) or '-'}",
                "",
                f"**Groq 요약**: {issue['groq_summary'] or '(empty)'}",
                "",
                f"**기존 요약**: {issue['current_summary'] or '-'}",
                "",
                "**입력 기사**",
            ]
        )
        for article in issue["articles"]:
            lines.append(f"- {article['source']} | {article['title']}")
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
