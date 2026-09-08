import os
import unittest
from unittest.mock import patch

import ai_fallback
import ai_briefing
import period_report
import summary_text


class NoLlamaFallbackTests(unittest.TestCase):
    def test_retired_issue_providers_use_no_network(self):
        article = {"title": "인카금융서비스 독립 보험대리점 브랜드평판 1위"}
        for provider in ("groq", "llama", "rules"):
            with self.subTest(provider=provider), patch.dict(os.environ, {
                "AI_ISSUE_SUMMARY_PROVIDER": provider, "GROQ_API_KEY": "unused",
            }), patch("ai_fallback.generate_gemini_text", side_effect=AssertionError("network")):
                text, actual = ai_fallback.summarize_issue_with_provider([article])
                self.assertTrue(text)
                self.assertEqual(actual, "rules")

    def test_gemini_failure_preserves_a_readable_summary(self):
        with patch.dict(os.environ, {"AI_ISSUE_SUMMARY_PROVIDER": "gemini"}), patch(
            "ai_fallback.generate_gemini_text", return_value=("", "gemini_failed")
        ):
            text, provider = ai_fallback.summarize_issue_with_provider([
                {"title": "보험대리점 내부통제 점검 결과가 발표됐다"},
            ])
        self.assertTrue(text)
        self.assertEqual(provider, "rules")

    def test_reports_use_existing_template_without_another_api(self):
        metrics = {}
        self.assertEqual(ai_briefing.rules_report([], metrics, "article cards", reason="gemini_failed"), "article cards")
        self.assertEqual(metrics["ai_model_used"], "rules_fallback")
        self.assertEqual(period_report.rules_period_report({}, [], "weekly", "period cards", reason="gemini_failed"), "period cards")

    def test_shared_prompt_helpers_keep_source_text(self):
        prompt = summary_text.build_issue_prompt([{"title": "보험계약자 보호 제도", "description": "보험금 지급 절차를 개선한다."}])
        self.assertIn("보험계약자 보호 제도", prompt)
        self.assertIn("보험금 지급 절차를 개선한다", prompt)


if __name__ == "__main__":
    unittest.main()
