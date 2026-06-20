from __future__ import annotations

import unittest
from unittest.mock import patch

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

    def test_financial_security_membership_with_past_industry_incident_is_neutral(self) -> None:
        article = {
            "title": "금융보안원 가입 GA 대폭 확대된다…'해킹 피해' 예방",
            "description": (
                "앞서 지난해 11월 초대형GA 14개사에 한화생명금융서비스, 인카금융서비스, "
                "지에이코리아 등이 금융보안원에 가입했다. "
                "이는 지난해부터 이어진 개인정보 유출 사고를 사전에 방지하기 위한 조치다. "
                "과거 IT업체 해킹 공격으로 일부 GA 개인정보가 유출된 바 있다."
            ),
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        context = analyzer.apply_context_safety_guardrails(
            article,
            {
                "category": "own",
                "tone": "negative",
                "own_mentioned": True,
                "negative_target": "own",
                "evidence": "개인정보 유출 사고를 사전에 방지하기 위한 조치다.",
            },
        )

        self.assertTrue(analyzer.is_preventive_security_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")
        self.assertEqual(context["tone"], "neutral")
        self.assertEqual(context["negative_target"], "none")

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

    def test_quality_summary_drops_own_reference_without_original_evidence(self) -> None:
        article = {
            "title": "금감원, 찾아가는 기업공시 설명회 개최…개정 상법·공시제도 집중 안내",
            "description": (
                "금융감독원이 기업 공시 담당자를 대상으로 개정 상법과 공시제도 변경 사항을 "
                "안내하는 설명회를 개최한다."
            ),
            "summary": "인카금융서비스의 자사주, 배당 등 공시성 항목이 주식시장 주요공시 목록에 포함됐습니다.",
            "keyword": "공시",
            "keyword_category": "regulation",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertFalse(analyzer.is_own_article(article))
        self.assertNotIn("인카금융서비스", summary)
        self.assertNotIn("당사", summary)

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

    def test_analyze_reuses_cached_classification_without_ai_call(self) -> None:
        articles = [
            {
                "title": "인카금융서비스, 우수인증설계사 2262명 배출",
                "description": "인카금융서비스가 GA업계 최다 규모의 우수인증설계사를 배출했다.",
                "keyword": "인카금융서비스",
                "keyword_category": "own",
                "_category": "own",
                "_tone": "positive",
                "_summary": "인카금융서비스가 우수인증설계사 배출 규모를 통해 영업조직 전문성을 부각했습니다.",
                "_analysis_cache_applied": True,
                "_ai_context": {
                    "category": "own",
                    "tone": "positive",
                    "own_mentioned": True,
                    "negative_target": "none",
                    "evidence": "인카금융서비스가 GA업계 최다 규모의 우수인증설계사를 배출했다.",
                },
            }
        ]

        with patch.object(analyzer, "apply_ai_context_classification", side_effect=AssertionError("AI should not run")):
            analyzed, metrics = analyzer.analyze(articles, top_n=1)

        self.assertEqual(analyzed[0]["_tone"], "positive")
        self.assertEqual(metrics["analysis_cache_hits"], 1)
        self.assertEqual(metrics["ai_context_reviews"], 0)

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

    def test_competitor_brand_reputation_first_is_not_own_positive(self) -> None:
        article = {
            "title": "한화생명금융서비스, 6월 GA 브랜드평판 1위 탈환…인카금융과 초박빙",
            "description": "독립 보험대리점 브랜드평판에서 한화생명금융서비스가 1위, 인카금융서비스가 2위로 뒤이었다.",
            "keyword": "한화생명금융서비스",
            "keyword_category": "competitor",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertTrue(analyzer.is_competitor_brand_reputation_against_own(article))
        self.assertFalse(analyzer.is_own_positive_focus_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "caution")
        analyzer.apply_context_safety_guardrails(article)
        self.assertEqual(article["_category"], "competitor")
        self.assertEqual(article["_tone"], "caution")
        self.assertNotIn("당사 성과", analyzer.build_quality_summary(article))

    def test_relief_support_for_fraud_victims_is_not_negative(self) -> None:
        article = {
            "title": "생명보험사회공헌위, 전세사기 피해 청년 위해 1억원 지원",
            "description": "금융취약계층 보호와 사회공헌 활동을 다룬 ESG·소비자보호 보도입니다.",
            "keyword": "생명보험",
            "keyword_category": "industry",
        }

        self.assertTrue(analyzer.is_relief_support_article(article))
        self.assertEqual(analyzer.analyze_tone(article), "neutral")


    def test_quality_summary_handles_stock_vi_article(self) -> None:
        article = {
            "title": "인카금융서비스, +7.46% VI 발동 - 조선비즈 - Chosunbiz",
            "description": "인카금융서비스 주가가 장중 급등하며 변동성완화장치가 발동됐다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("변동성완화장치", summary)
        self.assertIn("주가", summary)
        self.assertNotIn("이슈가 핵심입니다", summary)

    def test_quality_summary_separates_sales_conduct_from_settlement_ranking(self) -> None:
        article = {
            "title": '"설계사 쟁탈전에 소비자 피해 불똥"…\'1200%룰\' 앞두고 보험업계 긴장',
            "description": "1200%룰 시행을 앞두고 GA 설계사 영입 경쟁과 판매수수료 부담, 소비자 피해 우려가 함께 제기됐다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("1200%룰", summary)
        self.assertIn("소비자 피해", summary)
        self.assertNotIn("지급 규모와 순위", summary)

    def test_quality_summary_does_not_inject_sales_conduct_into_product_article(self) -> None:
        article = {
            "title": "삼성생명, 암 치료부터 가족 보장까지 ‘암치료플러스종신보험’ 출시",
            "description": (
                "삼성생명이 ‘삼성 암치료플러스종신보험’을 출시했다. "
                "이번 상품은 종신보험의 사망보장에 암 치료 보장을 결합한 것이 특징이다."
            ),
            "summary": "1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다.",
            "keyword": "보험",
            "keyword_category": "industry",
        }

        summary = analyzer.build_quality_summary(article)

        self.assertIn("암치료플러스종신보험", summary)
        self.assertNotIn("1200%룰", summary)
        self.assertNotIn("판매수수료", summary)

    def test_hormuz_shipping_insurance_fee_is_excluded_noise(self) -> None:
        article = {
            "title": "이란, 호르무즈 통항 선박에 향후 보험 수수료 부과 시사",
            "description": "호르무즈 해협을 지나는 선박에 보험증권이나 통항 수수료를 요구할 가능성이 거론됐다.",
            "summary": "1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다.",
            "keyword": "보험사",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)
        context = analyzer.apply_context_safety_guardrails(article)
        summary = analyzer.build_quality_summary(article)

        self.assertEqual(context["category"], "other")
        self.assertEqual(context["tone"], "exclude")
        self.assertTrue(analyzer.is_external_insurance_noise_article(article))
        self.assertNotIn("1200%룰", summary)
        self.assertNotIn("판매수수료 운영", summary)

    def test_shipping_insurance_fee_without_financial_context_is_noise(self) -> None:
        article = {
            "title": "해상 통항 보험료 인상에 화물 운임 부담 커져",
            "description": "중동 항로를 지나는 선박과 화물 운송사들이 보험료와 운임 부담을 우려하고 있다.",
            "keyword": "보험사",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_external_insurance_noise_article(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "exclude")

    def test_incar_golf_scoreboard_is_not_company_positive(self) -> None:
        article = {
            "title": "서교림, '인카금융 더헤븐 마스터즈’ 선두 질주",
            "description": "KLPGA 투어 2라운드에서 서교림이 버디를 잡고 공동 선두에 올랐다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)
        context = analyzer.apply_context_safety_guardrails(article)

        self.assertTrue(analyzer.is_own_sponsored_sports_noise_article(article))
        self.assertEqual(context["category"], "other")
        self.assertEqual(context["tone"], "neutral")
        self.assertFalse(context["clipping_recommended"])

    def test_google_related_headlines_do_not_rescue_golf_scoreboard(self) -> None:
        article = {
            "title": "[ KLPGA] 서교림·김민별, 인카금융 더헤븐 마스터즈 1R 공동 선두 - 폴리뉴스 Polinews",
            "description": (
                "[ KLPGA] 서교림·김민별, 인카금융 더헤븐 마스터즈 1R 공동 선두 "
                "인카금융, KLPGA '더헤븐 마스터스' 후원 네이트 "
                "러프에 탄식, 어색함도 잠시 웃음꽃… 프로암 이모저모"
            ),
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_own_sponsored_sports_noise_article(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "neutral")

    def test_player_milestone_with_own_host_mention_is_sports_noise(self) -> None:
        article = {
            "title": "안송이, KLPGA 최초 400경기 금자탑… “500경기 새 목표”",
            "description": (
                "메인 스폰서인 KB금융그룹을 비롯해 대회 주최사 인카금융서비스, "
                "더헤븐리조트 관계자도 자리했다. 참석자들은 기념 보드와 꽃다발을 전달했다."
            ),
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_own_sponsored_sports_noise_article(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "neutral")

    def test_incar_golf_csr_story_can_stay_company_positive(self) -> None:
        article = {
            "title": "격이 다른 확정형 기부… 인카금융 더헤븐 마스터즈 '파3 홀'의 비밀",
            "description": "인카금융서비스가 골프 대회 파3 홀에서 확정형 기부 프로그램을 운영하며 사회공헌 메시지를 전했다.",
            "keyword": "인카금융",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertFalse(analyzer.is_own_sponsored_sports_noise_article(article))
        self.assertEqual(article["_category"], "own")
        self.assertEqual(article["_tone"], "positive")

    def test_stock_watchlist_with_own_name_only_is_noise(self) -> None:
        article = {
            "title": "[52주 최저가] 파인텍 -7.9%↓... 218개 장중 신저가",
            "description": "종목 목록에 인카금융서비스 9,340원 등 다수 상장사가 포함됐다.",
            "keyword": "인카금융서비스",
            "keyword_category": "own",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_stock_listing_noise(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "neutral")

    def test_ambiguous_competitor_keywords_need_ga_context(self) -> None:
        self.assertEqual(
            analyzer.categorize({"title": "메가 히트 신제품 출시", "description": "유통가가 대형 할인 행사를 예고했다.", "keyword_category": "competitor"}),
            "other",
        )
        self.assertEqual(
            analyzer.categorize({"title": "글로벌 금융시장 변동성 확대", "description": "환율과 원유 가격 변동이 이어졌다.", "keyword_category": "competitor"}),
            "other",
        )

    def test_general_baseball_article_is_non_business_noise(self) -> None:
        article = {
            "title": "[프로야구] 중간 순위(19일)",
            "description": "키움 감독은 마무리 투수 운영과 더블 스토퍼 구상을 설명했다.",
            "keyword": "보험",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "neutral")

    def test_general_finance_workout_article_is_non_business_noise(self) -> None:
        article = {
            "title": "한양증권 220억 조기상환 거부한 중앙일보, 하나은행에 워크아웃 신청",
            "description": "중앙일보가 220억원 규모 어음 최종부도 처리 위기에 놓이면서 채권시장 우려가 커졌다.",
            "keyword": "금융",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_general_finance_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "neutral")

    def test_regulator_consumer_protection_article_is_not_general_finance_noise(self) -> None:
        article = {
            "title": "금감원·8대 금융지주, 소비자보호 맞손",
            "description": "금융감독원은 보험사와 금융권의 금융소비자보호 역량 강화를 위한 협약을 추진했다.",
            "keyword": "금융감독원",
            "keyword_category": "regulation",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertFalse(analyzer.is_general_finance_noise_article(article))
        self.assertFalse(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "regulation")

    def test_government_committee_article_with_only_finance_committee_mention_is_noise(self) -> None:
        article = {
            "title": "노태악 4년간 받은 선관위 수당만 1.8억, 셀프증액 논란",
            "description": "공정거래위원회나 금융위원회 등 다른 정부 위원회에서도 운영하는 제도라며 문제가 없다는 입장이다.",
            "keyword": "금융위원회",
            "keyword_category": "regulation",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_admin_agency_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")

    def test_public_agency_evaluation_without_insurance_market_context_is_noise(self) -> None:
        article = {
            "title": "금융 공공기관 경영평가 예보 우수, 주금공 양호·신보 보통",
            "description": "금융위원회 산하 공공기관 중 예금보험공사와 한국주택금융공사의 경영평가 결과가 공개됐다.",
            "keyword": "금융위원회",
            "keyword_category": "regulation",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_admin_agency_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")

    def test_public_health_insurance_reward_article_is_noise_without_private_insurance_context(self) -> None:
        article = {
            "title": "로또 대신 신고, 정부는 건강보험 부당청구 포상금 확대",
            "description": "복지부는 국민건강보험공단과 함께 가짜진료 신고 포상금과 환수 금액 제도를 안내했다.",
            "keyword": "보험",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_public_health_insurance_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")

    def test_non_insurance_investment_misconduct_article_is_noise(self) -> None:
        article = {
            "title": "회사채 투자자 보호를 위한 사채 제도 개선",
            "description": "전문투자자 대상 회사채와 사채관리회사 제도 개선 과정에서 불완전판매 논란도 거론됐다.",
            "keyword": "불완전판매",
            "keyword_category": "regulation",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_non_insurance_investment_misconduct_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")

    def test_mega_box_article_from_ambiguous_competitor_keyword_is_noise(self) -> None:
        article = {
            "title": "메가박스중앙 회생 절차 신청에 영화계 긴장",
            "description": "메가박스중앙의 장단기 차입금과 영화관 운영 부담이 커졌다는 내용이다.",
            "keyword": "메가",
            "keyword_category": "competitor",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_ambiguous_competitor_homonym_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")

    def test_mega_financial_service_article_is_not_homonym_noise(self) -> None:
        article = {
            "title": "메가금융서비스 GA 조직 확대",
            "description": "메가금융서비스가 보험대리점 설계사 조직을 확대했다.",
            "keyword": "메가",
            "keyword_category": "competitor",
        }

        article["_category"] = analyzer.categorize(article)

        self.assertFalse(analyzer.is_ambiguous_competitor_homonym_noise_article(article))
        self.assertEqual(article["_category"], "competitor")

    def test_soccer_referee_occupation_insurance_agent_is_noise(self) -> None:
        article = {
            "title": "이강인 가격 논란, 주심 판정에 축구 팬 분통",
            "description": "보험설계사로 알려진 테헤라 주심은 깐깐한 판정으로 유명했고 옐로카드를 꺼냈다.",
            "keyword": "보험설계사",
            "keyword_category": "industry",
        }

        article["_category"] = analyzer.categorize(article)
        article["_tone"] = analyzer.analyze_tone(article)

        self.assertTrue(analyzer.is_sports_occupation_insurance_agent_noise_article(article))
        self.assertTrue(analyzer.is_non_business_noise(article))
        self.assertEqual(article["_category"], "other")


class AnalyzerAiContextGuardrailTests(unittest.TestCase):
    def test_ai_context_non_own_positive_is_downgraded_to_neutral(self) -> None:
        article = {
            "title": "경쟁 GA 월 매출 1위 수성",
            "description": "지에이코리아가 GA 시장에서 매출 1위를 유지했다는 보도입니다.",
            "keyword_category": "competitor",
        }
        article["_category"] = "competitor"
        article["_tone"] = "positive"

        context = analyzer.apply_context_safety_guardrails(
            article,
            {
                "category": "competitor",
                "tone": "positive",
                "own_mentioned": False,
                "negative_target": "none",
                "evidence": "지에이코리아가 매출 1위를 유지했다.",
            },
        )

        self.assertEqual(context["category"], "competitor")
        self.assertEqual(context["tone"], "neutral")

    def test_ai_context_industry_negative_is_caution_not_company_negative(self) -> None:
        article = {
            "title": "보험사기 적발 증가, 업계 내부통제 강화 필요",
            "description": "금융당국은 보험업계 전반의 보험사기 관리 강화를 주문했다.",
            "keyword_category": "industry",
        }
        article["_category"] = "industry"
        article["_tone"] = "negative"

        context = analyzer.apply_context_safety_guardrails(
            article,
            {
                "category": "industry",
                "tone": "negative",
                "own_mentioned": False,
                "negative_target": "industry",
                "evidence": "보험업계 전반의 관리 강화가 필요하다.",
            },
        )

        self.assertEqual(context["tone"], "caution")
        self.assertFalse(analyzer.is_direct_own_negative_article(article))

    def test_ai_context_company_negative_requires_evidence(self) -> None:
        article = {
            "title": "인카금융서비스 관련 의혹 제기",
            "description": "기사 본문에는 구체적 근거가 확인되지 않았다.",
            "keyword_category": "own",
        }
        article["_category"] = "own"
        article["_tone"] = "negative"

        context = analyzer.apply_context_safety_guardrails(
            article,
            {
                "category": "own",
                "tone": "negative",
                "own_mentioned": True,
                "negative_target": "own",
                "evidence": "",
            },
        )

        self.assertEqual(context["tone"], "caution")
        self.assertFalse(analyzer.is_direct_own_negative_article(article))

    def test_ai_context_direct_company_negative_is_kept(self) -> None:
        article = {
            "title": "인카금융서비스 불완전판매 의혹 조사",
            "description": "금융당국이 인카금융서비스의 불완전판매 의혹을 조사한다는 보도입니다.",
            "keyword_category": "own",
        }
        article["_category"] = "own"
        article["_tone"] = "negative"

        context = analyzer.apply_context_safety_guardrails(
            article,
            {
                "category": "own",
                "tone": "negative",
                "own_mentioned": True,
                "negative_target": "own",
                "evidence": "금융당국이 인카금융서비스의 불완전판매 의혹을 조사한다.",
            },
        )

        self.assertEqual(context["tone"], "negative")
        self.assertTrue(analyzer.is_direct_own_negative_article(article))


if __name__ == "__main__":
    unittest.main()
