import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { articleClock, dashboardSeries, latestDeliveryLabel, reportSlotPresentation, priorityDisplayRows } from "../src/dashboardPresentation.js";

test("missing report history never fabricates completed slots", () => {
  const slots = reportSlotPresentation();
  assert.deepEqual(slots.map(row => row.slot), ["08", "13", "18"]);
  assert.ok(slots.every(row => row.status === "unknown"));
});
test("generated and scheduled reports are not sent reports", () => {
  const slots = reportSlotPresentation({ slots: [{slot:"13",status:"ok",state:"완료"},{slot:"08",status:"warn",state:"생성완료"}] });
  assert.equal(slots.filter(row => row.status === "ok").length, 1);
  assert.equal(slots[0].state, "생성완료");
});
test("delivery label retains the known latest timestamp and missing state", () => {
  assert.equal(latestDeliveryLabel({meta:"최신 13:09 · 보고서"}), "13:09");
  assert.equal(latestDeliveryLabel(), "미확인");
});
test("article time is Korean time and never fabricated for missing dates", () => {
  assert.equal(articleClock({pubDate:"2026-09-10T04:09:00Z"}, Date.parse("2026-09-10T04:09:00Z")), "13:09");
  assert.equal(articleClock({time:"08:12"}, 0), "08:12");
  assert.equal(articleClock({time:"최근 수집"}, 0), "-");
});
test("date-only sorting fallbacks are not displayed as publication midnight", () => {
  const midnight = Date.parse("2026-09-10T00:00:00+09:00");
  assert.equal(articleClock({date:"2026-09-10"}, midnight), "-");
  assert.equal(articleClock({pubDate:"2026-09-10"}, midnight), "-");
  assert.equal(articleClock({time:"99:99",date:"2026-09-10"}, midnight), "-");
  assert.equal(articleClock({time:"00:00"}, midnight), "00:00");
  assert.equal(articleClock({pub_date:"2026-09-10T00:00:00+09:00"}, midnight), "00:00");
});
test("category colors are shared across chart and distribution", () => {
  assert.equal(new Set(dashboardSeries.map(row => row.color)).size, 4);
  assert.deepEqual(dashboardSeries.map(row => row.key), ["own", "ga", "insurance", "regulation"]);
});

test("full titles and publication times are restored without changing classification or order", () => {
  const issue = {title:"보험 설계...",link:"https://example.com/one",tone:"주의",category:"GA",relatedCount:3};
  const source = {title:"보험 설계사의 교육 확대 - 보험매일",link:issue.link,time:"12:03",tone:"중립",category:"보험사"};
  const [display] = priorityDisplayRows([issue], [source]);
  assert.equal(display.title, source.title);
  assert.equal(display.time, "12:03");
  assert.equal(display.tone, "주의");
  assert.equal(display.category, "GA");
  assert.equal(display.relatedCount, 3);
  assert.equal(issue.title, "보험 설계...");
  assert.equal(priorityDisplayRows([issue], [{...source,link:"https://example.com/two"}])[0], issue);
});
test("there is only one dashboard stylesheet, without archived variants", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(main, /import "\.\/dashboard-workbench\.css"/);
  assert.doesNotMatch(main + shared, /dashboard-v[3456]|dashboard-option1\.css/);
  assert.equal(fs.existsSync(new URL("../src/dashboard-option1.css", import.meta.url)), false);
  const css = fs.readFileSync(new URL("../src/dashboard-workbench.css", import.meta.url), "utf8");
  assert.match(css, /app-shell:not\(\[data-active-section="overview"\]\)/);
  assert.match(css, /app-shell:not\(\[data-active-section="monitoring"\]\)/);
});
