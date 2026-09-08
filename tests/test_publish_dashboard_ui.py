import json
from pathlib import Path
import tempfile
import unittest

from tools.publish_dashboard_ui import publish_ui


class PublishDashboardUiTests(unittest.TestCase):
    def test_preserves_data_reports_and_existing_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("public/data", "public/reports", "public/assets", "frontend/dist/assets"):
                (root / name).mkdir(parents=True)
            files = {
                "public/index.html": "existing homepage",
                "public/data/operations.json": json.dumps({"articles": [{"title": "sample"}], "articles_generated_at": "2026-09-08T08:12:21+09:00"}),
                "public/data/supabase.json": json.dumps({"url": "https://example.test", "anon_key": "public-test-key"}),
                "public/reports/daily.html": "existing report",
                "public/assets/old.js": "old asset",
                "frontend/dist/index.html": "new dashboard",
                "frontend/dist/assets/new.js": "new asset",
            }
            for name, content in files.items():
                (root / name).write_text(content, encoding="utf-8")
            publish_ui(root)
            for name, content in files.items():
                self.assertEqual((root / name).read_text(encoding="utf-8"), content)
            self.assertEqual((root / "public/dashboard.html").read_text(encoding="utf-8"), "new dashboard")
            self.assertEqual((root / "public/assets/new.js").read_text(encoding="utf-8"), "new asset")

    def test_refuses_empty_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "public/data").mkdir(parents=True)
            (root / "public/reports").mkdir()
            (root / "public/index.html").write_text("homepage", encoding="utf-8")
            (root / "public/reports/daily.html").write_text("report", encoding="utf-8")
            (root / "public/data/operations.json").write_text('{"articles": []}', encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "nonempty"):
                publish_ui(root)
            self.assertFalse((root / "public/dashboard.html").exists())

    def test_refuses_checkout_without_published_report_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "complete published site"):
                publish_ui(Path(directory))
