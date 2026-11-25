import assert from "node:assert/strict";
import test from "node:test";
import { chartGeometry, chartLabelIndexes, chartPointLabel } from "../src/chartPresentation.js";
import { priorityDisplayRows } from "../src/dashboardPresentation.js";
import { reportArticleHeadline, reportCategoryColor, reportCategoryLabel } from "../src/reportModel.js";
import { dashboardSeries } from "../src/dashboardPresentation.js";

test("chart scale contains all values and keeps a real zero baseline", () => {
  const geometry = chartGeometry([{ own: 0 }, { own: 23 }], [{ key: "own" }], 320, 160, true);
  assert.ok(geometry.ticks.at(-1) >= 23);
  assert.equal(geometry.ticks[0], 0);
  assert.ok(geometry.y(23) >= geometry.padding.top);
  assert.ok(geometry.y(0) > geometry.y(23));
});
test("empty, constant and malformed chart data has finite coordinates", () => {
  for (const rows of [[], [{ own: 0 }], [{ own: "bad" }, { own: 0 }]]) {
    const geometry = chartGeometry(rows, [{ key: "own" }], 320, 160);
    assert.ok(geometry.ticks.every(Number.isFinite));
    assert.ok(Number.isFinite(geometry.x(0)));
    assert.ok(Number.isFinite(geometry.y(0)));
  }
});
test("tooltip names the actual date, category, count and unit", () => {
  assert.equal(chartPointLabel({ date: "2026-11-24", own: 5 }, { key: "own", label: "당사" }), "2026-11-24 · 당사 · 5건");
  assert.equal(chartPointLabel({ date: "2026-11-24", risk: 30 }, { key: "risk", label: "리스크", unit: "점" }), "2026-11-24 · 리스크 · 30점");
});

test("date axis keeps both endpoints without crowding the final two dates", () => {
  for (const count of [7, 30, 90]) {
    for (const width of [280, 720, 1300]) {
      const indexes = chartLabelIndexes(count, width);
      assert.equal(indexes[0], 0);
      assert.equal(indexes.at(-1), count - 1);
      for (let i = 1; i < indexes.length; i++) assert.ok((indexes[i] - indexes[i - 1]) * width / (count - 1) >= 64);
    }
  }
  assert.deepEqual(chartLabelIndexes(0, 200), []);
  assert.deepEqual(chartLabelIndexes(1, 200), [0]);
});
test("duplicate source rows restore the longest available title without changing ranking", () => {
  const issue = { title: "보험 수수료...", link: "https://example.com/one", tone: "주의", category: "정책", score: 30 };
  const long = { link: issue.link, title: "보험 수수료 제도 개편과 판매채널 관리 체계 정비", summary: "원문에 저장된 요약", tone: "중립" };
  const [result] = priorityDisplayRows([issue], [long, { ...long, title: "보험 수수료...", summary: "" }]);
  assert.equal(result.title, long.title);
  assert.equal(result.summary, long.summary);
  assert.equal(result.tone, issue.tone);
  assert.equal(result.category, issue.category);
  assert.equal(result.score, issue.score);
});

test("report headline does not duplicate a publisher already in brackets", () => {
  assert.equal(reportArticleHeadline({ source: "더벨", title: "[더벨] 보험 채널 제도 개편", relatedCount: 2 }), "[더벨] 보험 채널 제도 개편 · 관련 2건");
});
test("report headline combines publisher and title without truncating it", () => {
  assert.equal(reportArticleHeadline({ source: "보험저널", title: "GA 수수료 협상권과 유지비 배분 관건" }), "[보험저널] GA 수수료 협상권과 유지비 배분 관건");
});
test("report labels abbreviate existing classifications without changing the article", () => {
  assert.equal(reportCategoryLabel("정책/규제"), "정책");
  assert.equal(reportCategoryLabel("업계동향"), "보험사");
  assert.equal(reportCategoryLabel("경쟁사"), "GA");
  assert.equal(reportCategoryLabel("당사"), "당사");
});

test("report colors keep category identity when other categories have zero articles", () => {
  assert.equal(reportCategoryColor("업계동향"), dashboardSeries.find(row => row.key === "insurance").color);
  assert.equal(reportCategoryColor("정책/규제"), dashboardSeries.find(row => row.key === "regulation").color);
});
