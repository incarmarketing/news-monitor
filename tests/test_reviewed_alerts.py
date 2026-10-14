from __future__ import annotations

import copy
import hashlib
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import article_body
from tools import send_reviewed_alerts as recovery


class ReviewedAlertRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 14, tzinfo=timezone.utc)
        self.article = {"id": 1, "title": "인카금융서비스 과태료 부과", "link": "https://example.com/1",
                        "article_hash": "original-hash", "pub_date": "2026-10-08T09:07:17+00:00",
                        "source": "한국보험신문", "tone": "negative", "own_mentioned": True,
                        "negative_target": "own", "alert_eligible": True}
        body = "금융위원회는 인카금융서비스에 기관경고와 과태료 53억원을 부과했다."
        self.article["body"] = body
        self.article["_body_scope"] = {"method": "explicit_body", "version": article_body.SOURCE_SCOPE_VERSION,
                                     "body_sha256": hashlib.sha256(body.encode()).hexdigest()}
        self.article["_source_evidence_scope"] = article_body.source_evidence_scope(self.article, body)
        self.repair = {"id": 1, "before": copy.deepcopy(self.article), "patch": copy.deepcopy(self.article)}

    def validate(self):
        return recovery.validate_reviewed_article(self.article, self.repair, self.now)

    def test_confirmed_old_negative_is_allowed(self):
        self.assertIn("과태료", self.validate())

    def test_metadata_only_capsule_is_allowed(self):
        self.article["raw"] = {"_body_scope": self.article.pop("_body_scope"),
                               "_source_evidence_scope": self.article.pop("_source_evidence_scope")}
        self.article.pop("body")
        self.assertIn("과태료", self.validate())

    def test_own_false_is_rejected(self):
        self.article["own_mentioned"] = False
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_article_identity_drift_is_rejected(self):
        self.article["title"] += " changed"
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_tampered_proof_is_rejected(self):
        self.article["_source_evidence_scope"]["text"] += " tampered"
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_current_classifier_rejection_blocks_send(self):
        with patch.object(recovery.deterministic_risk, "classify", return_value={"alert_eligible": False}):
            with self.assertRaises(RuntimeError):
                self.validate()

    def test_current_article_cannot_bypass_live_watch(self):
        self.article["pub_date"] = "2026-10-13T23:00:00+00:00"
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_older_than_14_days_is_rejected(self):
        self.article["pub_date"] = "2026-09-01T00:00:00+00:00"
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_ledger_failure_stops_delivery(self):
        with patch.object(recovery.store, "notification_already_sent", side_effect=RuntimeError("DB failure")):
            with self.assertRaises(RuntimeError):
                recovery.already_sent(self.article)

    def test_existing_claim_never_resends(self):
        with patch.object(recovery, "claim_delivery", return_value=False), \
                patch.object(recovery.negative_watch, "send_slack_alert") as send:
            with self.assertRaises(RuntimeError):
                recovery.deliver(self.article, "evidence", "review")
            send.assert_not_called()

    def test_success_logs_original_publication_date(self):
        with patch.object(recovery, "claim_delivery", return_value=True), \
                patch.object(recovery.negative_watch, "send_slack_alert", return_value={"ok": True}) as send, \
                patch.object(recovery.store, "save_notification_send") as save, \
                patch.object(recovery.store, "request"):
            recovery.deliver(self.article, "evidence", "review")
            self.assertIn("2026.10.08 18:07", send.call_args.args[0])
            self.assertIn("과거 기사", send.call_args.args[0])
            self.assertEqual(save.call_args.kwargs["status"], "success")

    def test_uncertain_slack_failure_is_not_marked_success(self):
        with patch.object(recovery, "claim_delivery", return_value=True), \
                patch.object(recovery.negative_watch, "send_slack_alert", side_effect=TimeoutError), \
                patch.object(recovery.store, "save_notification_send") as save:
            with self.assertRaises(TimeoutError):
                recovery.deliver(self.article, "evidence", "review")
            save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
