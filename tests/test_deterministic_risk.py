from __future__ import annotations

import unittest

import analyzer
import deterministic_risk


TRUE_ALERT_CASES = [
    {
        "title": "고의사고로 보험금 편취…대형 GA 설계사 무더기 제재",
        "description": "금융감독원은 인카금융서비스 전직 설계사 3명의 등록을 취소하고 다른 3명의 업무를 정지했다.",
    },
    {
        "title": "[인카금융스캔들] 보험 꺾기 넘어 불법 사채놀이까지",
        "description": "인카금융서비스의 약탈 영업 민낯을 다룬 보도다.",
    },
    {
        "title": "외형 성장 뒤에 가려진 그늘, 과제 직면한 인카금융서비스",
        "description": "인카금융서비스의 내부통제와 영업 관리 과제가 부각됐다.",
    },
    {
        "title": "인카금융서비스 내부통제 부실 논란",
        "description": "인카금융서비스의 관리 부실로 소비자 피해가 발생했다는 지적이다.",
    },
    {
        "title": "인카금융서비스 전직 설계사 보험사기 적발",
        "description": "해당 설계사는 고의 교통사고로 보험금을 편취했다.",
    },
    {
        "title": "인카금융서비스 상대 손해배상 소송 제기",
        "description": "소비자들이 불완전판매 피해를 이유로 소송을 제기했다.",
    },
    {
        "title": "인카금융서비스 모집질서 위반 제재",
        "description": "금융당국은 허위 계약과 가공 계약을 확인해 과태료 처분을 내렸다.",
    },
    {
        "title": "인카금융서비스 고객정보 무단 유출",
        "description": "인카금융서비스 고객 DB 유출로 소비자 피해가 확인됐다.",
    },
]


FALSE_ALERT_CASES = [
    {
        "title": "동양생명 6월 GA 생보실적 M/S…영진에셋 1위",
        "description": "월간 GA 채널 실적표에 인카금융서비스의 점유율과 순위도 함께 실렸다.",
    },
    {
        "title": "푸본현대생명 6월 GA 생보실적 M/S…글로벌금융 1위",
        "description": "인카금융서비스는 시장점유율 11.4%를 기록했다.",
    },
    {
        "title": "메트라이프생명 6월 GA 생보실적 M/S…상위 3사 30.4%",
        "description": "인카금융서비스를 포함한 GA 판매실적을 비교한 통계 기사다.",
    },
    {
        "title": "IM라이프 6월 GA 생보실적 M/S…에이플러스 선두",
        "description": "인카금융서비스 순위가 비교표에 포함됐다.",
    },
    {
        "title": "KDB생명 6월 GA 생보실적 M/S…상위권 판도 요동",
        "description": "인카금융서비스 등 GA의 월간 판매실적을 다뤘다.",
    },
    {
        "title": "DB생명 6월 GA 생보실적 M/S…스카이블루에셋 36.4%",
        "description": "인카금융서비스 수치도 시장점유율 표에 표시됐다.",
    },
    {
        "title": "인카금융서비스, 7월 GA 브랜드평판 1위",
        "description": "인카금융서비스가 브랜드평판 1위를 차지했다.",
    },
    {
        "title": "독립 보험대리점 브랜드평판 1위 인카금융서비스, 2위 한화생명금융서비스",
        "description": "브랜드 빅데이터 분석 결과다.",
    },
    {
        "title": "특집-2026 우수인증설계사 인터뷰 [김숙희 인카금융서비스 지점장]",
        "description": "우수인증설계사의 영업 철학과 완전판매 노력을 소개한다.",
    },
    {
        "title": "인카금융서비스, 우수인증설계사 2262명 배출",
        "description": "GA업계 최다 규모로 영업조직 전문성을 입증했다.",
    },
    {
        "title": "상위권 GA, 상반기 마지막 달 호실적 마감",
        "description": "지에이코리아와 인카금융서비스가 양호한 실적으로 6월 매출 반등에 성공했다.",
    },
    {
        "title": "인카금융서비스, 금융보안원 회원사 가입",
        "description": "보안 역량과 사고 예방 체계를 강화하기 위한 가입이다.",
    },
    {
        "title": "인카금융서비스 주가 52주 최저가",
        "description": "주가가 전일보다 하락했으며 거래량이 늘었다.",
    },
    {
        "title": "금감원, GA 판매수수료 점검",
        "description": "인카금융서비스 등 대형 GA를 대상으로 1200%룰 안착 상황을 점검한다.",
    },
    {
        "title": "금감원, 한화생명·인카 등 GA 전격 점검",
        "description": "정착지원금 지급 관행과 판매수수료 제도 이행 여부를 조사한다.",
    },
    {
        "title": "금융교육 전문가 신임 대표 선임",
        "description": "신임 대표는 과거 인카금융서비스 본부장을 거쳐 교육업계에서 근무했다.",
    },
    {
        "title": "전세사기 피해자 지원 확대",
        "description": "인카금융서비스는 피해 지원을 위한 성금을 기부했다.",
    },
    {
        "title": "경쟁 GA 설계사 보험사기 제재",
        "description": "보험사기 비교표에는 한화생명금융서비스, 인카금융서비스, 지에이코리아가 포함됐다.",
    },
    {
        "title": "인카금융서비스 해킹 피해는 없었다",
        "description": "점검 결과 고객정보 유출과 소비자 피해가 없다고 회사가 밝혔다.",
    },
    {
        "title": "인카금융서비스 관련 제재 보도는 사실무근",
        "description": "회사는 위반 혐의가 없고 제재 대상도 아니라고 해명했다.",
    },
    {
        "title": "한화생명금융서비스 설계사 등록 취소",
        "description": "업계 비교자료에 인카금융서비스의 설계사 수도 함께 기재됐다.",
    },
    {
        "title": "보험사기 예방 공동 캠페인",
        "description": "인카금융서비스는 소비자 피해 방지와 예방 교육을 강화했다.",
    },
    {
        "title": "금감원, GA 내부통제 개선 간담회",
        "description": "인카금융서비스는 간담회에 참석해 대응 체계 강화 방안을 공유했다.",
    },
    {
        "title": "보험사기 적발 통계 발표",
        "description": "검색 키워드는 인카금융서비스지만 기사 원문에는 회사명이 없다.",
        "keyword": "인카금융서비스",
    },
]


class DeterministicRiskPrecisionTests(unittest.TestCase):
    def tearDown(self) -> None:
        deterministic_risk.configure_rules([])
        analyzer.configure_context_rules([])

    def test_gold_set_alert_precision_is_at_least_99_percent(self) -> None:
        labelled = [(article, True) for article in TRUE_ALERT_CASES]
        labelled.extend((article, False) for article in FALSE_ALERT_CASES)
        true_positive = 0
        false_positive = 0
        false_negative = 0
        for article, expected in labelled:
            predicted = deterministic_risk.classify(article)["alert_eligible"]
            if predicted and expected:
                true_positive += 1
            elif predicted and not expected:
                false_positive += 1
            elif not predicted and expected:
                false_negative += 1

        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        self.assertGreaterEqual(precision, 0.99)
        self.assertGreaterEqual(recall, 0.90)

    def test_generated_summary_cannot_create_an_alert(self) -> None:
        article = {
            "title": "GA 시장 동향",
            "description": "보험대리점 시장의 월간 통계를 분석했다.",
            "keyword": "인카금융서비스",
            "_summary": "인카금융서비스가 사기와 제재를 받았다.",
            "summary": "인카금융서비스 내부통제 부실",
        }
        result = deterministic_risk.classify(article)
        self.assertFalse(result["own_mentioned"])
        self.assertFalse(result["alert_eligible"])

    def test_ambiguous_probe_is_review_not_alert(self) -> None:
        article = {
            "title": "금감원, 인카금융서비스 판매수수료 점검",
            "description": "금감원은 제도 안착 여부를 확인하기 위한 정기 점검이라고 밝혔다.",
        }
        result = deterministic_risk.classify(article)
        self.assertFalse(result["alert_eligible"])
        self.assertTrue(result["review_required"])
        self.assertEqual(result["suggested_tone"], "caution")

    def test_analyzer_alert_contract_uses_deterministic_source_evidence(self) -> None:
        article = dict(TRUE_ALERT_CASES[0])
        article["_category"] = "other"
        article["_tone"] = "neutral"
        context = analyzer.apply_context_safety_guardrails(article)
        self.assertEqual(context["provider"], "rules:deterministic-risk-v1")
        self.assertEqual(context["tone"], "negative")
        self.assertTrue(context["alert_eligible"])

    def test_db_guardrail_can_suppress_an_alert_candidate(self) -> None:
        deterministic_risk.configure_rules(
            [
                {
                    "rule_key": "suppress_sample",
                    "rule_type": "guardrail",
                    "decision": "suppress_negative_alert",
                    "trigger_terms": ["정정 보도"],
                    "required_terms": ["인카금융서비스"],
                    "exclude_terms": [],
                    "priority": 1,
                }
            ]
        )
        article = {
            "title": "인카금융서비스 사기 의혹 정정 보도",
            "description": "기존 의혹은 사실무근으로 확인됐다.",
        }
        result = deterministic_risk.classify(article)
        self.assertFalse(result["alert_eligible"])
        self.assertIn("suppress_sample", result["matched_rule_keys"])

    def test_db_alert_rule_is_not_misread_as_a_suppression(self) -> None:
        deterministic_risk.configure_rules(
            [
                {
                    "rule_key": "alert_sample",
                    "rule_type": "guardrail",
                    "decision": "alert_direct_own_risk",
                    "rule_group": "risk_event:governance",
                    "trigger_terms": ["영업관리 공백"],
                    "required_terms": ["인카금융서비스"],
                    "exclude_terms": [],
                    "priority": 1,
                }
            ]
        )
        article = {
            "title": "인카금융서비스 영업관리 공백 논란",
            "description": "인카금융서비스의 영업관리 공백으로 소비자 피해 우려가 제기됐다.",
        }
        result = deterministic_risk.classify(article)
        self.assertTrue(result["alert_eligible"])
        self.assertIn("alert_sample", result["matched_rule_keys"])

    def test_direct_risk_sentence_wins_over_positive_keyword(self) -> None:
        article = {
            "title": "브랜드평판 1위 인카금융서비스 내부통제 부실 논란",
            "description": "인카금융서비스의 내부통제 부실로 소비자 피해가 확인됐다.",
        }
        result = deterministic_risk.classify(article)
        self.assertTrue(result["alert_eligible"])
        self.assertEqual(result["suggested_tone"], "negative")


if __name__ == "__main__":
    unittest.main()
