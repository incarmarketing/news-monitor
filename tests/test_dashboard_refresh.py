from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import refresh_dashboard_news


class DashboardRefreshTests(unittest.TestCase):
    def test_worker_count_is_bounded(self) -> None:
        with patch.dict(os.environ, {"DASHBOARD_REFRESH_WORKERS": "99"}, clear=False):
            self.assertEqual(refresh_dashboard_news.refresh_worker_count(), 12)
        with patch.dict(os.environ, {"DASHBOARD_REFRESH_WORKERS": "1"}, clear=False):
            self.assertEqual(refresh_dashboard_news.refresh_worker_count(), 2)

    def test_current_collection_applies_keyword_metadata_and_filters(self) -> None:
        row = {
            "query": "인카금융서비스",
            "keyword": "인카금융서비스",
            "category": "own",
            "strict_query": False,
            "display_count": 25,
            "match_mode": "keyword",
            "context_terms": ["보험"],
            "exclude_terms": [],
            "priority": 1,
        }
        article = {
            "title": "인카금융서비스 테스트 기사",
            "link": "https://example.com/article/1",
            "pub_date": "2026-08-14T01:00:00+00:00",
        }

        with (
            patch.object(refresh_dashboard_news.news_collector, "configure_context_rules_from_supabase"),
            patch.object(refresh_dashboard_news.news_collector, "load_collection_keywords", return_value=[row]),
            patch.object(refresh_dashboard_news.news_collector, "fetch_naver_news", return_value=[article.copy()]),
            patch.object(refresh_dashboard_news.news_collector, "fetch_google_news", return_value=[]),
            patch.object(refresh_dashboard_news.news_collector, "ENABLE_TRADE_PRESS_SOURCES", False),
            patch.object(refresh_dashboard_news.news_collector, "deduplicate", side_effect=lambda rows: rows),
            patch.object(refresh_dashboard_news.news_collector, "apply_relevance_filter", side_effect=lambda rows: rows),
            patch.object(refresh_dashboard_news.news_collector, "apply_exclude_filter", side_effect=lambda rows: rows),
            patch.object(refresh_dashboard_news.news_collector, "apply_collection_window_filter", side_effect=lambda rows, _: rows),
            patch.object(refresh_dashboard_news.news_collector, "enrich_sensitive_article_bodies"),
        ):
            rows = refresh_dashboard_news.collect_current_news()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["keyword_match_mode"], "keyword")
        self.assertEqual(rows[0]["keyword_context_terms"], ["보험"])
        self.assertEqual(rows[0]["keyword_priority"], 1)


if __name__ == "__main__":
    unittest.main()
