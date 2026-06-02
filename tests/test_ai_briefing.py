from __future__ import annotations

import unittest

import ai_briefing


class BriefingEvidenceTests(unittest.TestCase):
    def test_unsupported_ai_issue_is_replaced_with_real_article(self) -> None:
        clustered = [
            {
                "_report_id": 1,
                "_category": "competitor",
                "_tone": "neutral",
                "_score": 12,
                "_summary": "한화생명과 한화손보의 신용등급 상향 보도입니다.",
                "title": "한화생명·한화손보, S&P 신용등급 A+로 상향",
                "description": "S&P가 한화생명과 한화손보의 신용등급을 상향 조정했다.",
                "source": "테스트신문",
                "keyword": "생명보험",
                "link": "https://example.com/a",
            }
        ]
        sections = {
            "conclusion": "KDB생명 매각 흥행이 관찰됩니다.",
            "issues": [
                {
                    "title": "KDB생명 매각 흥행",
                    "detail": "보험사 매각 흥행 여부 확인",
                    "refs": [],
                }
            ],
            "keywords": [],
        }
        metrics = {"own_negative": 0, "risk_level": "LOW"}

        result = ai_briefing.validate_report_sections(sections, clustered, metrics)

        rendered = f"{result['conclusion']} {result['issues'][0]['title']} {result['issues'][0]['detail']}"
        self.assertNotIn("KDB생명", rendered)
        self.assertIn("한화생명", rendered)
        self.assertEqual(result["issues"][0]["refs"], [1])

    def test_evidence_selection_uses_sanitized_issue_ref(self) -> None:
        clustered = [
            {
                "_report_id": 4,
                "_category": "own",
                "_tone": "neutral",
                "_score": 18,
                "_summary": "당사 직접 언급 기사입니다.",
                "title": "인카금융서비스, 브랜드평판 1위",
                "description": "인카금융서비스가 독립 보험대리점 브랜드평판에서 1위를 기록했다.",
                "source": "테스트신문",
                "keyword": "인카금융서비스",
                "link": "https://example.com/own",
            }
        ]
        sections = {
            "conclusion": "인카금융서비스 브랜드평판 보도 관찰",
            "issues": [{"title": "브랜드평판 1위", "detail": "당사 직접 언급", "refs": [4]}],
            "keywords": [],
        }

        result = ai_briefing.validate_report_sections(sections, clustered, {"own_negative": 0, "risk_level": "LOW"})
        evidence = ai_briefing.select_evidence_articles(clustered, result, limit=3)

        self.assertEqual(evidence[0]["title"], "인카금융서비스, 브랜드평판 1위")

    def test_issue_with_unsupported_company_name_is_rewritten_from_ref_article(self) -> None:
        clustered = [
            {
                "_report_id": 5,
                "_category": "competitor",
                "_tone": "caution",
                "_score": 14,
                "_summary": "롯데손보 매각 가능성과 금융지주 관심을 다룬 기사입니다.",
                "title": "롯데손보 매각 속도 불붙나…손보 부재 금융지주에 주목",
                "description": "롯데손보 매각 절차와 금융지주사의 관심 가능성을 다뤘다.",
                "source": "아시아투데이",
                "keyword": "손해보험",
                "link": "https://example.com/lotte",
            },
            {
                "_report_id": 9,
                "_category": "competitor",
                "_tone": "neutral",
                "_score": 9,
                "_summary": "KDB생명 매각 예비입찰 관련 기사입니다.",
                "title": "매각 7수 KDB생명…한투 vs 태광 맞대결 성사되나",
                "description": "KDB생명 매각 절차와 인수 후보를 다뤘다.",
                "source": "이데일리",
                "keyword": "생명보험",
                "link": "https://example.com/kdb",
            }
        ]
        sections = {
            "conclusion": "보험사 매각 동향이 관찰됩니다.",
            "issues": [
                {
                    "title": "롯데손보, KDB생명 매각",
                    "detail": "금융지주 중심 보험업계 M&A 가속화",
                    "refs": [5],
                }
            ],
            "interpretation_html": "<p>롯데손보와 KDB생명 매각 동향이 주요하게 다뤄졌습니다.</p>",
            "keywords": ["롯데손보", "KDB생명", "M&A"],
        }

        result = ai_briefing.validate_report_sections(sections, clustered, {"own_negative": 0, "risk_level": "LOW", "by_category": {"own": 0, "competitor": 1, "industry": 0}})

        rendered = f"{result['issues'][0]['title']} {result['issues'][0]['detail']} {result['interpretation_html']} {' '.join(result['keywords'])}"
        self.assertIn("롯데손보", rendered)
        self.assertNotIn("KDB생명", rendered)
        self.assertEqual(result["issues"][0]["refs"], [5])


if __name__ == "__main__":
    unittest.main()
