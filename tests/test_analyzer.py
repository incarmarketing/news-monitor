from __future__ import annotations

import unittest

import analyzer


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
        self.assertEqual(analyzer.analyze_tone(article), "caution")

    def test_preventive_security_context_is_not_negative(self) -> None:
        article = {
            "title": "금융보안원 가입 GA 대폭 확대된다…'해킹 피해' 예방",
            "description": (
                "초대형GA 14개사에 한화생명금융서비스, 인카금융서비스 등이 포함됐다. "
                "GA 업계가 금융보안원 가입을 통해 정보보안 미비점을 점검하고 보안 체계를 강화한다."
            ),
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_preventive_security_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")

    def test_settlement_support_with_direct_violation_stays_negative(self) -> None:
        article = {
            "title": "인카금융서비스 정착지원금 관련 불완전판매 조사 착수",
            "description": "금융당국이 내부통제 위반 여부를 검사한다.",
        }

        self.assertFalse(analyzer.is_settlement_support_caution_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "negative")

    def test_quality_summary_uses_complete_non_generic_sentence(self) -> None:
        article = {
            "title": "금융보안원 가입 GA 대폭 확대된다…'해킹 피해' 예방",
            "description": (
                "앞서 초대형 GA 14개사가 금융보안원에 가입했다. "
                "대형 GA까지 가입 대상이 확대되며 보안 취약점 점검이 강화된다."
            ),
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("금융보안원에 가입했다", summary)
        self.assertNotIn("키워드 기준", summary)
        self.assertFalse(summary.endswith("..."))


if __name__ == "__main__":
    unittest.main()
