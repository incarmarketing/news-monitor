import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

import publisher_identity as publishers
import news_collector
import archiver
import ai_briefing
import supabase_store
from tools.backfill_publisher_identity import repair_patch, apply_row, scan_rows


class PublisherIdentityTests(unittest.TestCase):
    def tearDown(self):
        publishers.configure_aliases([])

    def test_shared_cases(self):
        cases = json.loads((Path(__file__).parent / "fixtures/publisher_cases.json").read_text(encoding="utf-8"))
        for article, expected in cases:
            with self.subTest(article=article):
                self.assertEqual(publishers.resolve_publisher(article)["name"], expected)
                self.assertEqual(ai_briefing.report_source_label(article), expected)

    def test_admin_alias_overrides_bundled_domain(self):
        publishers.configure_aliases([{"host": "www.etoday.co.kr", "press_name": "관리자 지정 매체"}])
        self.assertEqual(publishers.resolve_publisher({"source": "이투데이", "link": "https://etoday.co.kr/1"})["name"], "관리자 지정 매체")

    def test_portal_alias_is_not_a_publisher(self):
        publishers.configure_aliases([{"host": "news.google.com", "press_name": "잘못된 매체"}])
        self.assertEqual(publishers.resolve_publisher({"link": "https://news.google.com/1"})["name"], publishers.UNKNOWN)

    def test_google_rss_source_survives_archive_and_storage(self):
        feed = SimpleNamespace(entries=[{
            "title": "제목 - google", "link": "https://news.google.com/rss/articles/abc",
            "source": {"title": "SBSBiz", "href": "https://biz.sbs.co.kr"},
        }])
        with patch.object(news_collector.feedparser, "parse", return_value=feed), patch.object(news_collector.requests, "get") as get:
            article = news_collector.fetch_google_news("보험")[0]
        get.assert_not_called()
        self.assertEqual(article["source"], "SBS Biz")
        light = archiver.lighten(article)
        self.assertEqual(light["rss_source_name"], "SBSBiz")
        self.assertEqual(light["portal"], "google")
        with patch.object(supabase_store, "normalized_article_context", return_value={}):
            stored = supabase_store.normalize_article(light, {})
        self.assertEqual(stored["source"], "SBS Biz")
        self.assertEqual(stored["raw"]["source_url"], "https://biz.sbs.co.kr")

    def test_missing_rss_source_does_not_lose_article(self):
        feed = SimpleNamespace(entries=[{"title": "출처 불명 기사", "link": "https://news.google.com/rss/a"}])
        with patch.object(news_collector.feedparser, "parse", return_value=feed):
            rows = news_collector.fetch_google_news("보험")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source"], publishers.UNKNOWN)

    def test_backfill_changes_only_source_and_keeps_raw_fields(self):
        row = {"id": 4, "source": "google", "title": "뉴스 - 뉴스1", "link": "https://news.google.com/1", "raw": {"_tone": "positive", "source": "google", "pub_date": "2026-09-01"}}
        result = repair_patch(row)
        self.assertEqual(set(result), {"source", "raw"})
        self.assertEqual(result["source"], "뉴스1")
        self.assertEqual(result["raw"]["_tone"], "positive")
        self.assertEqual(result["raw"]["source_raw"], "google")
        self.assertIsNone(repair_patch({**row, **result}))

    def test_multiple_title_dashes_use_last_publisher(self):
        self.assertEqual(publishers.title_publisher("보험 - 실적 개선 - 뉴스1"), "뉴스1")

    def test_rendered_html_never_uses_raw_domain_as_card_publisher(self):
        article = {"source": "google", "title": "보험 업계 수수료 변화 - SBS Biz", "link": "https://news.google.com/rss/a", "_category": "regulation", "_tone": "caution", "_score": 10, "_cluster_size": 1}
        rendered = ai_briefing.build_html_report("", [article], {}, None)
        self.assertNotIn("[google]", rendered)
        self.assertIn("[SBS Biz]", rendered)

    def test_backfill_uses_concurrency_guard(self):
        row = {"id": 4, "updated_at": "2026-09-04T10:00:00+00:00", "source": "google", "title": "기사 - 뉴스1"}
        with patch.object(supabase_store, "request", return_value=Mock(json=lambda: [])) as request:
            self.assertEqual(apply_row(row), "conflict")
        self.assertIn("updated_at=eq.2026-09-04T10%3A00%3A00%2B00%3A00", request.call_args.args[1])

    def test_scan_paginates_until_empty_not_a_fixed_limit(self):
        with patch.object(supabase_store, "request", side_effect=[Mock(json=lambda: [{"id": 500}]), Mock(json=lambda: [{"id": 700}]), Mock(json=lambda: [])]) as request:
            self.assertEqual(list(scan_rows()), [{"id": 500}, {"id": 700}])
        self.assertIn("id=gt.500", request.call_args_list[1].args[1])
        self.assertIn("id=gt.700", request.call_args_list[2].args[1])


if __name__ == "__main__":
    unittest.main()
