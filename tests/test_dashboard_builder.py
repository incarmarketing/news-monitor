from __future__ import annotations

import unittest

import dashboard_builder


class DashboardSummaryTests(unittest.TestCase):
    def test_dashboard_summary_does_not_append_classification_boilerplate(self) -> None:
        article = {
            "title": "인카금융서비스, 우수인증설계사 2262명 배출",
            "description": "인카금융서비스가 우수인증설계사 배출 규모를 크게 늘리며 영업 조직의 질적 성장을 이어가고 있다.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        summary = dashboard_builder.article_summary(article, "own", "neutral")

        self.assertIn("우수인증설계사", summary)
        self.assertNotIn("당사 직접 언급 기사", summary)
        self.assertNotIn("평판 영향", summary)


    def test_stock_vi_summary_is_not_headline_echo(self) -> None:
        article = {
            "title": "인카금융서비스, +7.46% VI 발동 - 조선비즈 - Chosunbiz",
            "description": "인카금융서비스 주가가 장중 급등하며 변동성완화장치가 발동됐다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        summary = dashboard_builder.article_summary(article, "own", "neutral")

        self.assertIn("변동성완화장치", summary)
        self.assertIn("주가", summary)
        self.assertNotIn("이슈가 핵심입니다", summary)
        self.assertNotIn("조선비즈 이슈", summary)

    def test_sales_conduct_summary_does_not_use_settlement_ranking_template(self) -> None:
        article = {
            "title": '"설계사 쟁탈전에 소비자 피해 불똥"…\'1200%룰\' 앞두고 보험업계 긴장',
            "description": "1200%룰 시행을 앞두고 GA 설계사 영입 경쟁과 판매수수료 부담, 소비자 피해 우려가 함께 제기됐다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        summary = dashboard_builder.article_summary(article, "own", "caution")

        self.assertIn("1200%룰", summary)
        self.assertIn("소비자 피해", summary)
        self.assertNotIn("지급 규모와 순위", summary)

    def test_association_misconduct_summary_focuses_on_sales_conduct(self) -> None:
        article = {
            "title": "“소비자와 약속” 내건 생보협회…GA·종신보험 불완전판매 해소가 관건",
            "description": "생명보험협회가 소비자보호를 내걸고 GA와 종신보험 불완전판매 해소를 주요 과제로 제시했다.",
            "keyword": "생명보험",
            "keyword_category": "industry",
        }

        summary = dashboard_builder.article_summary(article, "industry", "caution")

        self.assertIn("불완전판매", summary)
        self.assertIn("판매채널", summary)
        self.assertNotIn("정착지원금 지급 규모", summary)


if __name__ == "__main__":
    unittest.main()
