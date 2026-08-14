from __future__ import annotations

import unittest
from pathlib import Path

import setup_cronjob_org


ROOT = Path(__file__).resolve().parents[1]


class OperationalScheduleTests(unittest.TestCase):
    def test_external_negative_watch_uses_ten_minute_cadence(self) -> None:
        watch = next(
            spec for spec in setup_cronjob_org.specs() if spec.workflow == "negative-watch.yml"
        )
        self.assertEqual(watch.minutes, [0, 10, 20, 30, 40, 50])
        self.assertEqual(watch.hours, list(range(24)))

    def test_negative_watch_has_one_primary_scheduler(self) -> None:
        workflow = (ROOT / ".github/workflows/negative-watch.yml").read_text(encoding="utf-8")
        self.assertNotIn('cron: "*/10 * * * *"', workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("repository_dispatch:", workflow)

    def test_supabase_watchdog_only_recovers_stale_successes(self) -> None:
        source = (
            ROOT / "supabase/functions/trigger-news-collection/index.ts"
        ).read_text(encoding="utf-8")
        schedule_migration = (
            ROOT
            / "supabase/migrations/20260720082300_watchdog_ten_minute_schedule.sql"
        ).read_text(encoding="utf-8")
        self.assertIn("status=in.(success,alert_sent)", source)
        self.assertIn("Math.max(25, rawThreshold)", source)
        self.assertIn("Math.max(10, rawBucketMinutes)", source)
        self.assertIn("schedule := '*/10 * * * *'", schedule_migration)

    def test_report_archive_does_not_trigger_duplicate_pages_deploy(self) -> None:
        pages = (ROOT / ".github/workflows/pages-dashboard.yml").read_text(encoding="utf-8")
        briefing = (ROOT / ".github/workflows/news-briefing.yml").read_text(encoding="utf-8")
        self.assertNotIn('      - "data/daily/**"', pages)
        self.assertNotIn('      - "period_reports/**"', pages)
        self.assertNotIn("gh workflow run pages-dashboard.yml", briefing)

    def test_manual_dashboard_refresh_skips_report_and_pages_pipeline(self) -> None:
        workflow = (ROOT / ".github/workflows/dashboard-refresh.yml").read_text(encoding="utf-8")
        self.assertIn("python refresh_dashboard_news.py", workflow)
        self.assertIn("REPORT_SLOT: live", workflow)
        self.assertNotIn("npm run build", workflow)
        self.assertNotIn("send_slack", workflow)
        self.assertNotIn("pages", workflow.lower())


if __name__ == "__main__":
    unittest.main()
