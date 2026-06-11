from __future__ import annotations

import unittest
from unittest.mock import patch

import analyzer
import config
import gemini_helper


class GeminiModelRoutingTests(unittest.TestCase):
    def test_article_context_uses_flash_first(self) -> None:
        with patch.object(config, "GEMINI_CONTEXT_MODEL", "gemini-2.5-flash"), patch.object(
            config, "GEMINI_FLASH_MODEL", "gemini-2.5-flash"
        ), patch.object(config, "GEMINI_FLASH_LITE_MODEL", "gemini-2.5-flash-lite"), patch.object(
            config, "GEMINI_PRO_MODEL", "gemini-2.5-pro"
        ):
            candidates = gemini_helper.model_candidates_for_purpose("article_context_classification")

        self.assertEqual(candidates[0], "gemini-2.5-flash")
        self.assertNotIn("gemini-2.5-pro", candidates)

    def test_report_generation_uses_pro_first(self) -> None:
        with patch.object(config, "GEMINI_REPORT_MODEL", "gemini-2.5-pro"), patch.object(
            config, "GEMINI_PRO_MODEL", "gemini-2.5-pro"
        ):
            candidates = gemini_helper.model_candidates_for_purpose("daily_report")

        self.assertEqual(candidates[0], "gemini-2.5-pro")

    def test_pro_review_only_for_sensitive_context(self) -> None:
        neutral_context = {
            "category": "industry",
            "tone": "neutral",
            "own_mentioned": False,
            "negative_target": "none",
            "confidence": 0.9,
        }
        own_caution_context = {
            "category": "own",
            "tone": "caution",
            "own_mentioned": True,
            "negative_target": "none",
            "confidence": 0.9,
        }

        with patch.dict("os.environ", {"AI_CONTEXT_PRO_REVIEW": "true"}):
            self.assertFalse(analyzer.should_pro_review_ai_context({}, neutral_context))
            self.assertTrue(analyzer.should_pro_review_ai_context({}, own_caution_context))


if __name__ == "__main__":
    unittest.main()
