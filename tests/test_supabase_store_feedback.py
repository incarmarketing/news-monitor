from __future__ import annotations

import hashlib
import unittest

import analyzer
import supabase_store


class ClassificationFeedbackTests(unittest.TestCase):
    def test_normalize_article_records_discovery_time(self) -> None:
        row = supabase_store.normalize_article(
            {
                "title": "sample article",
                "link": "https://example.com/sample",
                "_category": "own",
                "_tone": "neutral",
                "_discovered_at": "2026-07-20T09:20:00+09:00",
            },
            {"date": "2026-07-20", "window": {}, "metrics": {}},
        )

        self.assertEqual(row["discovered_at"], "2026-07-20T09:20:00+09:00")

    def test_feedback_matches_article_by_normalized_link(self) -> None:
        article = {
            "title": "인카금융서비스 기사",
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

    def test_article_analysis_cache_applies_stored_context(self) -> None:
        link = "https://example.com/positive"
        article = {"title": "인카금융서비스 우수인증설계사 배출", "link": link}
        article_hash = hashlib.sha256(link.encode("utf-8")).hexdigest()
        cache = {
            article_hash: {
                "article_hash": article_hash,
                "summary": "인카금융서비스가 우수인증설계사 배출 성과를 통해 영업조직 전문성을 부각했습니다.",
                "category": "own",
                "tone": "positive",
                "own_mentioned": True,
                "negative_target": "none",
                "classification_evidence": "인카금융서비스 우수인증설계사 배출",
                "classification_provider": "gemini-2.5-flash",
                "classification_ruleset_version": analyzer.classification_ruleset_version(),
            }
        }

        applied = supabase_store.apply_article_analysis_cache(article, cache)

        self.assertTrue(applied)
        self.assertTrue(article["_analysis_cache_applied"])
        self.assertEqual(article["_category"], "own")
        self.assertEqual(article["_tone"], "positive")
        self.assertIn("우수인증설계사", article["_summary"])

    def test_stale_article_analysis_cache_reuses_summary_but_not_classification(self) -> None:
        link = "https://example.com/stale-negative"
        article = {"title": "인카금융서비스 정기 GA 판매실적", "link": link}
        article_hash = hashlib.sha256(link.encode("utf-8")).hexdigest()
        cache = {
            article_hash: {
                "article_hash": article_hash,
                "summary": "기존에 생성한 기사 요약입니다.",
                "category": "own",
                "tone": "negative",
                "classification_provider": "news_articles_cache",
                "classification_ruleset_version": "classification-contract-v1:legacy",
            }
        }

        applied = supabase_store.apply_article_analysis_cache(article, cache)

        self.assertFalse(applied)
        self.assertTrue(article["_analysis_cache_stale"])
        self.assertNotIn("_analysis_cache_applied", article)
        self.assertNotIn("_category", article)
        self.assertEqual(article["_summary"], "기존에 생성한 기사 요약입니다.")


if __name__ == "__main__":
    unittest.main()
