from __future__ import annotations

import hashlib
import unittest

import supabase_store


class ClassificationFeedbackTests(unittest.TestCase):
    def test_feedback_matches_article_by_normalized_link(self) -> None:
        article = {
            "title": "샘플회사 기사",
            "link": "https://example.com/news/1?utm_source=portal",
            "_category": "own",
            "_tone": "negative",
        }
        rows = [
            {
                "link": "https://example.com/news/1",
                "corrected_category": "당사",
                "corrected_tone": "주의",
                "reason": "manual",
            }
        ]
        index = supabase_store.build_classification_feedback_index(rows)

        applied = supabase_store.apply_classification_feedback(article, index)

        self.assertTrue(applied)
        self.assertEqual(article["_category"], "own")
        self.assertEqual(article["_tone"], "caution")
        self.assertEqual(article["tone"], "caution")

    def test_latest_feedback_wins_for_same_title(self) -> None:
        title = "글로벌금융판매 GA 동향"
        rows = [
            {"title": title, "corrected_category": "GA", "corrected_tone": "중립"},
            {"title": title, "corrected_category": "GA", "corrected_tone": "부정"},
        ]
        index = supabase_store.build_classification_feedback_index(rows)
        article = {"title": title, "link": "", "_category": "other", "_tone": "neutral"}

        supabase_store.apply_classification_feedback(article, index)

        self.assertEqual(article["_category"], "competitor")
        self.assertEqual(article["_tone"], "neutral")

    def test_exclude_feedback_suppresses_score(self) -> None:
        article = {
            "title": "무관한 포토 기사",
            "link": "https://example.com/photo",
            "_category": "own",
            "_tone": "negative",
            "_score": 80,
        }
        rows = [{"link": article["link"], "corrected_category": "제외"}]
        index = supabase_store.build_classification_feedback_index(rows)

        supabase_store.apply_classification_feedback(article, index)

        self.assertEqual(article["_category"], "other")
        self.assertEqual(article["_tone"], "exclude")
        self.assertEqual(article["_score"], 0)
        self.assertEqual(article["status"], "excluded_by_feedback")

    def test_hash_key_uses_article_hash_seed(self) -> None:
        link = "https://example.com/company-risk"
        article_hash = hashlib.sha256(link.encode("utf-8")).hexdigest()
        index = supabase_store.build_classification_feedback_index(
            [{"article_hash": article_hash, "corrected_category": "당사", "corrected_tone": "긍정"}]
        )
        article = {"title": "회사 기사", "link": link, "_category": "own", "_tone": "caution"}

        supabase_store.apply_classification_feedback(article, index)

        self.assertEqual(article["_tone"], "positive")


if __name__ == "__main__":
    unittest.main()
