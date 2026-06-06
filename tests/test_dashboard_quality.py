from __future__ import annotations

import unittest

import dashboard_builder


class DashboardQualityTests(unittest.TestCase):
    def test_article_summary_falls_back_when_summary_is_only_title(self) -> None:
        article = {
            "title": "[한눈에보는GA리포트] 인카금융서비스 - 보험저널",
            "summary": "[한눈에보는GA리포트] 인카금융서비스 - 보험저널",
            "keyword": "인카금융서비스",
        }

        summary = dashboard_builder.article_summary(article, "own", "neutral")

        self.assertIn("GA 리포트성", summary)
        self.assertTrue(dashboard_builder.is_usable_summary_line(summary, article["title"]))

    def test_ai_issue_summary_rejects_title_clone(self) -> None:
        title = "[N2 포커스] 설계사 '정착지원금 경쟁' 저문다…GA '조직력'이 관건"
        group = {"members": [{"title": title, "summary": "GA 정착지원금과 조직력 경쟁을 다룬 기사입니다."}]}

        self.assertEqual(dashboard_builder.clean_issue_summary(title + ".", group), "")

    def test_quality_checks_catch_report_window_and_notification_link_mismatch(self) -> None:
        articles = [
            {
                "date": "2026-06-06",
                "title": "AI로 진단서까지 바꾼다…보험사기 진화",
                "source": "블로터",
                "tone": "caution",
                "summary": "AI를 활용한 보험사기 수법 확산과 보험업계 데이터 대응 필요성을 다룬 기사입니다.",
            }
        ]
        report_runs = [
            {
                "run_key": "2026-06-06-13",
                "report_date": "2026-06-06",
                "report_slot": "13",
                "window_label": "당일 07:00~13:00",
            }
        ]
        notifications = [
            {
                "id": 1,
                "message_type": "daily_report",
                "title": "일일 언론 동향 2026-06-06 13",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-08.html",
            }
        ]

        quality = dashboard_builder.build_quality_checks(articles, report_runs, notifications)

        self.assertEqual(quality["status"], "fail")
        failed_names = {check["name"] for check in quality["checks"] if check["status"] != "ok"}
        self.assertIn("daily_report_windows", failed_names)
        self.assertIn("notification_report_links", failed_names)
        self.assertNotIn("current_day_summaries", failed_names)

    def test_quality_checks_pass_for_good_daily_records(self) -> None:
        articles = [
            {
                "date": "2026-06-06",
                "title": "실손24 시대, 다시 등장한 팩스 청구",
                "source": "뉴스웍스",
                "tone": "neutral",
                "summary": "실손24 전산화 이후에도 팩스 청구가 병행되는 현장 불편과 제도 안착 과제를 다룬 기사입니다.",
            }
        ]
        report_runs = [
            {
                "run_key": "2026-06-06-13",
                "report_date": "2026-06-06",
                "report_slot": "13",
                "window_label": "당일 08:00~13:00",
            }
        ]
        notifications = [
            {
                "id": 1,
                "message_type": "daily_report",
                "title": "일일 언론 동향 2026-06-06 13",
                "link_url": "https://incarmarketing.github.io/news-monitor/reports/daily/2026-06-06-13.html?v=1",
            }
        ]

        quality = dashboard_builder.build_quality_checks(articles, report_runs, notifications)

        self.assertEqual(quality["status"], "ok")


if __name__ == "__main__":
    unittest.main()
