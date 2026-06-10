from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

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


class TradePressCollectorTests(unittest.TestCase):
    def test_trade_press_domains_are_named_by_actual_media(self) -> None:
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["fins.co.kr"], "보험매일")
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["insjournal.co.kr"], "보험저널")
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["insnews.co.kr"], "한국보험신문")
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["insweek.co.kr"], "보험신보")

    def test_trade_press_urls_are_collected_from_rss_and_list_without_duplicates(self) -> None:
        source = {
            "name": "보험신보",
            "base_url": "https://www.insweek.co.kr/",
            "rss_urls": ["https://cdn.insweek.co.kr/rss/gn_rss_allArticle.xml"],
            "list_urls": ["https://www.insweek.co.kr/"],
            "article_url_patterns": [
                r'https?://(?:www\.)?insweek\.co\.kr/news/articleView\.html\?idxno=\d+',
                r'["\'](/news/articleView\.html\?idxno=\d+)["\']',
            ],
        }
        html = """
        <a href="/news/articleView.html?idxno=71312">duplicate</a>
        <a href="/news/articleView.html?idxno=71311">new</a>
        """
        feed = SimpleNamespace(entries=[
            {"link": "https://www.insweek.co.kr/news/articleView.html?idxno=71312"},
        ])

        with patch.object(news_collector.feedparser, "parse", return_value=feed), \
             patch.object(news_collector, "fetch_article_html", return_value=(html, "https://www.insweek.co.kr/")):
            urls = news_collector.collect_trade_press_article_urls(source, 5)

        self.assertEqual(urls, [
            "https://www.insweek.co.kr/news/articleView.html?idxno=71312",
            "https://www.insweek.co.kr/news/articleView.html?idxno=71311",
        ])


if __name__ == "__main__":
    unittest.main()
