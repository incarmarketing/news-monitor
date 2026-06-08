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

    def test_quality_summary_removes_dashboard_reason_boilerplate(self) -> None:
        article = {
            "title": "금융보안원 가입 GA 대폭 확대된다…'해킹 피해' 예방",
            "description": (
                "앞서 지난해 11월 초대형GA 14개사에 인카금융서비스가 포함됐다. "
                "당사 직접 언급 기사로 보고서와 리스크 점검 근거에 우선 포함합니다. "
                "직접 부정은 아니지만 시장 평가, 투자 의견, 규제성 신호로 따로 추적합니다."
            ),
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("금융보안원", summary)
        self.assertIn("예방", summary)
        self.assertNotIn("당사 직접 언급", summary)
        self.assertNotIn("리스크 점검 근거", summary)
        self.assertNotIn("시장 평가, 투자 의견", summary)

    def test_analyze_stores_quality_summary_for_persistence(self) -> None:
        articles = [
            {
                "title": "금융보안원 가입 GA 대폭 확대된다…'해킹 피해' 예방",
                "description": (
                    "앞서 초대형GA 14개사에 인카금융서비스가 포함됐다. "
                    "대형 GA까지 금융보안원 가입 대상이 확대된다."
                ),
                "keyword": "인카금융서비스",
                "keyword_category": "own",
            }
        ]

        analyzed, _ = analyzer.analyze(articles, top_n=1)

        self.assertEqual(analyzed[0]["_tone"], "neutral")
        self.assertIn("_summary", analyzed[0])
        self.assertNotIn("당사 직접 언급", analyzed[0]["_summary"])
        self.assertFalse(analyzed[0]["_summary"].endswith("..."))

    def test_unambiguous_competitor_words_ignore_plain_mega_noise(self) -> None:
        self.assertFalse(analyzer.contains_unambiguous_competitor_word("메가 히트 상품 출시"))
        self.assertTrue(analyzer.contains_unambiguous_competitor_word("글로벌금융판매 GA 동향"))
        self.assertTrue(analyzer.contains_unambiguous_competitor_word("메가금융서비스 설계사 동향"))

    def test_non_own_competitor_ranking_is_not_positive(self) -> None:
        article = {
            "title": "지에티코리아, 월 매출 1위 수성",
            "description": "GA 업계 매출 순위에서 경쟁사가 선두권을 유지했다.",
            "keyword": "지에티코리아",
            "keyword_category": "competitor",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "competitor")
        self.assertFalse(analyzer.is_own_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")

    def test_non_own_zero_misconduct_article_is_not_positive(self) -> None:
        article = {
            "title": "보험업계, 불완전판매 0건 우수설계사 대거 선정",
            "description": "생명보험협회와 손해보험협회가 우수인증설계사를 선정했다.",
            "keyword": "보험설계사",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertNotEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_zero_misconduct_positive_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")

    def test_own_favorable_coverage_can_be_positive(self) -> None:
        article = {
            "title": "인카금융서비스, 우수인증설계사 2262명 배출…GA업계 최다 기록",
            "description": "영업조직의 전문성과 완전판매 역량을 부각한 보도다.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertTrue(analyzer.is_own_positive_focus_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "positive")

    def test_own_name_in_competitor_list_does_not_make_positive(self) -> None:
        article = {
            "title": "KDB생명, GA 생보실적 1위 수성",
            "description": "인카금융서비스는 일부 지표에서 2위를 유지했다.",
            "keyword": "KDB생명",
            "keyword_category": "competitor",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertEqual(article["_category"], "own")
        self.assertFalse(analyzer.is_own_positive_focus_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")


if __name__ == "__main__":
    unittest.main()
