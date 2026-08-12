from __future__ import annotations

import unittest

import apply_context_rule_fixes
import classification_normalizer


class ContextRuleFixTests(unittest.TestCase):
    def test_collection_keyword_does_not_make_competitor_certified_agent_article_own(self) -> None:
        article = {
            "title": "특집-보험GA협회 선정 2026 우수인증설계사 인터뷰",
            "summary": "서영은 지에이코리아 원앙지사 스타지점 지점장 인터뷰입니다.",
            "source": "보험신보",
            "keyword": "인카금융서비스",
        }

        self.assertFalse(apply_context_rule_fixes.is_own_certified_agent_performance(article))
        self.assertFalse(classification_normalizer.is_own_certified_agent_performance(article))

    def test_collection_keyword_does_not_make_competitor_brand_leader_own(self) -> None:
        article = {
            "title": "한화생명금융서비스, GA 브랜드평판 1위",
            "summary": "경쟁 GA가 브랜드평판 선두를 기록했습니다.",
            "source": "보험저널",
            "keyword": "인카금융서비스",
        }

        self.assertFalse(apply_context_rule_fixes.is_own_brand_reputation_leader(article))
        self.assertFalse(classification_normalizer.is_own_brand_reputation_leader(article))

    def test_collection_keyword_does_not_turn_non_insurance_article_into_insurance_context(self) -> None:
        article = {
            "title": "채권 사기 논란, 투자자 법적 대응",
            "summary": "가상자산 투자자를 둘러싼 분쟁입니다.",
            "source": "경제매체",
            "keyword": "인카금융서비스",
        }

        self.assertTrue(apply_context_rule_fixes.is_noise_article(article))
        self.assertTrue(classification_normalizer.is_non_insurance_financial_legal_noise(article))


if __name__ == "__main__":
    unittest.main()
