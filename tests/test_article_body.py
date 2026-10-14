import unittest
from unittest.mock import patch

import article_body
import deterministic_risk
import news_collector
import negative_watch
import analyzer
import supabase_store
import sync_daily_archive_to_supabase
from tools import classification_source_review


BENIGN = "보험사가 반려동물 치료비와 행동교정 보장을 확대했습니다. " * 8
RISK = "금융감독원은 인카금융서비스 소속 설계사의 보험사기 연루를 확인하고 업무정지 제재를 통보했다."


class ArticleScopeTests(unittest.TestCase):
    def test_original_recheck_replaces_all_stale_source_fields(self):
        title = "보험대리점 상품추천 규제"
        document = f'<title>{title}</title><div id="article-view-content-div"><p>{BENIGN}</p></div>'
        row = {"title": title, "link": "https://example.com/article", "raw": {
            "body": RISK, "content": RISK, "description": RISK, "title": RISK}}
        with patch.object(classification_source_review, "fetch_document", return_value=(document,row["link"])):
            result = classification_source_review.inspect(row, {})
        self.assertEqual(result["status"], "source_verified_review")
        self.assertFalse(result["proposed"]["own_mentioned"])
        self.assertFalse(result["proposed"]["alert_eligible"])

    def test_metadata_only_body_evidence_survives_collection_and_save(self):
        title, link = "보험업계 감독 강화", "https://example.com/article"
        article = {"title": title, "link": link, "body": RISK, "content": RISK,
                   "_body_scope": article_body.body_scope(RISK,"explicit_body",link),
                   "storage_policy": "metadata_only"}
        analyzer.apply_context_safety_guardrails(article)
        row = supabase_store.normalize_article(article,{"date":"2026-10-14","window":{},"metrics":{}})
        self.assertTrue(row["alert_eligible"])
        self.assertNotIn("body", row["raw"])
        self.assertEqual(article_body.verified_source_evidence(row), RISK)
        fresh = {"title": title, "link": link, "description": "보험 업계의 감독 개선 동향입니다."}
        self.assertTrue(supabase_store.apply_article_analysis_cache(fresh,{row["article_hash"]:row}))
        analyzer.apply_context_safety_guardrails(fresh)
        repeated = supabase_store.normalize_article(fresh,{"date":"2026-10-14","window":{},"metrics":{}})
        self.assertTrue(repeated["alert_eligible"])
        self.assertTrue(repeated["own_mentioned"])
        self.assertNotIn("body", repeated["raw"])

    def test_evidence_proof_is_bound_to_article_and_body(self):
        article = {"title":"GA 동향","link":"https://example.com/a","body":RISK,
                   "_body_scope":article_body.body_scope(RISK,"explicit_body","https://example.com/a")}
        proof = article_body.source_evidence_scope(article,RISK)
        candidate = {"title":article["title"],"link":article["link"],"_source_evidence_scope":proof}
        self.assertTrue(deterministic_risk.classify(candidate)["alert_eligible"])
        for changes in ({"title":"다른 기사"},{"link":"https://example.com/b"},
                        {"_body_scope":article_body.body_scope(BENIGN,"explicit_body",article["link"])},
                        {"_source_evidence_scope":{**proof,"text":RISK+" altered"}}):
            with self.subTest(changes=changes):
                self.assertFalse(deterministic_risk.classify({**candidate,**changes})["alert_eligible"])
        self.assertIsNone(article_body.source_evidence_scope(article,"인카금융서비스 횡령 사건"))
        self.assertIsNone(article_body.source_evidence_scope({**article,"_body_scope":{}},RISK))

    def test_metadata_only_storage_also_strips_nested_source_body(self):
        article = {"title":"보험기사","storage_policy":"metadata_only","body":RISK,
                   "raw":{"body":RISK,"content":RISK,"description":RISK,"source":"매체"}}
        stored = supabase_store.storage_safe_article(article)
        self.assertNotIn("body",stored)
        self.assertEqual(stored["raw"],{"source":"매체"})

    def test_old_archive_cannot_reintroduce_disproved_company_mention(self):
        title, link = "보험대리점 상품추천", "https://example.com/a"
        row = {"title":title,"link":link,"raw":{"body":BENIGN,
               "_body_scope":article_body.body_scope(BENIGN,"explicit_body",link)}}
        archived = {"title":title,"link":link,"body":RISK,"content":RISK,"raw":{"body":RISK}}
        with patch.object(supabase_store,"load_article_analysis_cache",return_value={supabase_store.article_hash(archived):row}):
            sync_daily_archive_to_supabase.reclassify_articles([archived])
        self.assertFalse(archived["alert_eligible"])
        self.assertFalse(analyzer.has_own_evidence(archived))

    def test_old_archive_reuses_metadata_only_verified_risk_sentence(self):
        title, link = "보험업계 감독 강화", "https://example.com/a"
        original = {"title":title,"link":link,"body":RISK,
                    "_body_scope":article_body.body_scope(RISK,"explicit_body",link)}
        proof=article_body.source_evidence_scope(original,RISK)
        row={"title":title,"link":link,"raw":{"_source_evidence_scope":proof}}
        archived={"title":title,"link":link,"body":BENIGN,"raw":{"body":BENIGN},"storage_policy":"metadata_only"}
        with patch.object(supabase_store,"load_article_analysis_cache",return_value={supabase_store.article_hash(archived):row}):
            sync_daily_archive_to_supabase.reclassify_articles([archived])
        self.assertTrue(archived["alert_eligible"])
        self.assertNotIn("body",supabase_store.storage_safe_article(archived))

    def test_larger_page_paragraphs_never_beat_explicit_body(self):
        document = f'<div id="article-view-content-div"><p>{BENIGN}</p></div><aside><p>{RISK * 20}</p></aside>'
        body = news_collector.extract_article_body_from_html(document)
        self.assertIn("행동교정", body)
        self.assertNotIn("인카금융", body)
        self.assertFalse(deterministic_risk.classify({"title": "펫보험 보장 확대", "body": body})["alert_eligible"])

    def test_nested_divs_preserve_complete_body_and_reject_inner_widgets(self):
        document = f'<article><div id="article-view-content-div"><div><p>{BENIGN}</p></div><p>{RISK}</p><div class="related-articles">{RISK} unrelated</div><script>{RISK}</script></div><footer>tail</footer></article>'
        body = news_collector.extract_article_body_from_html(document)
        self.assertIn(RISK, body)
        self.assertNotIn("unrelated", body)
        self.assertNotIn("tail", body)
        self.assertEqual(body.count(RISK), 1)
        self.assertTrue(deterministic_risk.classify({"title": "GA 감독 동향", "body": body})["alert_eligible"])

    def test_dateline_article_does_not_capture_real_body(self):
        document = f'<article>발행일: 2026-10-13</article><div itemprop="articleBody"><p>{BENIGN}</p></div>'
        self.assertIn("행동교정", news_collector.extract_article_body_from_html(document))

    def test_broad_article_body_wrapper_cannot_override_inner_body(self):
        document = f'<div class="article-body"><div id="article-view-content-div"><p>{BENIGN}</p></div><article class="box-skin"><section class="content"><div class="auto-article">{RISK * 20}</div></section></article></div>'
        self.assertNotIn("인카금융", news_collector.extract_article_body_from_html(document))

    def test_unknown_page_is_unverified_even_with_risk_paragraphs(self):
        document = f'<main><p>{BENIGN}</p></main><div><p>{RISK * 3}</p></div>'
        self.assertEqual(news_collector.extract_article_body_from_html(document), "")

    def test_article_wrapper_prunes_header_photos_footer_and_related(self):
        document = f'<article><header>{RISK}</header><p>{BENIGN}</p><figure><figcaption>{RISK}</figcaption></figure><div class="recommend">{RISK}</div><footer>{RISK}</footer></article>'
        body = news_collector.extract_article_body_from_html(document)
        self.assertNotIn("인카금융", body)

    def test_relation_article_is_not_article_body(self):
        document = f'<div class="article-body"><p>{BENIGN}</p><article class="relation"><ul><li>{RISK}</li></ul></article></div>'
        self.assertNotIn("인카금융", news_collector.extract_article_body_from_html(document))

    def test_page_form_preserves_real_body_but_embedded_form_is_excluded(self):
        document = f'<form id="aspnetForm"><div id="ctl00_ContentPlaceHolder1_WebNewsView_ltContentDiv"><p>{BENIGN}</p><p>{RISK}</p><form><p>가짜 {RISK}</p></form></div></form>'
        body = news_collector.extract_article_body_from_html(document)
        self.assertIn(RISK, body)
        self.assertNotIn("가짜", body)
        self.assertTrue(deterministic_risk.classify({"title": "GA 관련 보도", "body": body})["alert_eligible"])

    def test_news2day_nested_document_stays_in_its_body_scope(self):
        document = f'<div class="view_con_wrap"><html><body><p>{BENIGN}</p><p>{RISK}</p></body></html></div><aside>{RISK * 10}</aside>'
        self.assertEqual(news_collector.extract_article_body_from_html(document).count(RISK), 1)

    def test_rss_fragment_retains_article_paragraphs_without_widgets(self):
        body = news_collector.extract_rss_entry_content({"content": [{"value": f'<p>{BENIGN}</p><div class="related-news">{RISK}</div><script>{RISK}</script>'}]})
        self.assertIn("행동교정", body)
        self.assertNotIn("인카금융", body)

    def test_sentence_binding_does_not_join_unrelated_paragraphs(self):
        body = "인카금융서비스가 신규 상품을 소개했다\n다른 회사의 설계사가 보험사기로 기소됐다"
        self.assertFalse(deterministic_risk.classify({"body": body})["alert_eligible"])

    def test_direct_company_title_stays_alert_without_body(self):
        self.assertTrue(deterministic_risk.classify({"title": "인카금융서비스 설계사 보험사기 제재"})["alert_eligible"])

    def test_generated_db_summary_does_not_supply_alert_evidence(self):
        row = {"title": "펫보험 보장 확대", "link": "https://example.com/article", "summary": RISK,
               "category": "own", "tone": "negative", "own_mentioned": True, "alert_eligible": True,
               "raw": {"body": RISK}}
        with patch.object(negative_watch, "load_recent_negative_articles", return_value=[row]), \
             patch.object(news_collector, "enrich_sensitive_article_bodies"):
            articles = negative_watch.collect_recent_db_negatives(10)
        self.assertEqual(articles[0]["description"], "")
        self.assertNotIn("body", articles[0])
        self.assertFalse(negative_watch.direct_negative_articles(articles))

    def test_verified_body_only_db_alert_keeps_original_evidence(self):
        scope = article_body.body_scope(RISK, "explicit_body", "https://example.com/article")
        row = {"title": "GA 감독 동향", "link": "https://example.com/article", "category": "own", "tone": "negative",
               "own_mentioned": True, "alert_eligible": True, "raw": {"body": RISK, "_body_scope": scope}}
        with patch.object(negative_watch, "load_recent_negative_articles", return_value=[row]), \
             patch.object(news_collector, "enrich_sensitive_article_bodies") as enrich:
            articles = negative_watch.collect_recent_db_negatives(10)
        self.assertEqual(enrich.call_args.args[0], [])
        self.assertTrue(negative_watch.direct_negative_articles(articles))


if __name__ == "__main__":
    unittest.main()
