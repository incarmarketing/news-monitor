from __future__ import annotations

import unittest

import dashboard_builder


class NotificationLinkQualityTests(unittest.TestCase):
    def test_rejects_daily_notification_pointing_to_nested_dashboard(self) -> None:
        notifications = [
            {
                "id": 101,
                "sent_at": "2026-06-06T04:02:00+00:00",
                "message_type": "daily_report",
                "title": "?쇱씪 ?몃줎 ?숉뼢 2026-06-06 13",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/dashboard.html",
                "status": "success",
            }
        ]

        failures = dashboard_builder.invalid_notification_action_links(notifications)

        self.assertEqual(failures[0]["reason"], "daily_action_link_mismatch")

    def test_rejects_negative_alert_without_monitoring_section(self) -> None:
        notifications = [
            {
                "id": 102,
                "sent_at": "2026-06-06T04:05:00+00:00",
                "message_type": "negative_alert",
                "title": "negative alert",
                "link_url": "https://incarmarketing.github.io/news-monitor/dashboard.html?query=test",
                "status": "success",
            }
        ]

        failures = dashboard_builder.invalid_notification_action_links(notifications)

        self.assertEqual(failures[0]["reason"], "negative_action_link_missing_monitoring_section")

    def test_matches_report_run_to_successful_notification(self) -> None:
        report_runs = [
            {
                "run_key": "2026-06-06-08",
                "report_date": "2026-06-06",
                "report_slot": "08",
                "window_label": "?꾩씪 18:00~?뱀씪 08:00",
            },
            {
                "run_key": "2026-06-06-13",
                "report_date": "2026-06-06",
                "report_slot": "13",
                "window_label": "?뱀씪 08:00~13:00",
            },
        ]
        notifications = [
            {
                "id": 103,
                "sent_at": "2026-06-06T00:02:00+00:00",
                "message_type": "daily_report",
                "title": "?쇱씪 ?몃줎 ?숉뼢 2026-06-06 08",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-08.html",
                "status": "success",
            }
        ]

        failures = dashboard_builder.invalid_notification_report_history(notifications, report_runs)

        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]["slot"], "13")

    def test_accepts_expected_daily_negative_and_ai_usage_links(self) -> None:
        notifications = [
            {
                "id": 104,
                "sent_at": "2026-06-06T00:02:00+00:00",
                "message_type": "daily_report",
                "title": "?쇱씪 ?몃줎 ?숉뼢 2026-06-06 08",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-08.html?v=1",
                "status": "success",
            },
            {
                "id": 105,
                "sent_at": "2026-06-06T00:05:00+00:00",
                "message_type": "negative_alert",
                "title": "negative alert",
                "link_url": "https://incarmarketing.github.io/news-monitor/dashboard.html?section=monitoring&query=test",
                "status": "success",
            },
            {
                "id": 106,
                "sent_at": "2026-06-06T00:06:00+00:00",
                "message_type": "ai_usage_alert",
                "title": "api usage",
                "link_url": "https://aistudio.google.com/usage",
                "status": "success",
            },
        ]

        self.assertEqual(dashboard_builder.invalid_notification_action_links(notifications), [])


if __name__ == "__main__":
    unittest.main()
