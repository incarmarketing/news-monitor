import copy
import hashlib
import unittest
from unittest.mock import Mock, patch

import analyzer
import supabase_store
from tools import classification_maintenance as maintenance
from tools import validate_classification_gold as gold
from tools.audit_classification_drift import article_from_row


def noise_row(row_id=1):
    return {
        "id": row_id, "article_hash": hashlib.sha256(str(row_id).encode()).hexdigest(), "updated_at": "2026-09-08T00:00:00+00:00",
        "title": "은행 대출 금융사고 대책", "link": f"https://example.com/{row_id}",
        "category": "industry", "tone": "neutral", "own_mentioned": False,
        "alert_eligible": False, "negative_target": "none",
        "raw": {"description": "은행 여신 대출 금융사고로 투자자 대책을 논의했다."},
    }


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        analyzer.configure_context_rules([])

    def test_three_passes_are_idempotent_and_source_preserving(self):
        row = noise_row()
        for iteration in range(3):
            plan = maintenance.build_plan([row], {})
            self.assertEqual(plan["candidate_count"], 1 if iteration == 0 else 0)
            if plan["repairs"]:
                patch_value = plan["repairs"][0]["patch"]
                self.assertEqual(patch_value["raw"]["description"], row["raw"]["description"])
                self.assertEqual(patch_value["raw"]["_ai_context"]["category"], "other")
                self.assertFalse(patch_value["alert_eligible"])
                row.update(patch_value)

    def test_manual_feedback_is_never_overwritten(self):
        row = noise_row()
        feedback = supabase_store.build_classification_feedback_index([
            {"article_hash": row["article_hash"], "corrected_category": "industry", "corrected_tone": "caution"},
        ])
        plan = maintenance.build_plan([row], feedback)
        self.assertEqual(plan["candidate_count"], 0)
        self.assertEqual(plan["protected_count"], 1)

    def test_risk_and_own_states_are_protected(self):
        for overrides in (
            {"tone": "negative"}, {"own_mentioned": True}, {"alert_eligible": True},
            {"category": "own"}, {"negative_target": "own"},
            {"raw": {"_ai_context": {"tone": "negative"}}},
            {"title": "인카금융서비스 은행 대출 금융사고 대책"},
        ):
            with self.subTest(overrides=overrides):
                plan = maintenance.build_plan([{**noise_row(), **overrides}], {})
                self.assertEqual(plan["candidate_count"], 0)
                self.assertEqual(plan["protected_count"], 1)

    def test_material_insurance_subject_is_not_excluded(self):
        row = noise_row()
        row["raw"]["description"] += " 방카슈랑스 보험계약자 보호와 보험금 지급에 대한 내용이다."
        self.assertEqual(maintenance.build_plan([row], {})["candidate_count"], 0)

    def test_bulk_gate_fails_closed(self):
        for total, count, passed in ((0, 0, True), (100, 6, True), (1000, 26, True), (100, 1, False)):
            with self.subTest(total=total, count=count):
                self.assertTrue(maintenance.guard_plan({"row_count": total, "candidate_count": count}, {"passed": passed}))
        self.assertFalse(maintenance.guard_plan({"row_count": 500, "candidate_count": 25}, {"passed": True}))

    def test_scan_cap_does_not_masquerade_as_complete(self):
        with patch.object(supabase_store, "request", return_value=Mock(json=lambda: [{"id": 1}, {"id": 2}])):
            with self.assertRaisesRegex(RuntimeError, "scan cap"):
                maintenance.fetch_records("news_articles", cap=1)

    def test_bad_page_or_unstable_cursor_is_an_error(self):
        for data in ({"error": "timeout"}, [{"id": 2}, {"id": 1}], [{"title": "missing id"}]):
            with self.subTest(data=data), patch.object(supabase_store, "request", return_value=Mock(json=lambda: data)):
                with self.assertRaises(RuntimeError):
                    maintenance.fetch_records("news_articles")

    def test_missing_rules_or_gold_blocks_maintenance(self):
        with patch.object(maintenance, "fetch_records", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "no active"):
                maintenance.config_snapshot()
        with patch.object(maintenance.gold, "load_cases", return_value=([], [])):
            with self.assertRaisesRegex(RuntimeError, "missing"):
                maintenance.validate_gold()

    def test_lost_response_retries_the_same_run_id(self):
        reply = {"status": "applied", "applied_count": 1}
        with patch.object(supabase_store, "request", side_effect=[TimeoutError(), Mock(json=lambda: reply)]) as request, patch.object(maintenance.time, "sleep"):
            result = maintenance.apply_plan("test-run", {}, [], [], [])
        self.assertEqual(result, reply)
        self.assertEqual(request.call_args_list[0].kwargs, request.call_args_list[1].kwargs)

    def test_existing_objects_are_not_mutated(self):
        row = noise_row()
        original = copy.deepcopy(row)
        maintenance.build_plan([row], {})
        self.assertEqual(row, original)

    def test_high_alert_score_alone_cannot_pass_quality_gate(self):
        result = {"case_count": 150, "category_accuracy": .81, "tone_accuracy": .55,
                  "exact_accuracy": .42, "alert_precision": 1, "alert_recall": 1,
                  "alert_confusion": {"true_positive": 1, "true_negative": 149}}
        gate = gold.quality_gate(result)
        self.assertFalse(gate["passed"])
        self.assertIn("tone_accuracy", gate["failures"])
        self.assertIn("insufficient_positive_cases", gate["failures"])

    def test_quality_gate_needs_finite_metrics_and_enough_cases(self):
        result = {"case_count": 40, "category_accuracy": .98, "tone_accuracy": .98,
                  "exact_accuracy": .96, "alert_precision": 1, "alert_recall": 1,
                  "alert_confusion": {"true_positive": 8, "true_negative": 32}}
        self.assertTrue(gold.quality_gate(result)["passed"])
        for invalid in (None, True, float("nan"), float("inf"), 1.01, .94):
            with self.subTest(value=invalid):
                self.assertFalse(gold.quality_gate({**result, "category_accuracy": invalid})["passed"])
        self.assertFalse(gold.quality_gate({**result, "case_count": 1})["passed"])

    def test_source_only_replay_preserves_collection_context_not_generated_summary(self):
        article = article_from_row({**noise_row(), "summary": "인카금융서비스 부정 의혹",
                                   "raw": {"keyword_category": "industry", "description": "원문 설명", "_category": "own"}})
        self.assertEqual(article["keyword_category"], "industry")
        self.assertNotIn("인카금융서비스", analyzer.original_article_text(article))

    def test_missing_body_cannot_disprove_existing_own_evidence(self):
        row = noise_row()
        status = maintenance.source_evidence_status(row, article_from_row(row),
                 {"own_mentioned": True}, {"own_mentioned": False})
        self.assertEqual(status, "original_required")

    def test_insurer_subject_not_broad_legacy_ga_rule(self):
        analyzer.configure_context_rules([{"rule_key": "legacy_insurer", "enabled": True,
            "category": "competitor", "tone": "neutral", "priority": 26,
            "trigger_terms": ["한화생명"], "required_terms": ["출시"]}])
        for title in ("한화생명, 건강보험 신상품 출시", "카카오페이손보, 운전자보험 출시", "푸본현대생명 고객 서비스 확대"):
            with self.subTest(title=title):
                self.assertEqual(analyzer.categorize({"title": title}), "industry")

    def test_ga_regulation_own_and_sponsorship_precedence_preserved(self):
        for title, expected in (
            ("한화생명금융서비스, 설계사 교육 강화", "competitor"),
            ("한화생명 GA시책 확대", "competitor"),
            ("금감원, 삼성생명 불완전판매 제재", "regulation"),
            ("금감원, GA 신입 설계사 지원금 광고 관리 강화", "regulation"),
            ("보험사 주주환원 너도나도 50%", "industry"),
            ("인카금융서비스, 독립 보험대리점 브랜드평판 1위", "own"),
        ):
            with self.subTest(title=title):
                self.assertEqual(analyzer.categorize({"title": title}), expected)


if __name__ == "__main__":
    unittest.main()
