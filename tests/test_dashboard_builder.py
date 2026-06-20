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

    def test_hormuz_shipping_fee_does_not_reuse_sales_conduct_summary(self) -> None:
        article = {
            "title": "이란, 호르무즈 통항 선박에 향후 보험 수수료 부과 시사",
            "summary": "1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다.",
            "keyword": "보험사",
        }

        self.assertTrue(dashboard_builder.analyzer.is_external_insurance_noise_article(article))
        summary = dashboard_builder.article_summary(article, "industry", "neutral")

        self.assertNotIn("1200%룰", summary)
        self.assertNotIn("설계사 영입", summary)

    def test_incar_golf_scoreboard_is_removed_from_dashboard_rows(self) -> None:
        archives = [
            {
                "date": "2026-06-20",
                "window": {"label": "오전", "slot": "08"},
                "metrics": {},
                "articles": [
                    {
                        "title": "서교림, '인카금융 더헤븐 마스터즈’ 선두 질주",
                        "description": "KLPGA 투어 2라운드에서 서교림이 버디를 잡고 공동 선두에 올랐다.",
                        "source": "뉴스1",
                        "keyword": "인카금융",
                        "_category": "own",
                        "_tone": "positive",
                        "_score": 99,
                    },
                    {
                        "title": "인카금융서비스, 우수인증설계사 2262명 배출",
                        "description": "인카금융서비스가 우수인증설계사 배출 규모를 크게 늘렸다.",
                        "source": "보험매일",
                        "keyword": "인카금융서비스",
                        "_category": "own",
                        "_tone": "positive",
                        "_score": 120,
                    },
                ],
            }
        ]

        rows = dashboard_builder.build_articles(archives)

        titles = [row["title"] for row in rows]
        self.assertNotIn("서교림, '인카금융 더헤븐 마스터즈’ 선두 질주", titles)
        self.assertIn("인카금융서비스, 우수인증설계사 2262명 배출", titles)

    def test_incar_golf_csr_story_keeps_summary(self) -> None:
        article = {
            "title": "격이 다른 확정형 기부… 인카금융 더헤븐 마스터즈 '파3 홀'의 비밀",
            "description": "인카금융서비스가 골프 대회 파3 홀에서 확정형 기부 프로그램을 운영했다.",
            "keyword": "인카금융",
        }

        summary = dashboard_builder.article_summary(article, "own", "positive")

        self.assertIn("확정형 기부", summary)
        self.assertNotIn("경기결과", summary)

    def test_general_finance_workout_article_is_removed_from_dashboard_rows(self) -> None:
        archives = [
            {
                "date": "2026-06-20",
                "window": {"label": "오후", "slot": "13"},
                "metrics": {},
                "articles": [
                    {
                        "title": "한양증권 220억 조기상환 거부한 중앙일보, 하나은행에 워크아웃 신청",
                        "description": "중앙일보가 220억원 규모 어음 최종부도 처리 위기에 놓이면서 채권시장 우려가 커졌다.",
                        "source": "더퍼블릭",
                        "keyword": "금융",
                        "_category": "industry",
                        "_tone": "neutral",
                        "_score": 30,
                    },
                    {
                        "title": "금감원·8대 금융지주, 소비자보호 맞손",
                        "description": "금융감독원은 보험사와 금융권의 금융소비자보호 역량 강화를 위한 협약을 추진했다.",
                        "source": "조세일보",
                        "keyword": "금융감독원",
                        "_category": "regulation",
                        "_tone": "caution",
                        "_score": 80,
                    },
                ],
            }
        ]

        rows = dashboard_builder.build_articles(archives)

        titles = [row["title"] for row in rows]
        self.assertNotIn("한양증권 220억 조기상환 거부한 중앙일보, 하나은행에 워크아웃 신청", titles)
        self.assertIn("금감원·8대 금융지주, 소비자보호 맞손", titles)


if __name__ == "__main__":
    unittest.main()
