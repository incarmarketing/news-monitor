from __future__ import annotations

import unittest
from unittest.mock import patch

import analyzer
import article_body
import news_collector
import supabase_store


TITLE = "인카금융서비스, 국감서 '청년 설계사 환수' 질타…규제비용·주가 부담..."
BODY = ("인카금융서비스가 국정감사에서 청년 설계사 정착지원금 환수 논란으로 질타를 받았다.\n"
        "금융위원회는 인카금융서비스에 기관경고와 과태료를 의결했다.\n"
        "회사는 인카금융 슈퍼볼링과 KLPGA 인카금융 더헤븐 마스터즈를 주최해 스포츠마케팅도 확대했다.")


class SourceReviewRiskPriorityTests(unittest.TestCase):
    def article(self):
        return {"title": TITLE, "source": "녹색경제신문", "link": "https://www.greened.kr/news/articleView.html?idxno=351992",
                "description": "과도한 수수료 환수 관행이 집중 도마에 올랐다.", "keyword": "인카금융"}

    def sourced(self):
        return article_body.replace_source_fields(self.article(), title=TITLE, description="",
                    body=BODY, method="explicit_body", source_url=self.article()["link"])

    def test_audit_clawback_headline_requires_original_review(self):
        self.assertTrue(news_collector.should_enrich_article_body(self.article()))

    def test_new_review_signals_do_not_mean_negative_by_themselves(self):
        for title in ("인카금융서비스, 국감 정책 설명회 참석", "인카금융서비스, 정착지원금 안내",
                      "인카금융서비스 수수료 환수 조건 공개", "인카금융서비스 주가 부담 지속"):
            self.assertFalse(analyzer.is_own_direct_negative_article({"title": title}))
        self.assertFalse(news_collector.should_enrich_article_body({"title": "인카금융서비스 주가 하락"}))

    def test_other_industry_does_not_expand_body_fetches(self):
        self.assertFalse(news_collector.should_enrich_article_body({"title": "전자업계 국감 질타"}))

    def test_original_body_fetches_under_existing_budget(self):
        row = self.article()
        page = f'<div id="article-view-content-div">{BODY}</div>'
        with patch.object(news_collector, "fetch_article_html", return_value=(page, row["link"])) as fetch:
            news_collector.enrich_sensitive_article_bodies([row])
        self.assertEqual(fetch.call_count, 1)
        self.assertTrue(article_body.verified_body(row))
        self.assertTrue(analyzer.is_own_direct_negative_article(row))

    def test_sponsorship_paragraph_cannot_hide_actual_risk(self):
        result = analyzer.apply_context_safety_guardrails(self.sourced())
        self.assertEqual((result["category"], result["tone"], result["negative_target"]), ("own", "negative", "own"))
        self.assertTrue(result["alert_eligible"])
        self.assertTrue(result["classification_decision_path"]["negative_shape"])
        self.assertIn("환수 논란", result["evidence"])

    def test_market_context_cannot_hide_actual_risk(self):
        row = self.sourced()
        result = analyzer.apply_context_safety_guardrails(row, {"category": "own", "tone": "caution", "negative_target": "none"})
        self.assertEqual(result["tone"], "negative")

    def test_plain_sponsorship_remains_nonnegative(self):
        row = {"title": "인카금융서비스, KLPGA 더헤븐 마스터즈 공동 주최", "description": "브랜드 홍보를 확대했다."}
        result = analyzer.apply_context_safety_guardrails(row)
        self.assertEqual(result["category"], "sponsorship")
        self.assertFalse(result["alert_eligible"])

    def test_operator_suppression_is_preserved(self):
        row = self.sourced()
        row["_feedback_applied"] = True
        result = analyzer.apply_classification_contract(row, {"category": "own", "tone": "neutral", "negative_target": "none"})
        self.assertEqual(result["tone"], "neutral")
        self.assertFalse(result["alert_eligible"])

    def test_sidebar_risk_does_not_trigger_an_alert(self):
        row = self.article()
        row["title"] = "인카금융서비스, 정착지원금 운영 설명"
        row["description"] = "지원금 운영 방식을 소개했다."
        page = ('<div id="article-view-content-div">인카금융서비스는 설계사 정착지원금 운영 내용을 소개했다. '
                '정착지원금과 환수 조건을 설명한 안내자료를 공개했다.</div>'
                '<aside>인카금융서비스가 환수 논란으로 질타를 받았다.</aside>')
        with patch.object(news_collector, "fetch_article_html", return_value=(page, row["link"])):
            news_collector.enrich_sensitive_article_bodies([row])
        self.assertFalse(analyzer.is_own_direct_negative_article(row))

    def test_repaired_facts_survive_three_storage_cache_roundtrips(self):
        row = self.sourced()
        cache = {supabase_store.article_hash(row): {"title": row["title"], "link": row["link"], "category": "own",
                 "tone": "caution", "classification_ruleset_version": analyzer.classification_ruleset_version(), "raw": {}}}
        self.assertFalse(supabase_store.apply_article_analysis_cache(row, cache))
        self.assertTrue(row["_analysis_cache_source_mismatch"])
        for _ in range(3):
            analyzer.apply_context_safety_guardrails(row)
            stored = supabase_store.normalize_article(row, {"date": "2026-10-14", "window": {}, "metrics": {}})
            self.assertEqual((stored["tone"], stored["own_mentioned"], stored["alert_eligible"]), ("negative", True, True))
            cache = {stored["article_hash"]: stored}
            row = {"title": TITLE, "link": stored["link"], "source": stored["source"]}
            supabase_store.apply_article_analysis_cache(row, cache)


if __name__ == "__main__":
    unittest.main()
