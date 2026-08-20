import unittest

import dashboard_builder


class DashboardOperationsSnapshotTests(unittest.TestCase):
    def test_snapshot_keeps_only_operational_ledgers(self) -> None:
        notifications = [{"id": 1, "status": "success", "body": "private body", "error": "private error"}]
        watch_runs = [{"run_key": "watch-1", "status": "success"}]
        report_runs = [{"run_key": "2026-08-20-08", "report_slot": "08", "metrics": {"articles": 10}}]
        job_runs = [{"run_key": "daily_report:2026-08-20:08", "status": "success", "error": "private error"}]

        snapshot = dashboard_builder.build_public_operations_snapshot(
            notifications,
            watch_runs,
            report_runs,
            job_runs,
        )

        self.assertIn("generated_at", snapshot)
        self.assertEqual(snapshot["notifications"], [{"id": 1, "status": "success"}])
        self.assertEqual(snapshot["watch_runs"], watch_runs)
        self.assertEqual(snapshot["report_runs"], [{"run_key": "2026-08-20-08", "report_slot": "08"}])
        self.assertEqual(snapshot["job_runs"], [{"run_key": "daily_report:2026-08-20:08", "status": "success"}])
        self.assertNotIn("articles", snapshot)
        self.assertNotIn("body", snapshot["notifications"][0])
        self.assertNotIn("error", snapshot["job_runs"][0])


if __name__ == "__main__":
    unittest.main()
