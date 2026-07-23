from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import negative_watch


class NegativeWatchRefreshTests(unittest.TestCase):
    def test_default_refresh_skips_clean_runs(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(
                negative_watch.dashboard_refresh_due(
                    "2026-06-15T21:00:00+09:00",
                    negative_count=0,
                    new_negative_count=0,
                    status="success",
                )
            )

    def test_on_alert_refresh_skips_clean_runs(self) -> None:
        with patch.dict(os.environ, {"NEGATIVE_WATCH_DASHBOARD_REFRESH": "on_alert"}, clear=False):
            self.assertFalse(
                negative_watch.dashboard_refresh_due(
                    "2026-06-15T21:00:00+09:00",
                    negative_count=0,
                    new_negative_count=0,
                    status="success",
                )
            )

    def test_on_alert_refresh_runs_for_new_negative(self) -> None:
        with patch.dict(os.environ, {"NEGATIVE_WATCH_DASHBOARD_REFRESH": "on_alert"}, clear=False):
            self.assertTrue(
                negative_watch.dashboard_refresh_due(
                    "2026-06-15T21:00:00+09:00",
                    negative_count=1,
                    new_negative_count=1,
                    status="alert_sent",
                )
            )


class NegativeWatchDelayedExposureTests(unittest.TestCase):
    def test_risk_query_window_defaults_to_24_hours(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(negative_watch.risk_query_minutes_back(10), 1440)

    def test_risk_query_window_never_smaller_than_base_window(self) -> None:
        with patch.dict(os.environ, {"NEGATIVE_WATCH_RISK_QUERY_MINUTES": "60"}, clear=True):
            self.assertEqual(negative_watch.risk_query_minutes_back(120), 120)

    def test_specific_risk_query_article_is_marked_for_wide_window(self) -> None:
        article = {
            "keyword_query": "인카금융서비스 과제 직면",
            "portal": "naver",
        }

        self.assertTrue(negative_watch.is_own_risk_query_article(article))

    def test_company_name_query_article_is_marked_for_wide_window(self) -> None:
        article = {
            "keyword_query": "인카금융서비스",
            "portal": "naver",
        }

        self.assertTrue(negative_watch.is_own_risk_query_article(article))

class NegativeWatchPersistenceTests(unittest.TestCase):
    def test_company_name_search_uses_max_naver_display_window(self) -> None:
        with (
            patch.object(negative_watch.analyzer, "OWN_NAMES", ["인카금융서비스"]),
            patch.object(negative_watch.news_collector, "fetch_naver_news", return_value=[]) as naver,
            patch.object(negative_watch.news_collector, "fetch_google_news", return_value=[]),
            patch.object(negative_watch.news_collector, "fetch_own_press_search_news", return_value=[]),
            patch.object(negative_watch.news_collector, "deduplicate", side_effect=lambda rows: rows),
            patch.object(negative_watch.news_collector, "apply_exclude_filter", side_effect=lambda rows: rows),
            patch.object(negative_watch.news_collector, "apply_recency_filter", side_effect=lambda rows, _hours: rows),
            patch.dict(os.environ, {"NEGATIVE_WATCH_OWN_QUERY_LIMIT": "100"}, clear=False),
        ):
            negative_watch.collect_recent_company_news(10)

        naver.assert_any_call(
            "인카금융서비스",
            keyword="인카금융서비스",
            keyword_category="own",
            display_count=100,
        )

    def test_watch_discovered_company_articles_are_persisted_without_alert(self) -> None:
        article = {
            "title": "인카금융서비스, 상반기 마지막 달 호실적 마감",
            "link": "https://example.com/own-positive",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
            "_category": "own",
            "_tone": "positive",
        }
        with patch.object(negative_watch, "save_dashboard_articles") as save:
            count = negative_watch.persist_watch_articles(
                [article],
                {"risk_level": "LOW"},
                "2026-07-20T09:10:00+09:00",
                10,
            )

        self.assertEqual(count, 1)
        self.assertEqual(article["_discovered_at"], "2026-07-20T09:10:00+09:00")
        save.assert_called_once()
        self.assertEqual(save.call_args.kwargs["report_date"], "2026-07-20")
        self.assertEqual(save.call_args.kwargs["window"]["slot"], "watch")

    def test_routine_ga_market_share_article_never_enters_negative_alerts(self) -> None:
        article = {
            "title": "푸본현대생명 6월 GA 생보실적 M/S… 글로벌금융 1위 굳히기",
            "description": (
                "인카금융서비스는 점유율 11.4%로 두 계단 상승해 3위를 기록했다."
            ),
            "source": "보험저널",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
            "_category": "own",
            "_tone": "negative",
            "_ai_context": {
                "category": "own",
                "tone": "negative",
                "own_mentioned": True,
                "negative_target": "own",
                "evidence": "과거 오분류 캐시",
            },
        }

        negatives, _metrics = negative_watch.find_negative_articles([article])

        self.assertEqual(negatives, [])
        self.assertEqual(article["_category"], "industry")
        self.assertEqual(article["_tone"], "neutral")


if __name__ == "__main__":
    unittest.main()
