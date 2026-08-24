import json
import tempfile
import unittest
from pathlib import Path

import dashboard_builder


class DashboardOperationsSnapshotTests(unittest.TestCase):
    def test_snapshot_keeps_only_operational_ledgers(self) -> None:
        notifications = [{"id": 1, "status": "success", "body": "private body", "error": "private error"}]
        watch_runs = [{"run_key": "watch-1", "status": "success"}]
        report_runs = [{
            "run_key": "2026-08-20-08",
            "report_slot": "08",
            "metrics": {
                "total_collected": 12,
                "total_after_cluster": 10,
                "by_category": {"own": 2, "industry": 8},
                "by_tone": {"neutral": 9, "caution": 1},
                "private_summary": "must not be public",
            },
        }]
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
        self.assertEqual(snapshot["report_runs"], [{
            "run_key": "2026-08-20-08",
            "report_slot": "08",
            "dashboard_metrics": {
                "total_collected": 12,
                "total_after_cluster": 10,
                "by_category": {"own": 2, "industry": 8},
                "by_tone": {"neutral": 9, "caution": 1},
            },
        }])
        self.assertNotIn("private_summary", snapshot["report_runs"][0]["dashboard_metrics"])
        self.assertEqual(snapshot["job_runs"], [{"run_key": "daily_report:2026-08-20:08", "status": "success"}])
        self.assertNotIn("articles", snapshot)
        self.assertNotIn("body", snapshot["notifications"][0])
        self.assertNotIn("error", snapshot["job_runs"][0])

    def test_core_article_snapshot_exposes_only_safe_fields(self) -> None:
        existing = {"generated_at": "2026-08-24T08:00:00+09:00", "notifications": []}
        articles = [{
            "id": "article-1",
            "date": "2026-08-24",
            "title": "보험시장 기사",
            "link": "https://example.com/article-1",
            "source": "테스트뉴스",
            "summary": "공개 가능한 요약",
            "category": "industry",
            "tone": "neutral",
            "raw": {"body": "공개하면 안 되는 원문"},
            "private_note": "공개하면 안 되는 운영 메모",
        }]

        snapshot = dashboard_builder.build_public_core_article_snapshot(
            existing,
            articles,
            generated_at="2026-08-24T08:05:00+09:00",
        )

        self.assertEqual(snapshot["generated_at"], existing["generated_at"])
        self.assertEqual(snapshot["articles_generated_at"], "2026-08-24T08:05:00+09:00")
        self.assertEqual(snapshot["articles_refresh_status"], "ok")
        self.assertEqual(snapshot["articles"][0]["title"], "보험시장 기사")
        self.assertNotIn("raw", snapshot["articles"][0])
        self.assertNotIn("private_note", snapshot["articles"][0])

    def test_empty_refresh_preserves_last_known_articles(self) -> None:
        existing = {"articles": [{"id": "last-good", "title": "마지막 정상 기사"}]}

        snapshot = dashboard_builder.build_public_core_article_snapshot(existing, [])

        self.assertEqual(snapshot["articles"], existing["articles"])
        self.assertEqual(snapshot["articles_refresh_status"], "preserved")

    def test_operations_refresh_keeps_last_known_article_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir) / "operations.json"
            target.write_text(
                json.dumps(
                    {
                        "articles": [{"id": "last-good", "title": "마지막 정상 기사"}],
                        "articles_generated_at": "2026-08-24T08:00:00+09:00",
                        "article_lookback_days": 14,
                        "articles_refresh_status": "ok",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            dashboard_builder.write_public_operations_snapshot([], [], [], [], target)
            snapshot = json.loads(target.read_text(encoding="utf-8"))

            self.assertEqual(snapshot["articles"][0]["id"], "last-good")
            self.assertEqual(snapshot["articles_generated_at"], "2026-08-24T08:00:00+09:00")
            self.assertEqual(snapshot["articles_refresh_status"], "ok")


if __name__ == "__main__":
    unittest.main()
