from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import report_window


KST = timezone(timedelta(hours=9))


class ReportWindowTests(unittest.TestCase):
    def test_live_window_runs_from_midnight_to_request_time(self) -> None:
        now = datetime(2026, 8, 14, 16, 37, 21, tzinfo=KST)

        with patch.dict("os.environ", {"REPORT_SLOT": "live"}, clear=False):
            window = report_window.current_window(now)

        self.assertEqual(window["slot"], "live")
        self.assertEqual(window["start"], datetime(2026, 8, 14, 0, 0, tzinfo=KST))
        self.assertEqual(window["end"], now)
        self.assertEqual(window["label"], "당일 00:00~현재")

    def test_scheduled_window_remains_unchanged(self) -> None:
        now = datetime(2026, 8, 14, 16, 37, 21, tzinfo=KST)

        with patch.dict("os.environ", {"REPORT_SLOT": "13"}, clear=False):
            window = report_window.current_window(now)

        self.assertEqual(window["start"], datetime(2026, 8, 14, 8, 0, tzinfo=KST))
        self.assertEqual(window["end"], datetime(2026, 8, 14, 13, 0, tzinfo=KST))


if __name__ == "__main__":
    unittest.main()
