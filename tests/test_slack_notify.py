from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import slack_notify


class SlackPeriodNotificationTests(unittest.TestCase):
    def test_period_report_skips_when_success_log_exists(self) -> None:
        with (
            patch.object(slack_notify, "notification_already_sent", return_value=True) as already_sent,
            patch.object(slack_notify, "verify_public_report_link") as verify_link,
            patch.object(slack_notify, "post_to_slack") as post_to_slack,
            patch.object(slack_notify, "save_notification_send") as save_send,
        ):
            slack_notify.send_period("weekly")

        already_sent.assert_called_once_with("weekly_report", "주간 언론 동향", strict=True, channel="slack")
        verify_link.assert_not_called()
        post_to_slack.assert_not_called()
        save_send.assert_not_called()

    def test_period_report_uses_stable_dedupe_title(self) -> None:
        with (
            patch.object(slack_notify, "notification_already_sent", return_value=False),
            patch.object(slack_notify, "verify_public_report_link"),
            patch.object(slack_notify, "post_to_slack", return_value={"ok": True}),
            patch.object(slack_notify, "save_notification_send") as save_send,
        ):
            slack_notify.send_period("monthly")

        saved = save_send.call_args.kwargs
        self.assertEqual(saved["message_type"], "monthly_report")
        self.assertEqual(saved["title"], "월간 언론 동향")
        self.assertEqual(saved["channel"], "slack")

class PeriodWatchdogDispatchTests(unittest.TestCase):
    def test_watchdog_dispatches_requested_period_not_both(self) -> None:
        source = Path(__file__).resolve().parents[1] / "supabase" / "functions" / "trigger-news-collection" / "index.ts"
        text = source.read_text(encoding="utf-8")

        self.assertIn('period_reports: period', text)
        self.assertNotIn('period_reports: "both"', text)


if __name__ == "__main__":
    unittest.main()
