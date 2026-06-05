from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import news_collector


KST = timezone(timedelta(hours=9))


class CollectionWindowFilterTests(unittest.TestCase):
    def test_missing_pub_date_is_excluded_from_scheduled_window(self) -> None:
        window = {
            "start": datetime(2026, 6, 5, 8, 0, tzinfo=KST),
            "end": datetime(2026, 6, 5, 13, 0, tzinfo=KST),
        }
        article = {
            "title": "인카금융서비스 관련 기사",
            "description": "발행일이 확인되지 않은 기사입니다.",
            "pub_date": "",
        }

        filtered = news_collector.apply_collection_window_filter([article], window)

        self.assertEqual(filtered, [])
        self.assertEqual(article["_excluded_reason"], "missing_or_unparseable_pub_date")

    def test_article_outside_report_window_is_excluded(self) -> None:
        window = {
            "start": datetime(2026, 6, 5, 8, 0, tzinfo=KST),
            "end": datetime(2026, 6, 5, 13, 0, tzinfo=KST),
        }
        article = {
            "title": "인카금융서비스 관련 기사",
            "description": "전날 기사입니다.",
            "pub_date": "Thu, 04 Jun 2026 10:00:00 +0900",
        }

        filtered = news_collector.apply_collection_window_filter([article], window)

        self.assertEqual(filtered, [])
        self.assertEqual(article["_excluded_reason"], "outside_collection_window")

    def test_article_inside_report_window_is_kept(self) -> None:
        window = {
            "start": datetime(2026, 6, 5, 8, 0, tzinfo=KST),
            "end": datetime(2026, 6, 5, 13, 0, tzinfo=KST),
        }
        article = {
            "title": "인카금융서비스 관련 기사",
            "description": "보고 구간 안에 있는 기사입니다.",
            "pub_date": "Fri, 05 Jun 2026 09:30:00 +0900",
            "portal": "naver",
        }

        filtered = news_collector.apply_collection_window_filter([article], window)

        self.assertEqual(filtered, [article])
        self.assertNotIn("_excluded_reason", article)


if __name__ == "__main__":
    unittest.main()
