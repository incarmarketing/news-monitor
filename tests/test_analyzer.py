from __future__ import annotations

import unittest

import analyzer


class AnalyzerToneTests(unittest.TestCase):
    def test_own_investment_opinion_downgrade_is_negative(self) -> None:
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
        self.assertEqual(analyzer.analyze_tone(article), "negative")

    def test_market_high_word_does_not_override_own_downgrade(self) -> None:
        article = {
            "title": "사상 최고 코스피 속 인카금융서비스 목표가 하향",
            "description": "증권가가 밸류에이션 부담으로 보수적인 시각을 제시했다.",
        }

        self.assertEqual(analyzer.analyze_tone(article), "negative")


if __name__ == "__main__":
    unittest.main()
