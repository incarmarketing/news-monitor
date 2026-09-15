from pathlib import Path
import unittest
from unittest.mock import patch

import ai_briefing
import analyzer
import deterministic_risk
import news_collector
import publisher_identity
import classification_normalizer
import subprocess
import archiver
import publish_report
from tools.resolve_news_original import resolve_google_original
from article_quality import is_non_article_result, is_media_url


class ArticleQualityTests(unittest.TestCase):
    def test_rebuilt_report_keeps_original_korean_generation_time(self):
        payload = {"timestamp": "2026-09-14T04:07:20+00:00", "articles": [], "metrics": {},
                   "window": {"label": "당일 08:00~13:00", "slot": "13"}}
        with patch.object(archiver, "load_day", return_value=None):
            _, _, html = publish_report.render_archive_report(payload)
        self.assertIn("2026.09.14 13:07 생성", html)

    def test_archive_keeps_verified_classification_without_full_body(self):
        row = {"title": "GA 보안 투자 점검", "link": "https://www.asiae.co.kr/article/123",
               "content": "Full source body", "_tone": "caution", "_category": "own",
               "_ai_context": {"own_mentioned": True, "review_required": True, "alert_eligible": False}}
        archived = archiver.lighten(row)
        self.assertTrue(archived["own_mentioned"])
        self.assertNotIn("content", archived)
        self.assertTrue(archived["_ai_context"]["review_required"])
        chosen = ai_briefing.select_evidence_articles([archived], {}, limit=1)
        self.assertEqual(chosen, [archived])

    def test_archived_photo_captions_are_removed_before_report_metrics(self):
        photo = {"title": "기념촬영을 하고 있다.(사진=인카금융서비스)", "link": "https://news.google.com/rss/articles/abc"}
        self.assertTrue(archiver.is_excluded_article(photo))
        payload = {"timestamp": "2026-09-14T13:00:00+09:00", "articles": [photo], "metrics": {}}
        with patch.object(ai_briefing, "build_html_report", return_value="ok") as render, patch.object(archiver, "load_day", return_value=None):
            publish_report.render_archive_report(payload)
            self.assertEqual(render.call_args.args[1], [])
            self.assertEqual(render.call_args.args[2]["total_after_cluster"], 0)

    def test_caption_is_not_a_report_article(self):
        row = {"title": "9일 천대권 인카금융서비스 부회장(왼쪽)이 후원금 전달 기념촬영을 하고 있다.(사진=인카금융서비스) - 전자신문",
               "link": "https://news.google.com/rss/articles/abc", "_category": "own", "_tone": "positive"}
        self.assertTrue(is_non_article_result(row))
        self.assertEqual(news_collector.deduplicate([row]), [])
        self.assertFalse(ai_briefing.is_report_evidence_candidate(row))

    def test_photo_news_headline_is_preserved(self):
        row = {"title": "[포토] 인카금융서비스 후원금 전달", "link": "https://www.etnews.com/20260910000223"}
        self.assertFalse(is_non_article_result(row))
        self.assertEqual(news_collector.deduplicate([row]), [row])

    def test_media_urls_and_query_wrappers_are_rejected(self):
        for url in ["https://press.test/one.jpg?size=100", "https://press.test/news/img_view.htm?img=one.jpg", "https://press.test/a%2Epng"]:
            self.assertTrue(is_media_url(url))
            self.assertTrue(news_collector.is_rejected_original_url(url))
        self.assertFalse(is_media_url("https://press.test/article/123?image=1"))

    def test_arbitrary_outlink_is_not_an_original_article(self):
        page = '<a href="https://unrelated.test/article/1">다른 기사</a>'
        self.assertEqual(news_collector.extract_original_article_url(page, "https://news.google.com/rss/articles/x"), "")
        page = '<a class="media_end_head_origin_link" href="https://press.test/article/1">원문</a>'
        self.assertEqual(news_collector.extract_original_article_url(page, "https://n.news.naver.com/article/1/2"), "https://press.test/article/1")

    def test_security_capacity_is_review_not_confirmed_breach(self):
        row = {"title": "AI 해킹 위협 커지는데…GA·캐피털 보안인력 한 자릿수",
               "description": "코스닥 상장사이자 대형 GA인 인카금융서비스조차 올해 정보보호 전담인력은 1.3명, 투자액은 2억4360만원에 그쳤다."}
        decision = deterministic_risk.classify(row)
        self.assertEqual(decision["suggested_tone"], "caution")
        self.assertTrue(decision["review_required"])
        self.assertFalse(decision["alert_eligible"])
        context = analyzer.apply_context_safety_guardrails(row, {"category": "competitor", "tone": "neutral", "provider": "news_articles_cache"})
        self.assertEqual((context["category"], context["tone"]), ("own", "caution"))
        self.assertIn("1.3명", context["evidence"])
        self.assertTrue(news_collector.should_enrich_article_body(row))

    def test_security_capacity_does_not_use_keywords_or_summary(self):
        for field in ["keyword", "_summary", "summary"]:
            row = {"title": "은행 보안인력 부족", field: "인카금융서비스 보안인력은 단 1명에 그쳤다."}
            self.assertEqual(deterministic_risk.security_capacity_evidence(row), "")

    def test_prevention_and_other_company_do_not_become_own_risk(self):
        for text in ["인카금융서비스, 보안인력을 확충했다.", "인카금융서비스 보안인력이 부족하지 않다.",
                     "삼성생명 정보보호 전담인력이 한 자릿수에 그쳤다. 인카금융서비스는 성수복지관에 후원했다."]:
            self.assertEqual(deterministic_risk.security_capacity_evidence({"title": text}), "")

    def test_actual_breach_keeps_priority_over_review(self):
        decision = deterministic_risk.classify({"title": "인카금융서비스 고객정보 유출", "description": "인카금융서비스 보안인력이 단 1명에 그쳤다."})
        self.assertTrue(decision["alert_eligible"])
        self.assertEqual(decision["suggested_tone"], "negative")

    def test_static_report_normalizer_uses_same_source_rule(self):
        row = classification_normalizer.normalize_article({"title": "GA 정보보호 투자 부족", "description": "인카금융서비스 정보보호 전담인력은 1.3명에 그쳤다.", "_category": "competitor", "_tone": "neutral"})
        self.assertEqual((row["_category"], row["_tone"]), ("own", "caution"))
        manual = classification_normalizer.normalize_article({"title": "인카금융서비스 보안인력이 부족하다", "_feedback_applied": True, "_category": "own", "_tone": "neutral"})
        self.assertEqual(manual["_tone"], "neutral")
        metrics = classification_normalizer.recompute_metrics({"own_total": 0}, [row])
        self.assertEqual(metrics["own_total"], 1)
        self.assertEqual(metrics["own_by_tone"]["caution"], 1)

    def test_image_popup_and_malformed_url(self):
        self.assertTrue(is_media_url("https://www.etnews.com/tools/image_popup.html?v=abc"))
        self.assertTrue(is_media_url("http://[invalid"))
        self.assertFalse(is_media_url("https://regulator.test/disclosure.pdf"))

    def test_company_caution_cannot_be_crowded_out_by_brand_references(self):
        routine = {"title": "보험사 브랜드평판 1위", "link": "https://press.test/1", "_category": "industry", "_tone": "neutral", "_report_id": 1}
        risk = {"title": "GA 보안인력 부족", "description": "인카금융서비스 보안인력 부족", "link": "https://press.test/2", "_category": "own", "_tone": "caution", "_report_id": 2}
        selected = ai_briefing.select_evidence_articles([routine, risk], {"issues": [{"refs": [1]}]}, limit=1)
        self.assertEqual(selected, [risk])

    def test_confirmed_company_negative_precedes_company_caution(self):
        caution = {"title": "인카금융서비스 보안인력 부족", "link": "https://press.test/1", "_tone": "caution"}
        negative = {"title": "인카금융서비스 고객정보 유출", "link": "https://press.test/2", "_tone": "negative"}
        self.assertEqual(ai_briefing.select_evidence_articles([caution, negative], {}, limit=1), [negative])

    def test_body_fetch_failure_is_also_counted_against_budget(self):
        rows = [{"title": "인카금융서비스 보험사기", "link": f"https://press.test/{i}"} for i in range(5)]
        with patch.dict(news_collector.os.environ, {"ARTICLE_BODY_ENRICH_LIMIT": "2"}), patch.object(news_collector, "fetch_article_html", return_value=("", "")) as fetch:
            news_collector.enrich_sensitive_article_bodies(rows)
        self.assertEqual(fetch.call_count, 2)

    def test_verified_publisher_domains_are_reused(self):
        for host, name in {"economychosun.com": "이코노미조선", "news.mbccb.co.kr": "MBC충북", "laborplus.co.kr": "참여와혁신", "dhnews.co.kr": "대학저널", "lawtv.kr": "법률방송뉴스"}.items():
            self.assertEqual(publisher_identity.resolve_publisher({"link": f"https://{host}/article/1", "source": "언론사 확인 필요"})["name"], name)

    def test_daum_metadata_requires_three_matching_publisher_signals(self):
        url = "https://v.daum.net/v/20260908143936119"
        metadata = '<meta property="og:site_name" content="Daum | 아주경제"><meta property="og:article:author" content="아주경제">'
        header = '<a id="kakaoServiceLogo" data-tiara="언론사명">아주경제</a>'
        evidence = publisher_identity.publisher_from_html(metadata + header, url)
        self.assertEqual(evidence["name"], "아주경제")
        self.assertTrue(publisher_identity.valid_page_evidence(evidence))
        self.assertIsNone(publisher_identity.publisher_from_html(metadata, url))
        self.assertIsNone(publisher_identity.publisher_from_html(metadata + header.replace('>아주경제<', '>뉴스1<'), url))
        self.assertIsNone(publisher_identity.publisher_from_html(metadata + '<aside>' + header + '</aside>', url))
        conflict = metadata + header + '<div class="news_view"><p>Copyright © 뉴스1.</p></div>'
        self.assertIsNone(publisher_identity.publisher_from_html(conflict, url))

    def test_repeated_copyright_prefix_is_not_a_publisher_name(self):
        page = '<meta property="og:site_name" content="Daum | SBS"><div class="news_view"><p>Copyright © Copyright ⓒ SBS. All rights reserved.</p></div>'
        evidence = publisher_identity.publisher_from_html(page, 'https://v.daum.net/v/20260914151800784')
        self.assertEqual(evidence['name'], 'SBS')
        page = '<meta property="og:site_name" content="Daum | 매일경제"><div class="news_view"><p>Copyright © 매일경제 &amp; mk.co.kr. 무단 전재 금지</p></div>'
        self.assertEqual(publisher_identity.publisher_from_html(page, 'https://v.daum.net/v/20260910102100696')['name'], '매일경제')
        self.assertIsNone(publisher_identity.publisher_from_html(page.replace('mk.co.kr', 'sbs.co.kr'), 'https://v.daum.net/v/20260910102100696'))

    def test_optional_decoder_is_bounded_and_failure_safe(self):
        url = 'https://news.google.com/rss/articles/' + 'A' * 40
        with patch('tools.resolve_news_original.subprocess.run', side_effect=subprocess.TimeoutExpired('decoder', 15)) as run:
            self.assertEqual(resolve_google_original(url), '')
            self.assertEqual(run.call_args.kwargs['timeout'], 15)
        with patch('tools.resolve_news_original.subprocess.run') as run:
            self.assertEqual(resolve_google_original('https://evil.test/rss/articles/' + 'A' * 40), '')
            run.assert_not_called()

    def test_publisher_queue_includes_non_own_unknowns_without_public_grants(self):
        sql = (Path(__file__).parents[1] / "supabase/migrations/20260914233311_fix_publisher_candidate_regex_bound.sql").read_text(encoding="utf-8")
        self.assertIn("n.own_mentioned is true or", sql)
        self.assertIn("public.media_publisher_unknown(n.source)", sql)
        self.assertIn("interval '14 days'", sql)
        self.assertNotIn("grant ", sql.lower())


if __name__ == "__main__":
    unittest.main()
