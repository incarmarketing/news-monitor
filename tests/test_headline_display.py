import copy
import json
import re
import unittest
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

import ai_briefing
import period_report
import publisher_identity
import slack_notify


class HeadlineDisplayTests(unittest.TestCase):
    def test_shared_cases_are_idempotent_and_leave_identity_untouched(self):
        cases = json.loads((Path(__file__).parent / "fixtures/headline_cases.json").read_text(encoding="utf-8"))
        for article, expected in cases:
            with self.subTest(title=article["title"]):
                original = copy.deepcopy(article)
                publisher = publisher_identity.resolve_publisher(article)
                self.assertEqual(publisher_identity.display_headline(article), expected)
                self.assertEqual(publisher_identity.display_headline({**article, "title": expected}), expected)
                self.assertEqual(article, original)
                self.assertEqual(publisher_identity.resolve_publisher(article), publisher)

    def test_string_and_missing_titles(self):
        self.assertEqual(publisher_identity.display_headline("보험 소식 - 뉴스핌"), "보험 소식")
        self.assertEqual(publisher_identity.display_headline({}), "")

    def test_daily_report_cleans_headline_and_preserves_source_and_link(self):
        article = {"title": "인카금융서비스 영업력 확대 - 뉴스핌", "source": "뉴스핌",
                   "link": "https://example.com/original", "_category": "own", "_tone": "neutral", "_score": 10, "_cluster_size": 1}
        document = ai_briefing.build_html_report("", [article], {}, None)
        headlines = re.findall(r'<b class="headline">(.*?)</b>', document, re.S)
        self.assertTrue(headlines)
        self.assertIn("[뉴스핌] 인카금융서비스 영업력 확대", headlines[0])
        self.assertNotIn(" - 뉴스핌", headlines[0])
        self.assertIn(article["link"], document)
        self.assertEqual(article["title"], "인카금융서비스 영업력 확대 - 뉴스핌")

    def test_slack_text_changes_without_affecting_selection_or_stored_title(self):
        article = {"title": "보험 전망 Not Rated - iM증권 - 뉴스핌", "source": "뉴스핌"}
        original = copy.deepcopy(article)
        self.assertEqual(slack_notify.article_issue_lines({"articles": [article]}, include_summary=False),
                         ["- *보험 전망 Not Rated - iM증권*"])
        self.assertEqual(slack_notify.article_title(article), article["title"])
        self.assertEqual(article, original)

    def test_period_report_uses_shared_formatter_and_escapes_headlines(self):
        article = {"title": "보험 <손익> 전망 - 뉴스1", "source": "뉴스1", "_category": "own",
                   "link": "https://example.com/original", "_tone": "neutral"}
        original = copy.deepcopy(article)
        aggregate = {"by_category": {"own": 1}, "by_tone": {"neutral": 1}, "risk_distribution": {},
                     "total_after_cluster": 1, "total_collected": 1, "period_days": 1, "period_windows": 1}
        context = period_report.build_report_context(aggregate, [article])
        env = Environment(loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "templates"))
        env.globals["display_headline"] = publisher_identity.display_headline
        for label in ("주간", "월간"):
            with self.subTest(period=label):
                document = env.get_template("period_report.html").render(
                    aggregate=aggregate, report_context=context, period_label=label,
                    trend_days=[], risk_trend_days=[], max_trend_total=0, max_own_trend_total=0, max_neg=0,
                )
                self.assertIn("<b>보험 &lt;손익&gt; 전망</b>", document)
                self.assertNotIn(" - 뉴스1", document)
                self.assertIn(article["link"], document)
                self.assertIn("뉴스1", document)
        self.assertEqual(article, original)


if __name__ == "__main__":
    unittest.main()
