from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import setup_cronjob_org


ROOT = Path(__file__).resolve().parents[1]


class OperationalScheduleTests(unittest.TestCase):
    def test_external_negative_watch_uses_ten_minute_cadence(self) -> None:
        watch = next(
            spec for spec in setup_cronjob_org.specs() if spec.workflow == "negative-watch.yml"
        )
        self.assertEqual(watch.minutes, [0, 10, 20, 30, 40, 50])
        self.assertEqual(watch.hours, list(range(24)))

    def test_negative_watch_does_not_email_every_success(self) -> None:
        watch = next(
            spec for spec in setup_cronjob_org.specs() if spec.workflow == "negative-watch.yml"
        )
        payload = setup_cronjob_org.job_payload(watch, "token", True)
        self.assertFalse(payload["job"]["notification"]["onSuccess"])

    def test_stale_cleanup_matches_managed_workflow_url_even_with_renamed_title(self) -> None:
        watch = next(
            spec for spec in setup_cronjob_org.specs() if spec.workflow == "negative-watch.yml"
        )
        jobs = [{
            "jobId": 99,
            "title": "Old Negative Watch",
            "url": setup_cronjob_org.github_dispatch_url(watch.workflow),
        }]
        with patch.object(setup_cronjob_org.requests, "patch") as patch_request:
            patch_request.return_value.ok = True
            disabled = setup_cronjob_org.disable_stale_jobs(
                "cron-key",
                jobs,
                {watch.title: 100},
                {watch.title},
            )
        self.assertEqual(disabled, [99])

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
        self.assertIn('      - "refresh_dashboard_news.py"', workflow)
        self.assertNotIn("npm run build", workflow)
        self.assertNotIn("send_slack", workflow)
        self.assertNotIn("pages", workflow.lower())

    def test_public_dashboard_refresh_is_narrow_and_rate_limited(self) -> None:
        edge = (
            ROOT / "supabase/functions/dashboard-api/index.ts"
        ).read_text(encoding="utf-8")
        frontend = (ROOT / "frontend/src/liveData.js").read_text(encoding="utf-8")
        app = (ROOT / "frontend/src/main.jsx").read_text(encoding="utf-8")

        self.assertIn("isPublicDashboardRefreshRequest", edge)
        self.assertIn('workflow === "dashboard-refresh.yml"', edge)
        self.assertIn('periodReports === "none"', edge)
        self.assertIn("!booleanInput(payload.send_slack)", edge)
        self.assertIn("DASHBOARD_PUBLIC_REFRESH_COOLDOWN_MINUTES", edge)
        self.assertIn('"https://incarmarketing.github.io"', edge)
        self.assertIn("{ allowAnonymous }", frontend)
        self.assertIn('workflows[0] === "dashboard-refresh.yml"', app)

    def test_public_dashboard_snapshot_is_read_only_and_live_first(self) -> None:
        edge = (
            ROOT / "supabase/functions/dashboard-api/index.ts"
        ).read_text(encoding="utf-8")
        frontend = (ROOT / "frontend/src/liveData.js").read_text(encoding="utf-8")

        self.assertIn("isPublicDashboardSnapshotRequest", edge)
        self.assertIn('action === "snapshot" && isAllowedPublicRefreshOrigin(origin)', edge)
        self.assertNotIn('action === "rest" && isAllowedPublicRefreshOrigin(origin)', edge)
        self.assertIn('dashboardApi(config, null, "snapshot"', frontend)
        self.assertIn('{ allowAnonymous: true }', frontend)
        self.assertIn("return loadStaticOperationalStatus()", frontend)
        self.assertIn('Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")', edge)
        self.assertIn('Deno.env.get("SUPABASE_PUBLISHABLE_KEY")', edge)

    def test_all_browser_edge_functions_accept_publishable_keys(self) -> None:
        for function_name in (
            "dashboard-api",
            "trigger-news-collection",
            "analyze-scraps",
            "generate-risk-response",
            "generate-press-release",
        ):
            source = (
                ROOT / "supabase/functions" / function_name / "index.ts"
            ).read_text(encoding="utf-8")
            self.assertIn("SUPABASE_PUBLISHABLE_KEYS", source, function_name)

        deploy = (
            ROOT / ".github/workflows/deploy-supabase-functions.yml"
        ).read_text(encoding="utf-8")
        self.assertIn("analyze-scraps", deploy)
        self.assertIn("generate-risk-response", deploy)
        self.assertIn("generate-press-release", deploy)
        self.assertIn("--no-verify-jwt", deploy)

    def test_edge_deploy_fails_loudly_when_credentials_are_missing(self) -> None:
        deploy = (
            ROOT / ".github/workflows/deploy-supabase-functions.yml"
        ).read_text(encoding="utf-8")
        self.assertIn("Validate Edge Function deploy secrets", deploy)
        self.assertIn("exit 1", deploy)
        self.assertNotIn("deploy skipped", deploy)

    def test_browser_requests_have_a_bounded_wait_time(self) -> None:
        live_data = (ROOT / "frontend/src/liveData.js").read_text(encoding="utf-8")
        app = (ROOT / "frontend/src/main.jsx").read_text(encoding="utf-8")
        self.assertIn("REQUEST_TIMEOUT_MS", live_data)
        self.assertIn("fetchWithTimeout", live_data)
        self.assertIn('new Error("request_timeout")', live_data)
        self.assertIn("supabaseApiHeaders", live_data)
        self.assertNotIn('Authorization: `Bearer ${config.anon_key}`', live_data)
        self.assertIn("fetchWorkflowHealth", app)
        self.assertIn("workflow_health_timeout", app)

    def test_every_static_report_publish_receives_dart_credentials(self) -> None:
        for workflow_name in ("pages-dashboard.yml", "news-briefing.yml"):
            workflow = (ROOT / ".github/workflows" / workflow_name).read_text(encoding="utf-8")
            publish_steps = workflow.split("run: python publish_report.py")
            self.assertGreaterEqual(len(publish_steps), 2, workflow_name)
            publish_env = publish_steps[1][:5000]
            self.assertIn("DART_API_KEY:", publish_env, workflow_name)
            self.assertIn("DART_CORP_CODE:", publish_env, workflow_name)

if __name__ == "__main__":
    unittest.main()
