from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import slack_notify


class SlackDailyPayloadTests(unittest.TestCase):
    def test_daily_payload_uses_compact_metrics_and_headline_only(self) -> None:
        report = {
            "date": "2026-06-20",
            "window": {"slot": "13", "short_label": "08:00~13:00"},
            "metrics": {
                "risk_level": "LOW",
                "total_after_cluster": 2,
                "by_category": {"own": 1},
                "own_by_tone": {"negative": 0, "positive": 1, "neutral": 0},
            },
            "briefing": "",
            "articles": [
                {
                    "title": "\uc778\uce74\uae08\uc735\uc11c\ube44\uc2a4, \uc6b0\uc218\uc778\uc99d\uc124\uacc4\uc0ac 2262\uba85 \ubc30\ucd9c",
                    "_summary": "\uc778\uce74\uae08\uc735\uc11c\ube44\uc2a4\uac00 GA\uc5c5\uacc4 \ucd5c\ub2e4 \uaddc\ubaa8\uc758 \uc6b0\uc218\uc778\uc99d\uc124\uacc4\uc0ac\ub97c \ubc30\ucd9c\ud588\ub2e4.",
                    "_category": "own",
                    "_tone": "positive",
                    "_score": 80,
                },
                {
                    "title": "\uae08\uc735\uc18c\ube44\uc790\ubcf4\ud638 \uac15\ud654 \ud611\uc57d",
                    "description": "\uae08\uac10\uc6d0\uacfc \uae08\uc735\uc9c0\uc8fc\uc0ac\uac00 \uc18c\ube44\uc790\ubcf4\ud638 \ud611\uc57d\uc744 \uccb4\uacb0\ud588\ub2e4.",
                    "_category": "regulation",
                    "_tone": "caution",
                    "_score": 50,
                },
            ],
        }

        _, payload = slack_notify.build_daily_payload(report, "https://example.com/report.html")
        header_block = payload["blocks"][0]["text"]["text"]
        metric_block = payload["blocks"][1]
        key_issue_block = payload["blocks"][3]["text"]["text"]

        self.assertEqual(metric_block["type"], "table")
        self.assertEqual(metric_block["rows"][0][0]["text"], "\ub9ac\uc2a4\ud06c")
        self.assertTrue(all(setting["align"] == "center" for setting in metric_block["column_settings"]))
        self.assertEqual(len(metric_block["column_settings"]), 4)
        self.assertEqual(len(metric_block["rows"][0]), 4)
        self.assertEqual(metric_block["rows"][1][0]["text"], "LOW")
        self.assertEqual(metric_block["rows"][0][1]["text"], "\uae0d\uc815")
        self.assertEqual(metric_block["rows"][0][2]["text"], "\uc911\ub9bd")
        self.assertEqual(metric_block["rows"][0][3]["text"], "\ubd80\uc815")
        self.assertEqual(metric_block["rows"][1][1]["text"], "1")
        self.assertEqual(metric_block["rows"][1][2]["text"], "0")
        self.assertEqual(metric_block["rows"][1][3]["text"], "0")
        self.assertNotIn(slack_notify.K["default_conclusion"], header_block)
        self.assertIn("\uc778\uce74\uae08\uc735\uc11c\ube44\uc2a4", key_issue_block)
        self.assertNotIn("GA\uc5c5\uacc4 \ucd5c\ub2e4", key_issue_block)
        self.assertNotIn(slack_notify.K["check_report_articles"], key_issue_block)


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
