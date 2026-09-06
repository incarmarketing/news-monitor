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
import requests
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

    def test_metadata_requires_agreeing_publisher_signals(self):
        page = '<meta property="og:site_name" content="새로운매체"><title>기사 제목 - 새로운매체</title>'
        found = publishers.publisher_from_html(page, "https://new-press.example/1")
        self.assertEqual(found["name"], "새로운매체")
        self.assertEqual(found["method"], "page_metadata")
        self.assertIsNone(publishers.publisher_from_html('<meta property="og:site_name" content="새로운매체">', "https://new-press.example/1"))
        self.assertIsNone(publishers.publisher_from_html(page, "https://news.google.com/1"))
        self.assertIsNone(publishers.publisher_from_html(page.replace("기사 제목 - 새로운매체", "새로운매체와 타사 협약"), "https://new-press.example/1"))

    def test_schema_publisher_is_not_an_author_or_a_related_organization(self):
        meta = '<meta property="og:site_name" content="새로운매체">'
        def page(schema):
            return meta + '<script type="application/ld+json">' + json.dumps(schema) + '</script>'
        publisher = {"@type": "Organization", "name": "새로운매체", "url": "https://new-press.example"}
        valid = {"@type": "NewsArticle", "publisher": publisher}
        self.assertEqual(publishers.publisher_from_html(page({"@graph": [valid]}), "https://new-press.example/1")["name"], "새로운매체")
        for schema in [
            {"@type": "NewsArticle", "author": publisher},
            {"@type": "NewsArticle", "publisher": {**publisher, "@type": "Person"}},
            {"@type": "NewsArticle", "publisher": {**publisher, "url": "https://ad.example"}},
            {"@type": "Product", "publisher": publisher},
        ]:
            with self.subTest(schema=schema):
                self.assertIsNone(publishers.publisher_from_html(page(schema), "https://new-press.example/1"))

    def test_conflicting_publication_brand_is_not_guessed(self):
        meta = '<meta property="og:site_name" content="본사신문"><title>기사 - 본사신문</title>'
        conflict = {"@type": "NewsArticle", "publisher": {"@type": "Organization", "name": "자매신문"}}
        page = meta + '<script type="application/ld+json">' + json.dumps(conflict) + '</script>'
        self.assertIsNone(publishers.publisher_from_html(page, "https://sister.example/1"))

    def test_malformed_page_metadata_does_not_interrupt_collection(self):
        for page in ['<meta name><script type>', '<script type="application/ld+json">{broken}</script>', '<script type="application/ld+json">{"@type":{}}</script>']:
            with self.subTest(page=page):
                self.assertIsNone(publishers.publisher_from_html(page, "https://new-press.example/1"))

    def test_enrichment_preserves_known_sources(self):
        article = {"source": "보험매일", "link": "https://fins.co.kr/1"}
        with patch.object(publishers, "publisher_from_html") as parse:
            publishers.enrich_from_html(article, "irrelevant", article["link"])
        parse.assert_not_called()
        self.assertEqual(article["source"], "보험매일")

    def test_reuses_body_fetch_and_preserves_identity_evidence_through_storage(self):
        article = {"source": publishers.UNKNOWN, "source_raw": "new-press.example", "link": "https://new-press.example/1", "title": "보험사기 제재"}
        page = '<meta property="og:site_name" content="새로운매체"><title>보험사기 제재 - 새로운매체</title>'
        with patch.object(news_collector, "should_enrich_article_body", return_value=True), patch.object(news_collector, "fetch_article_html", return_value=(page, article["link"])) as fetch, patch.object(news_collector, "extract_original_article_url", return_value=""), patch.object(news_collector, "extract_article_body_from_html", return_value="본문은 그대로 보존"):
            news_collector.enrich_sensitive_article_bodies([article])
        fetch.assert_called_once()
        self.assertEqual(article["source"], "새로운매체")
        self.assertEqual(article["body"], "본문은 그대로 보존")
        light = archiver.lighten(article)
        with patch.object(supabase_store, "normalized_article_context", return_value={}):
            stored = supabase_store.normalize_article(light, {})
        self.assertEqual(stored["source"], "새로운매체")
        self.assertEqual(stored["raw"]["source_raw"], "new-press.example")
        self.assertEqual(stored["raw"]["publisher_evidence"]["host"], "new-press.example")

    def test_naver_unknown_original_domain_is_not_lost(self):
        item = {"title": "기사", "originallink": "https://new-press.example/1"}
        with patch.object(news_collector, "NAVER_CLIENT_ID", "test"), patch.object(news_collector, "NAVER_CLIENT_SECRET", "test"), patch.object(news_collector.requests, "get", return_value=Mock(json=lambda: {"items": [item]})) as get:
            article = news_collector.fetch_naver_news("보험")[0]
        get.assert_called_once()
        self.assertEqual(article["source_raw"], "new-press.example")
        self.assertEqual(article["source"], publishers.UNKNOWN)

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

    def test_transient_write_is_retried_with_the_same_guard(self):
        row = {"id": 4, "updated_at": "2026-09-04T10:00:00Z", "source": "google", "title": "기사 - 뉴스1"}
        with patch.object(supabase_store, "request", side_effect=[requests.Timeout(), Mock(json=lambda: [{"id": 4}])]) as request, patch("tools.backfill_publisher_identity.time.sleep"):
            self.assertEqual(apply_row(row), "updated")
        self.assertEqual(request.call_args_list[0], request.call_args_list[1])


if __name__ == "__main__":
    unittest.main()
