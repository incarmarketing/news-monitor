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
from tools.backfill_publisher_identity import repair_patch, apply_row, scan_rows, page_evidence_patch


class PublisherIdentityTests(unittest.TestCase):
    daum_url = "https://v.daum.net/v/20260909165149886"

    def daum_page(self):
        return (Path(__file__).parent / "fixtures/daum_publisher.html").read_text(encoding="utf-8")

    def test_daum_article_copyright_agrees_with_publisher_metadata(self):
        evidence = publishers.publisher_from_html(self.daum_page(), self.daum_url)
        self.assertEqual(evidence["name"], "아시아경제")
        self.assertEqual(evidence["signals"], ["daum_site_name", "article_copyright"])
        self.assertTrue(publishers.valid_page_evidence(evidence))
        row = {"source": publishers.UNKNOWN, "link": "https://news.google.com/rss/articles/abc", "raw": {"_tone": "neutral"}}
        patch_value = page_evidence_patch(row, evidence)
        self.assertEqual(patch_value["source"], "아시아경제")
        self.assertEqual(patch_value["raw"]["_tone"], "neutral")
        self.assertIsNone(page_evidence_patch(row, {**evidence, "signals": ["article_copyright"]}))
        self.assertIsNone(page_evidence_patch(row, {**evidence, "name": "Daum"}))

    def test_daum_requires_article_path_and_two_matching_signals(self):
        page = self.daum_page()
        for bad_url in ["https://v.daum.net", "https://v.daum.net/search", "https://v.daum.net.evil.example/v/20260909165149886", "https://news.google.com/rss/articles/abc", "https://user@v.daum.net/v/20260909165149886"]:
            with self.subTest(url=bad_url):
                self.assertIsNone(publishers.publisher_from_html(page, bad_url))
        for bad_page in [page.replace("Daum | 아시아경제", "Daum | 보험매일"),
                         page.replace("Daum | 아시아경제", "Daum"),
                         page.replace("Copyright © 아시아경제.", "Copyright © Daum Corp."),
                         page.replace("아시아경제", "검증되지않은매체"),
                         page + '<meta property="og:site_name" content="Daum | 보험매일">']:
            with self.subTest(page=bad_page):
                self.assertIsNone(publishers.publisher_from_html(bad_page, self.daum_url))

    def test_daum_photo_quote_related_and_body_notice_are_not_publisher_evidence(self):
        meta = '<meta property="og:site_name" content="Daum | 아시아경제">'
        notice = '<p>Copyright © 아시아경제.</p>'
        for wrapper in ['<div class="article_view">{}</div>', '<figure>{}</figure>', '<blockquote>{}</blockquote>',
                        '<aside>{}</aside>', '<div class="related-news">{}</div>', '<script>{}</script>', '<!--{}-->']:
            page = meta + '<div class="news_view">' + wrapper.format(notice) + '</div><footer>© Daum Corp.</footer>'
            with self.subTest(wrapper=wrapper):
                self.assertIsNone(publishers.publisher_from_html(page, self.daum_url))

    def test_daum_related_links_are_never_treated_as_current_original(self):
        self.assertEqual(news_collector.extract_original_article_url(self.daum_page(), self.daum_url), "")
        response = Mock(text=self.daum_page(), url=self.daum_url)
        with patch.object(news_collector.requests, "get", return_value=response):
            self.assertEqual(news_collector.resolve_portal_press_from_page(self.daum_url), "아시아경제")

    def test_daum_publisher_is_recovered_without_an_extra_body_request(self):
        article = {"source": publishers.UNKNOWN, "link": self.daum_url, "title": "보험사기 제재"}
        with patch.object(news_collector, "should_enrich_article_body", return_value=True), patch.object(news_collector, "fetch_article_html", return_value=(self.daum_page(), self.daum_url)) as fetch, patch.object(news_collector, "extract_article_body_from_html", return_value="원문 본문"):
            news_collector.enrich_sensitive_article_bodies([article])
        fetch.assert_called_once()
        self.assertEqual(article["source"], "아시아경제")
        light = archiver.lighten(article)
        self.assertEqual(light["publisher_evidence"]["host"], "v.daum.net")

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

    def test_alphabiz_domain_only_rss_survives_collection_archive_and_repair(self):
        feed = SimpleNamespace(entries=[{
            "title": "보험업계 소식 - alphabiz.co.kr",
            "link": "https://news.google.com/rss/articles/alphabiz-fixture",
            "source": {"title": "alphabiz.co.kr", "href": "https://www.alphabiz.co.kr"},
        }])
        with patch.object(news_collector.feedparser, "parse", return_value=feed), patch.object(news_collector.requests, "get") as get:
            article = news_collector.fetch_google_news("보험")[0]
        get.assert_not_called()
        self.assertEqual(article["source"], "알파경제")
        light = archiver.lighten(article)
        with patch.object(supabase_store, "normalized_article_context", return_value={}):
            stored = supabase_store.normalize_article(light, {})
        self.assertEqual(stored["source"], "알파경제")
        self.assertEqual(stored["raw"]["source_url"], "https://www.alphabiz.co.kr")
        old = {**stored, "source": publishers.UNKNOWN,
               "raw": {**stored["raw"], "source": publishers.UNKNOWN, "_tone": "neutral"}}
        repaired = repair_patch(old)
        self.assertEqual(set(repaired), {"source", "raw"})
        self.assertEqual(repaired["source"], "알파경제")
        self.assertEqual(repaired["raw"]["_tone"], "neutral")
        self.assertIsNone(repair_patch({**old, **repaired}))

    def test_alphabiz_page_evidence_and_byline_agree(self):
        from media_byline import extract_bylines
        page = (Path(__file__).parent / "fixtures/alphabiz_publisher.html").read_text(encoding="utf-8")
        evidence = publishers.publisher_from_html(page, "https://www.alphabiz.co.kr/news/articleView.html?idxno=183959")
        self.assertEqual(evidence["name"], "알파경제")
        self.assertEqual(evidence["signals"], ["copyright", "og_site_name", "schema_publisher"])
        self.assertTrue(publishers.valid_page_evidence(evidence))
        self.assertEqual(extract_bylines(page)[0]["name"], "김혜실")
        # The HTML parser also recognizes an unregistered domain when evidence agrees.
        self.assertEqual(publishers.publisher_from_html(page, "https://unregistered-press.example/1")["name"], "알파경제")

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

    def test_hyphenated_title_source_uses_admin_alias(self):
        publishers.configure_aliases([{"host": "new-press.example", "press_name": "검증매체"}])
        self.assertEqual(publishers.resolve_publisher({"source": "google", "title": "보험 - 실적 - new-press.example"})["name"], "검증매체")
        self.assertEqual(publishers.resolve_publisher({"source": "google", "title": "보험 - new-press.example - 네이트"})["name"], publishers.UNKNOWN)

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

    def test_copyright_alone_resolves_a_known_publisher(self):
        for notice in [
            'Copyright © 디지털타임스. 무단전재 및 재배포 금지.',
            '[저작권자 ⓒ디지털타임스, 무단 전재-재배포, AI 학습 및 활용 금지]',
            'Copyright (c) 2026 (주)디지털타임스. All rights reserved.',
            '디지털타임스 © dt.co.kr All rights reserved.',
        ]:
            with self.subTest(notice=notice):
                page = f'<footer><p>{notice}</p></footer>'
                found = publishers.publisher_from_html(page, 'https://new-press.example/news/1')
                self.assertEqual(found['name'], '디지털타임스')
                self.assertEqual(found['method'], 'page_copyright')

    def test_copyright_inline_elements_and_body_footer(self):
        page = '<div class="article-copyright">Copyright &copy; <strong>디지털타임스</strong>. 무단전재 및 재배포 금지.</div>'
        self.assertEqual(publishers.publisher_from_html(page, 'https://new-press.example/1')['name'], '디지털타임스')

    def test_new_publisher_copyright_requires_metadata_agreement(self):
        footer = '<ul class="copyright"><li>새로운검증신문 © <a href="https://new-press.example">new-press.example</a> All rights reserved.</li></ul>'
        page = '<meta property="og:site_name" content="새로운검증신문">' + footer
        self.assertEqual(publishers.publisher_from_html(page, 'https://new-press.example/news/1')['name'], '새로운검증신문')
        self.assertIsNone(publishers.publisher_from_html(footer, 'https://new-press.example/news/1'))
        unknown = '<footer>Copyright © 검증전매체. All rights reserved.</footer>'
        self.assertIsNone(publishers.publisher_from_html(unknown, 'https://new-press.example/1'))

    def test_copyright_in_body_quotes_photos_scripts_and_comments_ignored(self):
        notice = '<div class="copyright">Copyright © 디지털타임스. All rights reserved.</div>'
        for page in [
            '<p>디지털타임스 기사를 인용했습니다.</p>',
            '<blockquote>' + notice + '</blockquote>',
            '<figure>' + notice + '</figure>',
            '<footer><span class="photo-credit">Copyright © 디지털타임스</span></footer>',
            '<script>' + notice + '</script>',
            '<!--' + notice + '-->',
            '<aside>' + notice + '</aside>',
            '<div class="related-articles">' + notice + '</div>',
        ]:
            with self.subTest(page=page):
                self.assertIsNone(publishers.publisher_from_html(page, 'https://new-press.example/1'))

    def test_portal_copyright_never_becomes_a_publisher(self):
        for notice in ['Copyright © NAVER Corp.', 'Copyright © Google', 'Copyright © 디지털타임스']:
            page = '<footer>' + notice + '</footer>'
            self.assertIsNone(publishers.publisher_from_html(page, 'https://news.google.com/rss/1'))

    def test_conflicting_footer_parent_brand_and_software_not_used(self):
        footer = '<footer><p>Copyright © 디지털타임스.</p></footer>'
        self.assertIsNone(publishers.publisher_from_html(footer, 'https://fins.co.kr/news/1'))
        conflict = '<meta property="og:site_name" content="보험매일"><title>기사 - 보험매일</title>' + footer
        self.assertIsNone(publishers.publisher_from_html(conflict, 'https://new-press.example/1'))
        self.assertIsNone(publishers.publisher_from_html('<title>기사 - 보험매일</title>' + footer, 'https://new-press.example/1'))
        software = '<footer>Copyright © ND소프트. All rights reserved.</footer>'
        self.assertIsNone(publishers.publisher_from_html(software, 'https://new-press.example/1'))

    def test_footer_is_read_after_large_advertising_payload(self):
        page = '<script>' + (' ' * 1_100_000) + '</script><footer>Copyright © 디지털타임스.</footer>'
        self.assertEqual(publishers.publisher_from_html(page, 'https://new-press.example/1')['name'], '디지털타임스')

    def test_excessive_html_nesting_is_bounded(self):
        page = '<div>' * 1000 + '<footer>Copyright © 디지털타임스.</footer>'
        self.assertIsNone(publishers.publisher_from_html(page, 'https://new-press.example/1'))

    def test_copyright_update_uses_the_same_concurrency_guard(self):
        evidence = publishers.publisher_from_html('<footer>Copyright © 디지털타임스.</footer>', 'https://new-press.example/1')
        row = {'id': 4, 'source': publishers.UNKNOWN, 'updated_at': '2026-09-07T01:00:00Z'}
        with patch.object(supabase_store, 'request', return_value=Mock(json=lambda: [])) as request:
            self.assertEqual(apply_row(row, evidence), 'conflict')
        self.assertIn('updated_at=eq.2026-09-07T01%3A00%3A00Z', request.call_args.args[1])
        self.assertEqual(json.loads(request.call_args.kwargs['data'])['source'], '디지털타임스')

    def test_copyright_enrichment_preserves_raw_and_manual_correction(self):
        evidence = publishers.publisher_from_html('<footer>Copyright © 디지털타임스.</footer>', 'https://new-press.example/1')
        row = {'id': 4, 'source': publishers.UNKNOWN, 'raw': {'_tone': 'positive', 'pub_date': '2026-09-01'}}
        patch_value = page_evidence_patch(row, evidence)
        self.assertEqual(patch_value['source'], '디지털타임스')
        self.assertEqual(patch_value['raw']['_tone'], 'positive')
        self.assertEqual(patch_value['raw']['pub_date'], '2026-09-01')
        self.assertEqual(patch_value['raw']['publisher_evidence']['method'], 'page_copyright')
        self.assertIsNone(page_evidence_patch({**row, 'raw': {'publisher_manual_override': '보험매일'}}, evidence))
        self.assertIsNone(page_evidence_patch(row, {**evidence, 'url': 'https://news.google.com/rss/1'}))
        self.assertIsNone(page_evidence_patch({**row, **patch_value}, evidence))

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
