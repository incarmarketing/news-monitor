import copy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import Mock, patch

import analyzer
from tools import classification_maintenance as maintenance
from tools import classification_policy as policy
from tools import classification_source_review as review
from tools import validate_classification_gold as gold


class ClassificationPolicyTests(unittest.TestCase):
    def setUp(self):
        analyzer.configure_context_rules([])

    def test_scoped_corpus_has_explicit_balanced_safety_labels(self):
        gate = policy.validate(maintenance.build_plan)
        self.assertTrue(gate["passed"])
        self.assertGreaterEqual(gate["common"]["alert_confusion"]["true_positive"], 5)
        self.assertEqual(gate["common"]["own_mention_accuracy"], 1)
        self.assertTrue(gate["delivery"]["passed"])
        for family in gate["families"].values():
            self.assertTrue(family["passed"])
            self.assertEqual(family["exact_accuracy"], 1)

    def test_unlabelled_alerts_are_not_inferred_from_own_negative(self):
        case = {"case": "old", "article": {}, "expected_category": "own", "expected_tone": "negative"}
        with patch.object(gold, "classify", return_value={"category": "own", "tone": "negative", "alert_eligible": False}):
            result = gold.evaluate([case], 10)
        self.assertEqual(result["alert_unlabelled_count"], 1)
        self.assertIsNone(result["alert_precision"])
        self.assertEqual(result["alert_confusion"]["false_negative"], 0)
        self.assertIn("unreviewed_alert_labels", gold.quality_gate(result)["failures"])

    def test_explicit_no_alert_and_visibility_labels_are_evaluated(self):
        case = {"case": "reviewed", "article": {}, "expected_category": "other", "expected_tone": "neutral",
                "expected_visible": False, "expected_own_mentioned": False, "expected_alert_eligible": False}
        with patch.object(gold, "classify", return_value={"category": "industry", "tone": "neutral", "own_mentioned": True, "alert_eligible": True}):
            result = gold.evaluate([case], 10)
        self.assertEqual(result["alert_confusion"]["false_positive"], 1)
        self.assertEqual(result["visibility_accuracy"], 0)
        self.assertEqual(result["own_mention_accuracy"], 0)

    def test_subject_repair_is_stable_and_preserves_source_and_tone(self):
        row = policy.case_row(next(c for c in policy.load_cases() if c["case"] == "subject-0"), 0)
        original = copy.deepcopy(row)
        for iteration in range(3):
            plan = maintenance.build_plan([row], {})
            self.assertEqual(plan["candidate_count"], int(iteration == 0))
            if plan["repairs"]:
                row.update(plan["repairs"][0]["patch"])
        self.assertEqual(row["tone"], original["tone"])
        self.assertEqual(row["raw"]["description"], original["raw"]["description"])
        self.assertFalse(row["alert_eligible"])

    def test_a_failed_family_is_not_admitted_by_another_family(self):
        row = policy.case_row(next(c for c in policy.load_cases() if c["case"] == "subject-0"), 0)
        gate = {"common": {"passed": True}, "families": {"source_role": {"passed": True}, "insurance_subject": {"passed": False}}}
        plan = maintenance.build_plan([row], {}, gate)
        self.assertEqual(plan["candidate_count"], 0)
        self.assertEqual(plan["review_count"], 1)

    def test_common_or_delivery_failure_blocks_all_repairs(self):
        for key in ("common", "delivery"):
            gate = {"version": "scoped-v2", "passed": True, "common": {"passed": True}, "delivery": {"passed": True}}
            gate[key]["passed"] = False
            self.assertEqual(maintenance.guard_plan({"row_count": 100, "candidate_count": 1}, gate), "safety_contract_failed")

    def test_source_parse_does_not_treat_photo_footer_or_related_as_body(self):
        parser = review.ArticleBody()
        parser.feed('<meta property="og:title" content="보험 기사"><article><p>보험 상품의 실제 설명입니다.</p><figure>인카금융서비스 사진</figure><aside>인카금융서비스 관련 기사</aside><footer>저작권 회사</footer></article><p>페이지 밖 문장</p>')
        self.assertIn("실제 설명", parser.body())
        for text in ("인카금융서비스", "저작권", "페이지 밖"):
            self.assertNotIn(text, parser.body())

    def test_whole_page_paragraphs_are_not_body_evidence(self):
        parser = review.ArticleBody()
        parser.feed('<html><h1>기사 제목</h1><p>' + '본문 아닌 문장 ' * 30 + '</p></html>')
        self.assertEqual(parser.body(), "")

    def test_rechecks_are_bounded_and_manual_rows_are_skipped(self):
        cases = [policy.case_row(policy.load_cases()[0], index) for index in range(9)]
        reviews = [{"id": row["id"], "manual": row["id"] == 1, "evidence_status": "original_required"} for row in cases]
        inspect = Mock(return_value={"status": "needs_original"})
        results = review.recheck(cases, reviews, {}, inspect_fn=inspect)
        self.assertEqual(len(results), 5)
        self.assertNotIn(1, [r["id"] for r in results])
        self.assertEqual(inspect.call_count, 5)

    def test_rechecks_have_cooldown_attempt_cap_and_source_change_reset(self):
        row = policy.case_row(policy.load_cases()[0], 0)
        item = {"id": row["id"], "evidence_status": "original_required"}
        now = datetime.now(timezone.utc)
        inspect = Mock(return_value={"status": "source_unverified"})
        for age, attempts in ((1, 1), (48, 3)):
            previous = {review.fingerprint(row): {"checked_at": (now - timedelta(hours=age)).isoformat(), "attempts": attempts}}
            self.assertEqual(review.recheck([row], [item], previous, now, inspect), [])
        previous = {review.fingerprint(row): {"checked_at": now.isoformat(), "attempts": 3}}
        row["raw"]["description"] += " 새 원문 설명"
        self.assertEqual(len(review.recheck([row], [item], previous, now, inspect)), 1)

    def test_recheck_updates_review_only_not_db_row(self):
        row = policy.case_row(policy.load_cases()[0], 0)
        original = copy.deepcopy(row)
        item = {"id": row["id"], "evidence_status": "original_required"}
        inspect = Mock(return_value={"status": "source_verified_review", "proposed": {"tone": "negative"}, "source_excerpt": "검증된 원문", "reason": "근거 확인"})
        review.recheck([row], [item], {}, inspect_fn=inspect)
        self.assertEqual(row, original)
        self.assertTrue(item["protected"])
        self.assertEqual(item["proposed"]["tone"], "negative")

    def test_post_apply_verification_never_rewrites_a_concurrent_change(self):
        item = {"id": 1, "patch": {"category": "industry"}}
        with patch.object(maintenance, "fetch_records", return_value=[{"id": 1, "category": "own"}]), patch.object(maintenance.supabase_store, "request") as request:
            result = maintenance.verify_applied([item], [1])
        self.assertEqual(result["status"], "verification_conflict")
        request.assert_not_called()

    def test_manual_correction_replay_tests_rules_without_overwriting_override(self):
        row = policy.case_row(next(c for c in policy.load_cases() if c["case"] == "subject-0"), 0)
        feedback = [{"article_hash": row["article_hash"], "corrected_category": "competitor", "corrected_tone": "neutral"}]
        index = maintenance.supabase_store.build_classification_feedback_index(feedback)
        with patch.object(maintenance, "fetch_records", return_value=[row]):
            result = maintenance.replay_manual_corrections(feedback, index)
        self.assertEqual(result["checked"], 1)
        self.assertEqual(result["mismatches"], 1)
        self.assertTrue(result["items"][0]["protected"])
        self.assertEqual(result["items"][0]["before"]["category"], "competitor")

    def test_company_name_alone_cannot_trigger_revised_violation_rule(self):
        analyzer.configure_context_rules([{"rule_key": "tree_pass37_ga_korea_violation_competitor", "enabled": True,
            "category": "competitor", "tone": "caution", "priority": 37,
            "required_terms": ["GA코리아", "지에이코리아"], "required_mode": "any",
            "trigger_terms": ["보험업법 위반", "모집질서 위반", "부당 수수료", "과태료", "제재", "위법 모집"]}])
        self.assertEqual(gold.classify({"title": "지에이코리아, 보험설계사 지원 확대"})["tone"], "neutral")
        violation = analyzer.matched_context_rule("지에이코리아 보험업법 위반 제재")
        self.assertEqual(violation["tone"], "caution")


if __name__ == "__main__":
    unittest.main()
