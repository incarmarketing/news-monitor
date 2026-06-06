from __future__ import annotations

import unittest

import dashboard_builder


class DashboardQualityTests(unittest.TestCase):
    def test_article_summary_falls_back_when_summary_is_only_title(self) -> None:
        article = {
            "title": "Insurance monitoring article title",
            "summary": "Insurance monitoring article title",
            "keyword": "insurance",
        }

        summary = dashboard_builder.article_summary(article, "industry", "neutral")

        self.assertNotEqual(summary, article["title"])
        self.assertTrue(dashboard_builder.is_usable_summary_line(summary, article["title"]))

    def test_ai_issue_summary_rejects_title_clone(self) -> None:
        title = "Agency recruiting competition becomes a market issue"
        group = {"members": [{"title": title, "summary": f"{title}."}]}

        self.assertEqual(dashboard_builder.clean_issue_summary(f"{title}.", group), "")

    def test_quality_checks_catch_report_window_and_notification_link_mismatch(self) -> None:
        articles = [
            {
                "date": "2026-06-06",
                "title": "AI diagnosis fraud expands in insurance claims",
                "source": "sample",
                "tone": "caution",
                "summary": "The article explains how AI-assisted insurance claim fraud is spreading.",
            }
        ]
        report_runs = [
            {
                "run_key": "2026-06-06-13",
                "report_date": "2026-06-06",
                "report_slot": "13",
                "window_label": "same day 07:00-13:00",
            }
        ]
        notifications = [
            {
                "id": 1,
                "message_type": "daily_report",
                "title": "daily report 2026-06-06 13",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-08.html",
                "status": "success",
            }
        ]

        quality = dashboard_builder.build_quality_checks(articles, report_runs, notifications)

        self.assertEqual(quality["status"], "fail")
        failed_names = {check["name"] for check in quality["checks"] if check["status"] != "ok"}
        self.assertIn("daily_report_windows", failed_names)
        self.assertIn("notification_report_links", failed_names)
        self.assertIn("notification_action_links", failed_names)
        self.assertIn("notification_report_history", failed_names)
        self.assertNotIn("current_day_summaries", failed_names)

    def test_quality_checks_pass_for_good_daily_records(self) -> None:
        articles = [
            {
                "date": "2026-06-06",
                "title": "Daily quality check sample article",
                "source": "sample",
                "tone": "neutral",
                "summary": "This sample has a distinct usable summary for the dashboard quality check.",
            }
        ]
        report_runs = [
            {
                "run_key": "2026-06-06-13",
                "report_date": "2026-06-06",
                "report_slot": "13",
                "window_label": dashboard_builder.EXPECTED_DAILY_WINDOWS["13"],
            }
        ]
        notifications = [
            {
                "id": 1,
                "message_type": "daily_report",
                "title": "daily report 2026-06-06 13",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-13.html?v=1",
                "status": "success",
            }
        ]

        quality = dashboard_builder.build_quality_checks(articles, report_runs, notifications)

        self.assertEqual(quality["status"], "ok")


if __name__ == "__main__":
    unittest.main()
