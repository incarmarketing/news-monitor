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


    def test_consumer_complaint_ranking_summary_explains_negative_meaning(self) -> None:
        article = {
            "title": "[소비자민원평가-손해보험] 빅5 민원 점유율 73% 집중...KB손해보험 2년 연속 1위",
            "description": "KB손해보험 2년 연속 1위 소비자가 만드는 신문.",
            "keyword": "손해보험",
            "keyword_category": "competitor",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("민원 점유율", summary)
        self.assertIn("우호 성과가 아니라", summary)
        self.assertIn("소비자보호 리스크", summary)

    def test_competitor_sports_marketing_article_is_filtered_without_own_mention(self) -> None:
        article = {
            "title": "DB손해보험, 프로농구 구단 후원 스포츠마케팅 확대",
            "description": "DB손해보험이 농구단 홈경기 스폰서십을 강화하고 팬 이벤트를 진행한다.",
            "keyword": "손해보험",
            "keyword_category": "competitor",
        }

        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertFalse(news_collector.is_relevant_article(article))

    def test_own_sports_marketing_article_is_kept(self) -> None:
        article = {
            "title": "인카금융서비스, 스포츠마케팅 캠페인 진행",
            "description": "인카금융서비스가 스포츠 후원 캠페인을 통해 브랜드 접점을 확대한다.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        self.assertFalse(analyzer.is_non_business_noise(article))
        self.assertTrue(news_collector.is_relevant_article(article))

    def test_incomplete_acquisition_summary_falls_back_to_complete_sentence(self) -> None:
        article = {
            "title": "해외로 눈 돌린 손보업계…DB손해보험, 美 보험사 인수 마무리",
            "description": (
                "ㅣDB손해보험 국내 손해보험업계가 성장 정체와 신 회계제도(IFRS17) 안착 이후 "
                "수익성 중심 경쟁에 돌입한 가운데, DB손해보험이 미국 보험사 포테그라 인수를."
            ),
            "keyword": "손해보험",
            "keyword_category": "competitor",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertNotIn("인수를.", summary)
        self.assertIn("해외 사업 확대", summary)
        self.assertTrue(summary.endswith("."))

    def test_competitor_fallback_summary_does_not_use_generic_industry_commentary(self) -> None:
        article = {
            "title": "롯데손해보험, 금융위 조건부 승인 후 경영개선 속도",
            "description": "",
            "keyword": "손해보험",
            "keyword_category": "competitor",
            "_category": "competitor",
            "_tone": "neutral",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("롯데손해보험", summary)
        self.assertNotIn("업계 동향 기사", summary)
        self.assertNotIn("제휴, 채널, 실적", summary)

    def test_own_certified_planner_summary_uses_article_substance(self) -> None:
        article = {
            "title": "인카금융서비스, 우수인증설계사 2262명 배출…GA업계 최다 기록",
            "description": "인카금융서비스가 우수인증설계사 배출 규모를 크게 늘리며 영업 조직의 질적 성장을 이어가고 있다.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
            "_category": "own",
            "_tone": "neutral",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("우수인증설계사", summary)
        self.assertIn("2262명", summary)
        self.assertNotIn("당사 직접 언급 기사", summary)
        self.assertNotIn("평판 영향", summary)


if __name__ == "__main__":
    unittest.main()
