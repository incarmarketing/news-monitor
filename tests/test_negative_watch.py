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


if __name__ == "__main__":
    unittest.main()
