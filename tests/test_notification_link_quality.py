from __future__ import annotations

import os
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import dashboard_builder
import negative_watch
import supabase_store


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

    def test_negative_alert_link_targets_article_without_query_summary(self) -> None:
        article = {
            "article_hash": "a" * 64,
            "title": "인카금융서비스 관련 부정 기사 제목 - 테스트신문",
            "summary": "이 문장이 검색어에 들어가면 대시보드에서 아무것도 조회되지 않는 긴 요약문입니다.",
            "link": "https://example.com/news/123?from=rss",
            "source": "테스트신문",
        }

        with patch.dict(os.environ, {"NEGATIVE_ALERT_DASHBOARD_URL": "https://incarmarketing.github.io/news-monitor/dashboard.html"}):
            link = negative_watch.build_alert_link(article)

        parsed = urlparse(link)
        query = parse_qs(parsed.query)
        self.assertEqual(parsed.netloc, "incarmarketing.github.io")
        self.assertEqual(parsed.path, "/news-monitor/dashboard.html")
        self.assertEqual(query.get("section"), ["monitoring"])
        self.assertEqual(query.get("tone"), ["negative"])
        self.assertEqual(query.get("category"), ["own"])
        self.assertEqual(query.get("article"), ["a" * 64])
        self.assertIn("article_link", query)
        self.assertIn("title", query)
        self.assertNotIn("query", query)
        self.assertNotIn("summary", query)

    def test_negative_watch_persists_detected_articles_for_dashboard(self) -> None:
        article = {
            "title": "인카금융서비스 부정 이슈 기사",
            "link": "https://example.com/company-risk",
            "_category": "own",
            "_tone": "negative",
        }

        with patch("negative_watch.save_dashboard_articles") as save:
            negative_watch.persist_negative_articles(
                [article],
                {"risk_level": "MEDIUM"},
                "2026-06-09T04:00:00+00:00",
                5,
            )

        save.assert_called_once()
        args, kwargs = save.call_args
        self.assertEqual(args[0], [article])
        self.assertEqual(kwargs["report_date"], "2026-06-09")
        self.assertEqual(kwargs["window"]["slot"], "watch")
        self.assertIn("부정기사 감시", kwargs["window"]["label"])

    def test_negative_watch_rehydrates_sent_alert_state_for_dashboard_backfill(self) -> None:
        state = {
            "alerts": [
                {
                    "sent_at": "2026-06-09T13:10:00+09:00",
                    "title": "기존 알림 부정기사",
                    "link": "https://example.com/risk",
                    "source": "테스트신문",
                    "keyword": "인카금융서비스",
                }
            ]
        }

        rows = negative_watch.alert_state_articles(state)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "기존 알림 부정기사")
        self.assertEqual(rows[0]["_category"], "own")
        self.assertEqual(rows[0]["_tone"], "negative")
        self.assertEqual(rows[0]["pub_date"], "2026-06-09T13:10:00+09:00")

    def test_infers_legacy_daily_notification_slot_from_cache_buster(self) -> None:
        row = {
            "title": "daily report 2026-05-29",
            "link_url": "https://incarmarketing.github.io/news-monitor/?v=20260529130222",
            "message_type": "daily_report",
            "status": "success",
        }

        self.assertEqual(supabase_store.daily_notification_date_slot(row), ("2026-05-29", "13"))
        self.assertEqual(
            supabase_store.stable_daily_report_url(
                "https://incarmarketing.github.io/news-monitor/",
                "2026-05-29",
                "13",
            ),
            "https://incarmarketing.github.io/news-monitor/reports/daily/2026-05-29-13.html",
        )


if __name__ == "__main__":
    unittest.main()
