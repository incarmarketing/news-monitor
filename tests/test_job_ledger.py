from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

import job_ledger


def kst_datetime(year: int, month: int, day: int, hour: int) -> datetime:
    return datetime(year, month, day, hour, tzinfo=job_ledger.KST)


class JobLedgerTests(unittest.TestCase):
    def test_generated_daily_report_keeps_allowed_job_type(self) -> None:
        with (
            patch.dict("os.environ", {"REPORT_SLOT": "18"}, clear=True),
            patch.object(job_ledger, "now_kst", return_value=kst_datetime(2026, 6, 24, 18)),
        ):
            row = job_ledger.report_job_row("success", stage="generated")

        self.assertEqual(row["run_key"], "daily_report:2026-06-24:18:generated")
        self.assertEqual(row["job_type"], "daily_report")
        self.assertEqual(row["status"], "success")
        self.assertEqual(row["details"]["stage"], "generated")

    def test_generated_period_report_keeps_allowed_job_type(self) -> None:
        with (
            patch.dict("os.environ", {"REPORT_SLOT": "07"}, clear=True),
            patch.object(job_ledger, "now_kst", return_value=kst_datetime(2026, 6, 1, 7)),
        ):
            row = job_ledger.report_job_row("success", stage="generated")

        self.assertEqual(row["run_key"], "period_report:2026-06-01:07:generated")
        self.assertEqual(row["job_type"], "period_report")
        self.assertEqual(row["details"]["stage"], "generated")

    def test_generated_record_failure_is_best_effort(self) -> None:
        with (
            patch("sys.argv", ["job_ledger.py", "report", "generated"]),
            patch.dict("os.environ", {"REPORT_SLOT": "18"}, clear=True),
            patch.object(job_ledger, "write_row", side_effect=RuntimeError("temporary db error")),
        ):
            job_ledger.main()


if __name__ == "__main__":
    unittest.main()
