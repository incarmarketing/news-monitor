from __future__ import annotations

import unittest

import dashboard_builder


class DashboardSummaryTests(unittest.TestCase):
    def test_dashboard_summary_does_not_append_classification_boilerplate(self) -> None:
        article = {
            "title": "샘플회사, 우수인증설계사 2262명 배출",
            "description": "샘플회사가 우수인증설계사 배출 규모를 크게 늘리며 영업 조직의 질적 성장을 이어가고 있다.",
            "keyword": "샘플회사",
            "keyword_category": "own",
        }

        summary = dashboard_builder.article_summary(article, "own", "neutral")

        self.assertIn("우수인증설계사", summary)
        self.assertNotIn("당사 직접 언급 기사", summary)
        self.assertNotIn("평판 영향", summary)


if __name__ == "__main__":
    unittest.main()
