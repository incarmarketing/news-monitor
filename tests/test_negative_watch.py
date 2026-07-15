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
    def test_risk_query_window_defaults_to_48_hours(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(negative_watch.risk_query_minutes_back(10), 2880)

    def test_risk_query_window_never_smaller_than_base_window(self) -> None:
        with patch.dict(os.environ, {"NEGATIVE_WATCH_RISK_QUERY_MINUTES": "60"}, clear=True):
            self.assertEqual(negative_watch.risk_query_minutes_back(120), 120)

    def test_specific_risk_query_article_is_marked_for_wide_window(self) -> None:
        article = {
            "keyword_query": "인카금융서비스 과제 직면",
            "portal": "naver",
        }

        self.assertTrue(negative_watch.is_own_risk_query_article(article))


if __name__ == "__main__":
    unittest.main()
