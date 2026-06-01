from __future__ import annotations

import unittest

import analyzer
import news_collector


class AnalyzerToneTests(unittest.TestCase):
    def test_own_investment_opinion_downgrade_is_caution(self) -> None:
        article = {
            "title": "코스피 사상 최고 와중에 너무 올랐다...증권가가 매수 접은 종목들",
            "description": (
                "코스닥 시장에서는 주성엔지니어링, 인카금융서비스, 네오위즈 등에서 "
                "투자의견이 낮아졌다. 기존 매수에서 중립으로 낮추는 사례가 이어졌다."
            ),
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_investment_downgrade_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "caution")

    def test_market_high_word_does_not_override_own_downgrade(self) -> None:
        article = {
            "title": "사상 최고 코스피 속 인카금융서비스 목표가 하향",
            "description": "증권가가 밸류에이션 부담으로 보수적인 시각을 제시했다.",
        }

        self.assertEqual(analyzer.analyze_tone(article), "caution")

    def test_own_stock_drop_symbol_does_not_become_positive(self) -> None:
        article = {
            "title": "[52주]최고가 25개, 최저가 556개.. 코스피 8600 돌파",
            "description": "4% 3,175 ★★★★★ 194 인카금융서비스 9,330 ▼2.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_stock_decline_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "caution")

    def test_settlement_support_ranking_is_caution_not_negative(self) -> None:
        article = {
            "title": "[공시돋보기] '1200% 룰' 7월 도입 앞두고 GA들 정착지원금 '펑펑'",
            "description": (
                "한화생명금융서비스가 178억원으로 지급 규모 1위를 기록했다. "
                "이어 에이플러스에셋, 스카이블루에셋, 인카금융서비스(65억원), "
                "밸류마크 순이다. 설계사 잦은 이직이 줄어들 전망이다."
            ),
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_settlement_support_caution_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")

    def test_settlement_support_with_direct_violation_stays_negative(self) -> None:
        article = {
            "title": "인카금융서비스 정착지원금 관련 불완전판매 조사 착수",
            "description": "금융당국이 내부통제 위반 여부를 검사한다.",
        }

        self.assertFalse(analyzer.is_settlement_support_caution_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "negative")

    def test_generic_fee_platform_article_is_not_regulation_news(self) -> None:
        article = {
            "title": "박용선 포항시장 후보 시민 대통합과 100년 경제 준비할 것",
            "description": "소상공인 지원을 위해 지역제한 입찰제도 개선과 수수료 제로 플랫폼 구축을 공약했다.",
            "keyword": "수수료",
            "keyword_category": "regulation",
        }

        self.assertFalse(news_collector.is_relevant_article(article))
        self.assertEqual(analyzer.categorize(article), "other")

    def test_insurance_fee_regulation_article_is_kept(self) -> None:
        article = {
            "title": "보험 GA 판매수수료 규제 강화 논의",
            "description": "금융당국이 보험대리점과 설계사 판매수수료 제도 개편을 검토한다.",
            "keyword": "수수료",
            "keyword_category": "regulation",
        }

        self.assertTrue(news_collector.is_relevant_article(article))
        self.assertEqual(analyzer.categorize(article), "regulation")


if __name__ == "__main__":
    unittest.main()
