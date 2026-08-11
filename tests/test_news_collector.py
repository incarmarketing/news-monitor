from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import news_collector


KST = timezone(timedelta(hours=9))


class CollectionWindowFilterTests(unittest.TestCase):
    def test_iso_original_timestamp_is_parsed(self) -> None:
        parsed = news_collector.parse_pub_date("2026-04-30T04:00:00+09:00")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-04-29T19:00:00+00:00")

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
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["kbanker.co.kr"], "대한금융신문")
        self.assertEqual(news_collector.DOMAIN_PRESS_MAP["eroun.net"], "이로운넷")

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

    def test_own_press_search_urls_are_collected_from_publisher_search(self) -> None:
        source = {
            "name": "대한금융신문",
            "base_url": "https://www.kbanker.co.kr/",
            "search_url_templates": [
                "https://www.kbanker.co.kr/news/articleList.html?sc_area=A&view_type=sm&sc_word={query}",
            ],
            "article_url_patterns": [
                r'https?://(?:www\.)?kbanker\.co\.kr/news/articleView\.html\?idxno=\d+',
                r'["\'](/news/articleView\.html\?idxno=\d+)["\']',
            ],
        }
        html = """
        <a href="/news/articleView.html?idxno=225381">금융사 임원 103명</a>
        <a href="/news/articleView.html?idxno=225384">보험 임원 자사주식</a>
        """

        with patch.object(news_collector, "fetch_article_html", return_value=(html, "https://www.kbanker.co.kr/news/articleList.html")):
            urls = news_collector.collect_source_search_article_urls(source, "인카금융서비스", 5)

        self.assertEqual(urls, [
            "https://www.kbanker.co.kr/news/articleView.html?idxno=225381",
            "https://www.kbanker.co.kr/news/articleView.html?idxno=225384",
        ])

    def test_own_press_search_includes_insurance_trade_media(self) -> None:
        names = {source["name"] for source in news_collector.OWN_PRESS_SEARCH_SOURCES}

        self.assertIn("보험매일", names)
        self.assertIn("보험저널", names)
        self.assertIn("한국보험신문", names)
        self.assertIn("보험신보", names)

    def test_own_press_search_rejects_result_without_company_mention(self) -> None:
        source = {
            "name": "보험매일",
            "base_url": "https://www.fins.co.kr/",
            "search_url_templates": ["https://www.fins.co.kr/news/search?keyword={query}"],
            "article_url_patterns": [r'https?://www\.fins\.co\.kr/news/articleView\.html\?idxno=\d+'],
        }
        unrelated = {
            "title": "설계사 근로자성 분쟁 대비해야",
            "description": "GA업계의 노무관리 부담을 다룬 기사입니다.",
            "body": "보험설계사의 근로자성을 둘러싼 입법 논의가 본격화했습니다.",
            "source": "보험매일",
            "link": "https://www.fins.co.kr/news/articleView.html?idxno=109567",
        }

        with (
            patch.object(news_collector, "OWN_PRESS_SEARCH_SOURCES", [source]),
            patch.object(news_collector, "MANDATORY_OWN_COLLECTION_KEYWORDS", ["인카금융서비스"]),
            patch.object(
                news_collector,
                "collect_source_search_article_urls",
                return_value=[unrelated["link"]],
            ),
            patch.object(news_collector, "fetch_trade_press_article", return_value=unrelated),
        ):
            rows = news_collector.fetch_own_press_search_news(limit_per_source=5)

        self.assertEqual(rows, [])

    def test_own_press_search_keeps_result_with_company_mention(self) -> None:
        source = {
            "name": "보험매일",
            "base_url": "https://www.fins.co.kr/",
            "search_url_templates": ["https://www.fins.co.kr/news/search?keyword={query}"],
            "article_url_patterns": [r'https?://www\.fins\.co\.kr/news/articleView\.html\?idxno=\d+'],
        }
        own_article = {
            "title": "인카금융서비스, 설계사 교육체계 개편",
            "description": "인카금융서비스가 교육체계를 개편했습니다.",
            "body": "인카금융서비스는 현장 지원을 강화한다고 밝혔습니다.",
            "source": "보험매일",
            "link": "https://www.fins.co.kr/news/articleView.html?idxno=109568",
        }

        with (
            patch.object(news_collector, "OWN_PRESS_SEARCH_SOURCES", [source]),
            patch.object(news_collector, "MANDATORY_OWN_COLLECTION_KEYWORDS", ["인카금융서비스"]),
            patch.object(
                news_collector,
                "collect_source_search_article_urls",
                return_value=[own_article["link"]],
            ),
            patch.object(news_collector, "fetch_trade_press_article", return_value=own_article),
        ):
            rows = news_collector.fetch_own_press_search_news(limit_per_source=5)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["keyword"], "인카금융서비스")
        self.assertEqual(rows[0]["keyword_category"], "own")

    def test_trade_press_body_can_make_article_relevant_to_own_company(self) -> None:
        article = {
            "title": "상위권 GA, 상반기 마지막 달 호실적 마감",
            "description": "지에이코리아와 글로벌금융판매가 상반기 마지막 달 실적을 회복했다.",
            "body": (
                "지에이코리아와 인카금융서비스가 양호한 실적으로 상반기 마지막 달을 마감했다. "
                "양사는 4월~5월 매출이 저조했으나 6월 매출이 급증하며 존재감을 회복했다."
            ),
            "keyword": "인카금융서비스",
            "keyword_query": "인카금융서비스",
            "keyword_category": "own",
            "portal": "source_search",
        }

        self.assertTrue(news_collector.is_relevant_article(article))


class CollectionKeywordTests(unittest.TestCase):
    def test_non_search_rows_are_not_used_as_collection_queries(self) -> None:
        rows = [
            {"keyword": "보험", "category": "industry", "is_search_keyword": False},
            {"keyword": "인카금융서비스", "category": "own", "is_search_keyword": True},
        ]

        normalized = news_collector.normalize_collection_keywords(rows)
        queries = {(row["keyword"], row["query"], row["category"]) for row in normalized}

        self.assertNotIn(("보험", "보험", "industry"), queries)
        self.assertIn(("인카금융서비스", "인카금융서비스", "own"), queries)

    def test_mandatory_own_keywords_are_always_collected(self) -> None:
        normalized = news_collector.normalize_collection_keywords([])
        queries = {(row["keyword"], row["query"], row["category"]) for row in normalized}

        self.assertIn(("인카금융서비스", "인카금융서비스", "own"), queries)
        self.assertIn(("인카금융", "인카금융", "own"), queries)


class KeywordContextMatchTests(unittest.TestCase):
    def test_short_latin_context_term_does_not_match_inside_words(self) -> None:
        self.assertFalse(news_collector.terms_match_text("global magazine launch", ["GA"]))

    def test_short_latin_context_term_matches_korean_suffix_context(self) -> None:
        self.assertTrue(news_collector.terms_match_text("GA업계 정착지원금 공시", ["GA"]))


if __name__ == "__main__":
    unittest.main()
