import unittest
from unittest.mock import patch

import article_body
import deterministic_risk
import news_collector
import negative_watch


BENIGN = "보험사가 반려동물 치료비와 행동교정 보장을 확대했습니다. " * 8
RISK = "금융감독원은 인카금융서비스 소속 설계사의 보험사기 연루를 확인하고 업무정지 제재를 통보했다."


class ArticleScopeTests(unittest.TestCase):
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
