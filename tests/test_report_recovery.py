from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import archiver
import publish_report
import report_recovery
import run_once


class ReportRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"RESUME_GENERATED_REPORT": "true", "REPORT_SLOT": "08", "FORCE_SLACK_SEND": "", "REPORT_BACKFILL_ONLY": ""})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_only_opted_in_daily_slots_resume(self):
        for values in [{"RESUME_GENERATED_REPORT": ""}, {"REPORT_SLOT": "07"}, {"FORCE_SLACK_SEND": "1"}, {"REPORT_BACKFILL_ONLY": "true"}]:
            with patch.dict(os.environ, values), patch.object(report_recovery.supabase_store, "load_report_run_archives") as load:
                self.assertFalse(report_recovery.restore_generated_daily_report())
                load.assert_not_called()

    def test_matching_generated_slot_restores_its_original_archive(self):
        run = {"report_date": "2026-11-25", "report_slot": "08", "timestamp": "2026-11-25T08:06:00+09:00", "metrics": {"total_after_cluster": 1}}
        payload = {"date": "2026-11-25", "window": {"slot": "08"}, "articles": [{"title": "stored article"}]}
        with tempfile.TemporaryDirectory() as directory, patch.object(archiver, "ARCHIVE_DIR", Path(directory)), patch.object(archiver, "today_kst", return_value=date(2026, 11, 25)), patch.object(report_recovery.supabase_store, "load_report_run_archives", return_value=[run]), patch.object(publish_report, "supabase_run_to_archive", return_value=payload) as convert:
            self.assertTrue(report_recovery.restore_generated_daily_report())
            self.assertEqual(json.loads((Path(directory) / "2026-11-25-08.json").read_text(encoding="utf-8")), payload)
            convert.assert_called_once_with(run)

    def test_other_days_and_slots_never_replace_requested_report(self):
        runs = [{"report_date": "2026-11-24", "report_slot": "08"}, {"report_date": "2026-11-25", "report_slot": "13"}]
        with patch.object(archiver, "today_kst", return_value=date(2026, 11, 25)), patch.object(report_recovery.supabase_store, "load_report_run_archives", return_value=runs), patch.object(publish_report, "supabase_run_to_archive") as convert:
            self.assertFalse(report_recovery.restore_generated_daily_report())
            convert.assert_not_called()

    def test_missing_articles_or_database_failure_falls_back_to_collection(self):
        run = {"report_date": "2026-11-25", "report_slot": "08", "metrics": {"total_after_cluster": 3}}
        with patch.object(archiver, "today_kst", return_value=date(2026, 11, 25)), patch.object(report_recovery.supabase_store, "load_report_run_archives", return_value=[run]), patch.object(publish_report, "supabase_run_to_archive", return_value={"articles": []}):
            self.assertFalse(report_recovery.restore_generated_daily_report())
        with patch.object(report_recovery.supabase_store, "load_report_run_archives", side_effect=RuntimeError("offline")):
            self.assertFalse(report_recovery.restore_generated_daily_report())

    def test_recovered_report_does_not_trigger_collection_or_analysis(self):
        with patch.object(run_once, "restore_generated_daily_report", return_value=True), patch.object(run_once, "collect_news") as collect, patch.object(run_once, "run_briefing") as analyze:
            run_once.main()
            collect.assert_not_called()
            analyze.assert_not_called()

    def test_non_recovery_run_keeps_existing_collection_path(self):
        with patch.object(run_once, "restore_generated_daily_report", return_value=False), patch.object(run_once, "collect_news", return_value=[{"title": "new"}]) as collect, patch.object(run_once, "run_briefing") as analyze:
            run_once.main()
            collect.assert_called_once()
            analyze.assert_called_once_with([{"title": "new"}])
