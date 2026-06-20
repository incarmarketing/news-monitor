from __future__ import annotations

import unittest

import regulator_collector


class RegulatorCollectorTests(unittest.TestCase):
    def test_keeps_insurance_related_regulator_release(self) -> None:
        self.assertTrue(
            regulator_collector.is_relevant_release(
                "보험 GA 판매수수료 제도 개선",
                "보험과",
            )
        )

    def test_generic_fee_release_without_insurance_context_is_ignored(self) -> None:
        self.assertFalse(
            regulator_collector.is_relevant_release(
                "청년미래적금 취급기관별 금리와 수수료 안내",
                "청년정책과",
            )
        )

    def test_classifies_regulator_release_keyword(self) -> None:
        self.assertEqual(
            regulator_collector.classify_release_keyword(
                "보험 GA 판매수수료 제도 개선",
                "보험감독국",
            ),
            "판매채널/GA",
        )

    def test_solvency_release_is_capital_not_ga(self) -> None:
        self.assertEqual(
            regulator_collector.classify_release_keyword(
                "'26.3월말 기준 보험회사 지급여력비율 현황",
                "계리리스크감독국",
            ),
            "건전성/자본",
        )

    def test_release_article_uses_compact_keyword_description(self) -> None:
        article = regulator_collector.build_release_article(
            source="금융감독원",
            title="체외충격파 의료기관 자율 가이드라인 7월부터 시행",
            link="https://www.fss.or.kr/fss/bbs/B0000188/view.do?nttId=1",
            dept="보험상품분쟁2국",
            date_text="2026-06-18",
        )

        self.assertEqual(article["keyword"], "소비자보호")
        self.assertEqual(article["keyword_query"], "소비자보호")
        self.assertEqual(article["description"], "소비자보호 · 보험상품분쟁2국")
        self.assertNotIn("별도 확인", article["description"])
        self.assertNotIn("공식 보도자료", article["description"])


if __name__ == "__main__":
    unittest.main()
