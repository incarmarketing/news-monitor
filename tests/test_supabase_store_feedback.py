from __future__ import annotations

import hashlib
import json
import unittest
from unittest.mock import patch

import analyzer
import requests
import supabase_store


class ClassificationFeedbackTests(unittest.TestCase):
    def test_recent_negative_lookup_uses_final_alert_contract(self) -> None:
        class Response:
            @staticmethod
            def json() -> list[dict]:
                return []

        with (
            patch.object(supabase_store, "is_enabled", return_value=True),
            patch.object(supabase_store, "request", return_value=Response()) as request,
        ):
            supabase_store.load_recent_negative_articles(30)

        query = request.call_args.args[1]
        self.assertIn("&alert_eligible=eq.true", query)
        self.assertIn("classification_ruleset_version", query)
        self.assertIn("document_type", query)
        self.assertIn("own_role", query)
        self.assertIn("risk_event_type", query)

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

    def test_normalize_article_records_stable_identity_and_source_time(self) -> None:
        row = supabase_store.normalize_article(
            {
                "title": "[단독] 인카금융서비스 제재 기사 - example.com",
                "link": "https://news.google.com/rss/articles/current-wrapper",
                "pub_date": "2026-08-12T09:50:00+00:00",
                "_original_pub_date": "2026-04-20T04:00:00+00:00",
                "_category": "own",
                "_tone": "negative",
            },
            {"date": "2026-08-12", "window": {}, "metrics": {}},
        )

        self.assertEqual(row["alert_identity"], "인카금융서비스제재기사")
        self.assertEqual(row["source_published_at"], "2026-04-20T04:00:00+00:00")

    def test_normalize_article_leaves_discovery_time_to_database_for_regular_runs(self) -> None:
        row = supabase_store.normalize_article(
            {
                "title": "sample article",
                "link": "https://example.com/sample",
                "_category": "industry",
                "_tone": "neutral",
            },
            {"date": "2026-08-12", "window": {}, "metrics": {}},
        )

        self.assertNotIn("discovered_at", row)

    def test_metadata_only_source_does_not_persist_publisher_body(self) -> None:
        article = {
            "title": "뉴스포트 보험 기사",
            "link": "https://www.newsport.co.kr/news/articleView.html?idxno=100",
            "description": "RSS 제공 설명문",
            "body": "RSS가 제공한 기사 원문",
            "content": "RSS가 제공한 기사 원문",
            "author": "뉴스포트 기자",
            "source": "뉴스포트",
            "storage_policy": "metadata_only",
            "_summary": "내부 분류용 요약",
            "_category": "industry",
            "_tone": "neutral",
        }

        row = supabase_store.normalize_article(
            article,
            {"date": "2026-08-25", "window": {}, "metrics": {}},
        )

        self.assertEqual(row["summary"], "내부 분류용 요약")
        self.assertEqual(row["raw"]["author"], "뉴스포트 기자")
        self.assertEqual(row["raw"]["storage_policy"], "metadata_only")
        self.assertNotIn("description", row["raw"])
        self.assertNotIn("body", row["raw"])
        self.assertNotIn("content", row["raw"])

    def test_missing_discovered_at_retry_preserves_classification_contract(self) -> None:
        error = requests.HTTPError("column discovered_at does not exist")
        row = {
            "article_hash": "sample-hash",
            "title": "인카금융서비스 우수인증설계사 배출",
            "discovered_at": "2026-08-12T09:00:00+09:00",
            "classification_provider": "rules:test",
            "classification_ruleset_version": "ruleset-v2",
            "classification_decision_path": {"own_is_primary": True},
            "own_role": "primary",
        }

        with patch.object(supabase_store, "request", side_effect=[error, object()]) as request:
            supabase_store.save_news_article_rows([row])

        retry_payload = json.loads(request.call_args_list[1].kwargs["data"])
        self.assertNotIn("discovered_at", retry_payload[0])
        self.assertEqual(retry_payload[0]["classification_provider"], "rules:test")
        self.assertEqual(retry_payload[0]["classification_ruleset_version"], "ruleset-v2")
        self.assertEqual(retry_payload[0]["own_role"], "primary")

    def test_schema_error_does_not_silently_drop_classification_contract(self) -> None:
        error = requests.HTTPError("column classification_ruleset_version does not exist")

        with patch.object(supabase_store, "request", side_effect=error):
            with self.assertRaises(requests.HTTPError):
                supabase_store.save_news_article_rows([{"article_hash": "sample-hash"}])

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

    def test_current_cache_with_unsupported_own_scope_is_rejected(self) -> None:
        link = "https://example.com/competitor-certified-agent"
        article = {
            "title": "글로벌금융판매, 2026 GA 우수인증설계사 배출",
            "description": "글로벌금융판매의 인증 성과를 다룬 기사입니다.",
            "keyword": "인카금융서비스",
            "link": link,
        }
        article_hash = hashlib.sha256(link.encode("utf-8")).hexdigest()
        cache = {
            article_hash: {
                "article_hash": article_hash,
                "summary": "기존 기사 요약입니다.",
                "category": "own",
                "tone": "positive",
                "own_mentioned": True,
                "negative_target": "own",
                "classification_ruleset_version": analyzer.classification_ruleset_version(),
            }
        }

        applied = supabase_store.apply_article_analysis_cache(article, cache)

        self.assertFalse(applied)
        self.assertTrue(article["_analysis_cache_source_mismatch"])
        self.assertNotIn("_category", article)
        self.assertEqual(article["_summary"], "기존 기사 요약입니다.")

    def test_persistence_context_ignores_cached_own_without_source_evidence(self) -> None:
        article = {
            "title": "교보생명, 꿈나무체육대회 마무리",
            "description": "교보생명의 스포츠 사회공헌 행사입니다.",
            "link": "https://example.com/kyobo-event",
            "keyword": "인카금융서비스",
            "_category": "sponsorship",
            "_tone": "positive",
            "_ai_context": {
                "category": "sponsorship",
                "tone": "positive",
                "own_mentioned": True,
                "negative_target": "own",
            },
        }
        archive = {
            "date": "2026-08-12",
            "window": {"slot": "watch", "label": "test"},
            "metrics": {"risk_level": "LOW"},
        }

        row = supabase_store.normalize_article(article, archive)

        self.assertFalse(row["own_mentioned"])
        self.assertEqual(row["negative_target"], "none")
        self.assertFalse(row["alert_eligible"])


if __name__ == "__main__":
    unittest.main()
