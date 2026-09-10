import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { monitoringCategoryKey, monitoringCategoryLabel, monitoringCategoryCounts, monitoringDateRange, monitoringPage, monitoringCsv, csvCell } from "../src/monitoringPresentation.js";

test("monitoring category tabs combine stored aliases, not keywords or company mentions", () => {
  for (const value of ["GA", "competitor", "경쟁사"]) assert.equal(monitoringCategoryKey(value), "ga");
  for (const value of ["industry", "보험사", "업계동향"]) assert.equal(monitoringCategoryKey(value), "insurance");
  assert.equal(monitoringCategoryKey("정책/규제"), "policy");
  assert.equal(monitoringCategoryKey("보험대리점 검색 키워드"), "other");
  assert.equal(monitoringCategoryLabel("industry"), "보험업계");
});
test("category counters remain mutually exclusive and preserve source rows", () => {
  const rows = [{category:"당사"}, {category:"GA"}, {category:"경쟁사"}, {category:"업계동향"}, {category:"정책/규제"}, {category:"스폰서십"}, {category:"new"}];
  const before = JSON.stringify(rows);
  const counts = monitoringCategoryCounts(rows);
  assert.equal(Object.values(counts).reduce((sum, n) => sum + n), rows.length);
  assert.equal(counts.ga, 2);
  assert.equal(counts.own, 1);
  assert.equal(JSON.stringify(rows), before);
});
test("period buttons include today exactly once and cross month/year boundaries", () => {
  assert.deepEqual(monitoringDateRange("2026-09-10", 1), {startDate:"2026-09-10",endDate:"2026-09-10"});
  assert.deepEqual(monitoringDateRange("2026-09-10", 7), {startDate:"2026-09-04",endDate:"2026-09-10"});
  assert.deepEqual(monitoringDateRange("2026-01-10", 30), {startDate:"2025-12-12",endDate:"2026-01-10"});
  assert.equal(monitoringDateRange("bad", 7), null);
  assert.equal(monitoringDateRange("2026-09-10", 5), null);
});
test("pagination cannot strand users on an empty page after filtering", () => {
  const rows = Array.from({length:23}, (_, i) => ({id:i}));
  const page = monitoringPage(rows, 99, 10);
  assert.equal(page.current, 3);
  assert.equal(page.first, 21);
  assert.equal(page.last, 23);
  assert.deepEqual(page.rows.map(row => row.id), [20,21,22]);
  assert.equal(rows.length, 23);
  const empty = monitoringPage([], 3, 10);
  assert.deepEqual([empty.first, empty.last, empty.current, empty.pages], [0,0,1,1]);
});
test("pagination supports bounded ten, twenty and fifty row views", () => {
  const rows = Array.from({length:100}, (_, i) => i);
  assert.equal(monitoringPage(rows, 1, 20).rows.length, 20);
  assert.equal(monitoringPage(rows, 1, 50).rows.length, 50);
  assert.equal(monitoringPage(rows, 1, 9999).rows.length, 10);
});
test("CSV preserves Korean, quotes, commas and newlines without spreadsheet formula execution", () => {
  assert.equal(csvCell('기사, "원문"\n확인'), '"기사, ""원문""\n확인"');
  for (const text of ['=1+1', '+SUM(A1)', '@SUM(A1)', '-2+3', '\t=HYPERLINK("https://example.com")']) {
    assert.ok(csvCell(text).startsWith('"\''));
  }
  const csv = monitoringCsv([{date:"2026-09-10",time:"12:14",tone:"긍정",category:"당사",title:"인카금융서비스, 나눔 활동 - 이데일리",source:"이데일리",link:"https://www.edaily.co.kr/article/1"}]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"기사 제목","언론사"/);
  assert.match(csv, /"인카금융서비스, 나눔 활동","이데일리"/);
  assert.doesNotMatch(csv, /나눔 활동 - 이데일리/);
  assert.doesNotMatch(monitoringCsv([{title:"기사",link:"javascript:alert(1)"}]), /javascript:/);
});
test("retired monitoring CSS is removed while shared article components remain", () => {
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const view = fs.readFileSync(new URL("../src/MonitoringWorkbench.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(shared, /monitoring-filter-card|monitoring-filter-actions|\.monitoring-layout|\.monitoring-workspace/);
  assert.match(main, /function ArticleFeed/);
  assert.match(main, /function MonitoringArticleDetails/);
  assert.match(view, /onClick=\{exportCsv\}/);
  assert.match(view, /<Details article=\{row\}/);
  assert.match(view, /relatedCount > 1/);
  assert.match(view, /aria-label="현재 페이지 기사 전체 선택"/);
  assert.equal((view.match(/onInput=\{event => onChange\("(?:start|end)DateInput"/g) || []).length, 2);
});
