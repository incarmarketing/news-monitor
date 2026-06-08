from __future__ import annotations

import os
from pathlib import Path
import unittest

import public_urls


BASE_DIR = Path(__file__).resolve().parents[1]


class PublicReportLinkTests(unittest.TestCase):
    def test_dashboard_url_defaults_to_public_pages_file(self) -> None:
        previous_dashboard = os.environ.pop("DASHBOARD_PUBLIC_URL", None)
        previous_report = os.environ.pop("REPORT_PUBLIC_URL", None)
        try:
            self.assertEqual(
                public_urls.dashboard_url(),
                "https://your-github-id.github.io/your-repo/dashboard.html",
            )
        finally:
            if previous_dashboard is not None:
                os.environ["DASHBOARD_PUBLIC_URL"] = previous_dashboard
            if previous_report is not None:
                os.environ["REPORT_PUBLIC_URL"] = previous_report

    def test_dashboard_url_handles_report_file_base(self) -> None:
        previous_dashboard = os.environ.get("DASHBOARD_PUBLIC_URL")
        previous_report = os.environ.get("REPORT_PUBLIC_URL")
        os.environ.pop("DASHBOARD_PUBLIC_URL", None)
        os.environ["REPORT_PUBLIC_URL"] = "https://your-github-id.github.io/your-repo/reports/daily/2026-06-06-13.html"
        try:
            self.assertEqual(
                public_urls.dashboard_url(),
                "https://your-github-id.github.io/your-repo/dashboard.html",
            )
        finally:
            if previous_dashboard is not None:
                os.environ["DASHBOARD_PUBLIC_URL"] = previous_dashboard
            if previous_report is not None:
                os.environ["REPORT_PUBLIC_URL"] = previous_report
            else:
                os.environ.pop("REPORT_PUBLIC_URL", None)

    def test_report_templates_do_not_use_relative_dashboard_link(self) -> None:
        for relative_path in ("templates/email.html", "templates/period_report.html"):
            template = (BASE_DIR / relative_path).read_text(encoding="utf-8")
            self.assertNotIn('href="./dashboard.html"', template)
            self.assertIn("dashboard_url", template)


if __name__ == "__main__":
    unittest.main()
