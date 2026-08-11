"""Shared article classification display/runtime normalizers.

These rules intentionally run after the main classifier and before dashboard or
report rendering. They protect static reports from stale DB classifications
when a narrow context rule is fixed after the original report run.
"""

from __future__ import annotations

import re
from collections import Counter

import analyzer


OWN_BRAND_REPUTATION_LEADER_RE = re.compile(
    r"(?:\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|\uC778\uCE74\uAE08\uC735)"
    r".{0,80}(?:\uBE0C\uB79C\uB4DC\uD3C9\uD310|\uD3C9\uD310)"
    r".{0,80}(?:1\uC704|\uC120\uB450|\uC815\uC0C1|\uCD5C\uACE0|\uC218\uC131|\uD0C8\uD658)"
    r"|(?:\uBE0C\uB79C\uB4DC\uD3C9\uD310|\uD3C9\uD310)"
    r".{0,80}(?:\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|\uC778\uCE74\uAE08\uC735)"
    r".{0,80}(?:1\uC704|\uC120\uB450|\uC815\uC0C1|\uCD5C\uACE0|\uC218\uC131|\uD0C8\uD658)",
    re.I,
)
OWN_BRAND_REPUTATION_FOLLOWER_RE = re.compile(
    r"(?:\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|\uC778\uCE74\uAE08\uC735)"
    r".{0,60}(?:2\uC704|3\uC704|\uB4A4\uC774\uC5B4|\uCD08\uBC15\uBE59|\uCD94\uACA9)",
    re.I,
)
NON_INSURANCE_FINANCIAL_LEGAL_NOISE_RE = re.compile(
    r"(\uCC44\uAD8C\s*\uC0AC\uAE30|\uD22C\uC790\uC790\s*\uBC95\uC801\s*\uB300\uC751|"
    r"\uBC95\uC801\s*\uB300\uC751|\uC720\uC0AC\uC218\uC2E0|\uBD88\uBC95\s*\uB9AC\uB529\uBC29|"
    r"\uCF54\uC778\s*\uC0AC\uAE30|\uD22C\uC790\s*\uC0AC\uAE30)",
    re.I,
)
INSURANCE_CONTEXT_RE = re.compile(
    r"(\uC778\uCE74|\uC778\uCE74\uAE08\uC735|\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|"
    r"\uBCF4\uD5D8|\uC190\uD574\uBCF4\uD5D8|\uC0DD\uBA85\uBCF4\uD5D8|GA|"
    r"\uBCF4\uD5D8\uB300\uB9AC\uC810|\uC124\uACC4\uC0AC|\uC218\uC218\uB8CC|1200%)",
    re.I,
)
COMPETITOR_BRAND_NAME_RE = re.compile(
    r"\uD55C\uD654\uC0DD\uBA85\uAE08\uC735\uC11C\uBE44\uC2A4|\uC5D0\uC774\uD50C\uB7EC\uC2A4\uC5D0\uC14B|"
    r"\uD53C\uD50C\uB77C\uC774\uD504|\uC9C0\uC5D0\uC774\uCF54\uB9AC\uC544|\uAE00\uB85C\uBC8C\uAE08\uC735\uD310\uB9E4|"
    r"\uBA54\uAC00\uAE08\uC735\uC11C\uBE44\uC2A4|\uB9AC\uCE58\uC564\uCF54|\uD55C\uAD6D\uBCF4\uD5D8\uAE08\uC735|"
    r"\uD504\uB77C\uC784\uC5D0\uC14B",
    re.I,
)


def article_text(article: dict) -> str:
    return " ".join(
        str(article.get(key) or "")
        for key in (
            "title",
            "summary",
            "description",
            "_summary",
            "source",
            "keyword",
            "category",
            "_category",
            "tone",
            "_tone",
        )
    )


def is_own_brand_reputation_leader(article: dict) -> bool:
    text = article_text(article)
    if is_own_brand_reputation_leader_text(text):
        return True
    if analyzer.is_own_brand_reputation_leader_article(article):
        return True
    return bool(OWN_BRAND_REPUTATION_LEADER_RE.search(text)) and not bool(
        OWN_BRAND_REPUTATION_FOLLOWER_RE.search(text)
    )


def is_own_certified_agent_performance(article: dict) -> bool:
    return analyzer.is_own_certified_agent_performance_article(article)


def is_own_brand_reputation_leader_text(text: str) -> bool:
    """Return true when the own-company mention leads into a #1 reputation claim.

    This avoids false negatives like:
    "Incar ... brand reputation ... #1 ... competitor ... #2",
    where a later competitor follower mention should not downgrade the
    own-company result.
    """
    compact = re.sub(r"\s+", "", str(text or ""))
    if not re.search(r"\uBE0C\uB79C\uB4DC\uD3C9\uD310|\uD3C9\uD310", compact):
        return False
    own_positions = regex_positions(compact, r"\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|\uC778\uCE74\uAE08\uC735")
    leader_positions = regex_positions(compact, r"1\uC704|\uC120\uB450|\uC815\uC0C1|\uCD5C\uACE0|\uC218\uC131|\uD0C8\uD658")
    follower_positions = regex_positions(compact, r"2\uC704|3\uC704|\uB4A4\uC774\uC5B4|\uCD08\uBC15\uBE59|\uCD94\uACA9")
    for own_pos in own_positions:
        for leader_pos in leader_positions:
            own_before_leader = leader_pos >= own_pos and leader_pos - own_pos <= 90
            leader_before_own = own_pos > leader_pos and own_pos - leader_pos <= 60
            if own_before_leader:
                if any(own_pos <= follower_pos < leader_pos for follower_pos in follower_positions):
                    continue
                return True
            if leader_before_own:
                between = compact[leader_pos:own_pos]
                before_leader = compact[max(0, leader_pos - 70):leader_pos]
                if COMPETITOR_BRAND_NAME_RE.search(before_leader):
                    continue
                if COMPETITOR_BRAND_NAME_RE.search(between):
                    continue
                if any(leader_pos <= follower_pos < own_pos for follower_pos in follower_positions):
                    continue
                return True
    return False


def regex_positions(text: str, pattern: str) -> list[int]:
    return [match.start() for match in re.finditer(pattern, text, re.I)]


def is_non_insurance_financial_legal_noise(article: dict) -> bool:
    text = article_text(article)
    if analyzer.is_non_insurance_financial_legal_noise_article(article):
        return True
    return bool(NON_INSURANCE_FINANCIAL_LEGAL_NOISE_RE.search(text)) and not bool(
        INSURANCE_CONTEXT_RE.search(text)
    )


def normalize_article(article: dict, *, inplace: bool = False) -> dict:
    row = article if inplace else dict(article)
    if analyzer.is_routine_ga_channel_performance_article(row):
        category = analyzer.routine_ga_channel_performance_category(row)
        tone = analyzer.routine_ga_channel_performance_tone(row)
        row["category"] = category
        row["_category"] = category
        row["tone"] = tone
        row["_tone"] = tone
        row["own_mentioned"] = analyzer.is_own_article(row)
        row["negative_target"] = "none"
        row["clipping_recommended"] = category == "own" and tone == "positive"
        row["classification_provider"] = "rules:routine_ga_channel_performance_v1"
        row["classification_reason"] = (
            "보험사별 월간 GA 채널 실적·점유율 순위 통계로, 당사 직접 리스크와 분리"
        )
        context = dict(row.get("_ai_context") or {})
        context.update(
            {
                "category": category,
                "tone": tone,
                "own_mentioned": row["own_mentioned"],
                "negative_target": "none",
                "clipping_recommended": row["clipping_recommended"],
                "confidence": 1.0,
                "provider": row["classification_provider"],
                "reason": row["classification_reason"],
            }
        )
        row["_ai_context"] = context
    elif is_own_brand_reputation_leader(row):
        row["category"] = "own"
        row["_category"] = "own"
        row["tone"] = "positive"
        row["_tone"] = "positive"
        row["own_mentioned"] = True
        row["negative_target"] = "none"
        row["classification_provider"] = row.get("classification_provider") or "display_context_rule"
        row["classification_reason"] = row.get("classification_reason") or (
            "\uB2F9\uC0AC\uAC00 \uBE0C\uB79C\uB4DC\uD3C9\uD310 1\uC704\uB85C "
            "\uC9C1\uC811 \uB178\uCD9C\uB41C \uC131\uACFC\uC131 \uBCF4\uB3C4"
        )
    elif is_own_certified_agent_performance(row):
        row["category"] = "own"
        row["_category"] = "own"
        row["tone"] = "positive"
        row["_tone"] = "positive"
        row["own_mentioned"] = True
        row["negative_target"] = "none"
        row["clipping_recommended"] = True
        row["classification_provider"] = "rules:own_certified_agent_performance_v2"
        row["classification_reason"] = "당사 우수인증설계사 인증·성과 보도로 직접 리스크와 분리"
        context = dict(row.get("_ai_context") or {})
        context.update(
            {
                "category": "own",
                "tone": "positive",
                "own_mentioned": True,
                "negative_target": "none",
                "clipping_recommended": True,
                "confidence": 1.0,
                "provider": row["classification_provider"],
                "reason": row["classification_reason"],
            }
        )
        row["_ai_context"] = context
    elif is_non_insurance_financial_legal_noise(row):
        row["category"] = "other"
        row["_category"] = "other"
        row["tone"] = "neutral"
        row["_tone"] = "neutral"
        row["own_mentioned"] = False
        row["negative_target"] = "none"
        row["clipping_recommended"] = False
        row["classification_provider"] = row.get("classification_provider") or "display_context_rule"
        row["classification_reason"] = row.get("classification_reason") or (
            "\uBCF4\uD5D8/GA \uBB38\uB9E5\uC774 \uC5C6\uB294 "
            "\uAE08\uC735\u00B7\uBC95\uB960 \uC77C\uBC18 \uC774\uC288"
        )
    return row


def normalize_articles(articles: list[dict], *, inplace: bool = False) -> list[dict]:
    return [normalize_article(article, inplace=inplace) for article in articles]


def article_category(article: dict) -> str:
    return str(article.get("_category") or article.get("category") or "other").strip() or "other"


def article_tone(article: dict) -> str:
    return str(article.get("_tone") or article.get("tone") or "neutral").strip() or "neutral"


def recompute_metrics(metrics: dict | None, articles: list[dict]) -> dict:
    normalized = dict(metrics or {})
    categories = Counter(article_category(article) for article in articles)
    tones = Counter(article_tone(article) for article in articles)
    own_by_tone = Counter(
        article_tone(article)
        for article in articles
        if article_category(article) == "own"
    )

    normalized["by_category"] = {
        key: categories.get(key, 0)
        for key in ("own", "regulation", "competitor", "industry", "sponsorship", "other")
    }
    normalized["by_tone"] = {
        key: tones.get(key, 0)
        for key in ("positive", "caution", "neutral", "negative", "exclude")
    }
    normalized["own_by_tone"] = {
        key: own_by_tone.get(key, 0)
        for key in ("positive", "caution", "neutral", "negative")
    }
    normalized["own_negative"] = normalized["own_by_tone"].get("negative", 0)
    normalized["total_after_cluster"] = len(articles)
    normalized.setdefault("total_collected", len(articles))
    normalized.setdefault("risk_level", "LOW")
    return normalized
