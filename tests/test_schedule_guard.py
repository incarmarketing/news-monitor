from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import schedule_guard


def kst_datetime(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=schedule_guard.KST)


class ScheduleGuardTests(unittest.TestCase):
    def test_sunday_morning_daily_slot_is_due(self) -> None:
        self.assertEqual(schedule_guard.due_daily_slots(kst_datetime(2026, 5, 31, 8, 3)), ["08"])

    def test_missed_daily_slots_remain_due_until_done(self) -> None:
        self.assertEqual(schedule_guard.due_daily_slots(kst_datetime(2026, 5, 31, 13, 5)), ["08", "13"])
        self.assertEqual(schedule_guard.due_daily_slots(kst_datetime(2026, 5, 31, 18, 5)), ["08", "13", "18"])

    def test_daily_slots_never_include_period_report(self) -> None:
        self.assertEqual(schedule_guard.due_daily_slots(kst_datetime(2026, 6, 1, 8, 3)), ["08"])
        self.assertTrue(schedule_guard.period_report_due(kst_datetime(2026, 6, 1, 8, 3)))

    def test_period_schedule_is_distinct_from_daily_watchdog(self) -> None:
        self.assertTrue(schedule_guard.is_period_schedule("*/5 22 * * *"))
        self.assertFalse(schedule_guard.is_period_schedule("*/5 23,0-14 * * *"))

    def test_marker_is_ignored_when_supabase_send_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "2026-05-31-08.txt"
            marker.write_text("completed_at=2026-05-31T08:00:00+09:00\n", encoding="utf-8")
            with patch.object(schedule_guard, "daily_report_succeeded", return_value=False):
                self.assertFalse(schedule_guard.slot_is_complete("2026-05-31", "08", marker))

    def test_supabase_report_and_slack_success_complete_slot_even_without_marker(self) -> None:
        with patch.object(schedule_guard, "daily_report_succeeded", return_value=True):
            self.assertTrue(schedule_guard.slot_is_complete("2026-05-31", "08", Path("missing.txt")))

    def test_report_without_slack_success_does_not_complete_slot(self) -> None:
        rows = [
            [{"run_key": "daily_report:2026-06-22:13"}],
            [],
            [],
        ]
        with patch.object(schedule_guard, "supabase_select", side_effect=rows):
            self.assertFalse(schedule_guard.daily_report_succeeded("2026-06-22", "13"))

    def test_report_with_slack_success_completes_slot(self) -> None:
        rows = [
            [{"run_key": "daily_report:2026-06-22:13"}],
            [],
            [{"id": 1}],
        ]
        with patch.object(schedule_guard, "supabase_select", side_effect=rows):
            self.assertTrue(schedule_guard.daily_report_succeeded("2026-06-22", "13"))


if __name__ == "__main__":
    unittest.main()
