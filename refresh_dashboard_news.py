"""Refresh current-day dashboard articles without generating or sending reports."""

from __future__ import annotations

import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import analyzer
import classification_normalizer
import config
import news_collector
import report_window
import supabase_store


if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def refresh_worker_count() -> int:
    try:
        value = int(os.getenv("DASHBOARD_REFRESH_WORKERS", "8"))
    except ValueError:
        value = 8
    return max(2, min(value, 12))


def fetch_keyword_row(row: dict) -> list[dict]:
    display_count = row.get("display_count") or config.ARTICLES_PER_KEYWORD
    naver = news_collector.fetch_naver_news(
        row["query"],
        row["keyword"],
        row["category"],
        row.get("strict_query", False),
        display_count,
    )
    google = news_collector.fetch_google_news(
        row["query"],
        row["keyword"],
        row["category"],
        row.get("strict_query", False),
        display_count,
    )
    news_collector.apply_keyword_rule_metadata(naver, row)
    news_collector.apply_keyword_rule_metadata(google, row)
    return naver + google


def collect_current_news() -> list[dict]:
    """Collect the current day in parallel without changing scheduled report collection."""
    window = report_window.current_window()
    workers = refresh_worker_count()
    news_collector.configure_context_rules_from_supabase()
    keyword_rows = news_collector.load_collection_keywords()
    initial_results: list[tuple[tuple, list[str]]] = []
    all_articles: list[dict] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        jobs = {}
        for row in keyword_rows:
            jobs[executor.submit(fetch_keyword_row, row)] = ("keyword", row)
        if news_collector.ENABLE_TRADE_PRESS_SOURCES:
            for source_index, source in enumerate(news_collector.TRADE_PRESS_SOURCES):
                jobs[executor.submit(
                    news_collector.collect_trade_press_article_urls,
                    source,
                    news_collector.TRADE_PRESS_ARTICLES_PER_SOURCE,
                )] = ("trade", source_index, source)
            for source_index, source in enumerate(news_collector.OWN_PRESS_SEARCH_SOURCES):
                for query_index, query in enumerate(news_collector.MANDATORY_OWN_COLLECTION_KEYWORDS):
                    jobs[executor.submit(
                        news_collector.collect_source_search_article_urls,
                        source,
                        query,
                        news_collector.OWN_SEARCH_ARTICLES_PER_KEYWORD,
                    )] = ("own", source_index, query_index, source, query)

        for future in as_completed(jobs):
            metadata = jobs[future]
            try:
                result = future.result()
            except Exception as exc:
                print(f"dashboard refresh source skipped: {metadata[0]}: {exc}")
                continue
            if metadata[0] == "keyword":
                all_articles.extend(result)
            else:
                initial_results.append((metadata, result))

    candidates: dict[str, dict] = {}

    def add_candidate(source: dict, url: str, *, trade: bool = False, own_query: str = "") -> None:
        normalized = news_collector.normalize_url_for_tracking(url)
        if not normalized:
            return
        candidate = candidates.setdefault(normalized, {
            "source": source,
            "url": url,
            "trade": False,
            "own_query": "",
        })
        candidate["trade"] = bool(candidate["trade"] or trade)
        if own_query and not candidate["own_query"]:
            candidate["own_query"] = own_query

    for metadata, urls in sorted(initial_results, key=lambda item: repr(item[0])):
        if metadata[0] != "trade":
            continue
        _, _, source = metadata
        for url in urls[:news_collector.TRADE_PRESS_ARTICLES_PER_SOURCE]:
            add_candidate(source, url, trade=True)

    own_seen_by_source: dict[int, set[str]] = {}
    own_count_by_source: dict[int, int] = {}
    for metadata, urls in sorted(initial_results, key=lambda item: repr(item[0])):
        if metadata[0] != "own":
            continue
        _, source_index, _, source, query = metadata
        seen = own_seen_by_source.setdefault(source_index, set())
        count = own_count_by_source.get(source_index, 0)
        for url in urls:
            if count >= news_collector.OWN_SEARCH_ARTICLES_PER_KEYWORD:
                break
            normalized = news_collector.normalize_url_for_tracking(url)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            count += 1
            add_candidate(source, url, own_query=query)
        own_count_by_source[source_index] = count

    candidate_stubs = [{"link": candidate["url"]} for candidate in candidates.values()]
    cached_candidates = supabase_store.load_article_analysis_cache(candidate_stubs)
    uncached_candidates = [
        candidate
        for candidate in candidates.values()
        if supabase_store.article_hash({"link": candidate["url"]}) not in cached_candidates
    ]

    with ThreadPoolExecutor(max_workers=workers) as executor:
        jobs = {
            executor.submit(
                news_collector.fetch_trade_press_article,
                candidate["source"],
                candidate["url"],
            ): candidate
            for candidate in uncached_candidates
        }
        for future in as_completed(jobs):
            candidate = jobs[future]
            try:
                article = future.result()
            except Exception as exc:
                print(f"dashboard refresh article skipped: {candidate['url']}: {exc}")
                continue
            if not article:
                continue
            own_query = candidate["own_query"]
            if own_query and analyzer.is_own_article(article):
                article["keyword"] = own_query
                article["keyword_query"] = own_query
                article["keyword_category"] = "own"
                article["portal"] = "source_search"
                all_articles.append(article)
            elif candidate["trade"]:
                all_articles.append(article)

    articles = news_collector.deduplicate(all_articles)
    articles = news_collector.apply_relevance_filter(articles)
    articles = news_collector.apply_exclude_filter(articles)
    articles = news_collector.apply_collection_window_filter(articles, window)
    news_collector.enrich_sensitive_article_bodies(articles)
    print(
        "dashboard current-day collection complete: "
        f"keywords={len(keyword_rows)} source_candidates={len(candidates)} "
        f"cached_sources={len(candidates) - len(uncached_candidates)} kept={len(articles)}"
    )
    return articles


def analyze_dashboard_articles(articles: list[dict]) -> tuple[list[dict], dict]:
    """Apply the production classification contract while keeping every collected article."""
    feedback_index = supabase_store.load_classification_feedback_index()
    supabase_store.apply_classification_feedback_to_articles(articles, feedback_index)
    supabase_store.apply_cached_analysis_to_articles(articles)
    top_n = max(config.TOP_N_FOR_BRIEFING, len(articles))
    clustered, metrics = analyzer.analyze(articles, top_n=top_n)
    clustered = classification_normalizer.normalize_articles(clustered)
    metrics = classification_normalizer.recompute_metrics(metrics, clustered)
    return clustered, metrics


def persist_dashboard_articles(articles: list[dict], metrics: dict) -> None:
    window = report_window.current_window()
    supabase_store.save_dashboard_articles(
        articles,
        report_date=datetime.now(report_window.KST).date().isoformat(),
        window={
            "slot": window["slot"],
            "label": window["label"],
            "short_label": window["short_label"],
            "start": window["start"].isoformat(),
            "end": window["end"].isoformat(),
        },
        metrics=metrics,
    )


def main() -> None:
    os.environ.setdefault("REPORT_SLOT", "live")
    collected = collect_current_news()
    articles, metrics = analyze_dashboard_articles(collected)
    persist_dashboard_articles(articles, metrics)
    print(
        "dashboard refresh complete: "
        f"collected={len(collected)} analyzed={len(articles)} "
        f"risk={metrics.get('risk_level', 'LOW')}"
    )


if __name__ == "__main__":
    main()
