import test from "node:test";
import assert from "node:assert/strict";
import { chartGeometry } from "../src/chartPresentation.js";
import { toneChartSeries, tonePanelStats } from "../src/toneTrendModel.js";
import fs from "node:fs";

test("rare negative articles retain integer counts on an independent zero-based scale", () => {
  const rows = [{ negative: 0, neutral: 100 }, { negative: 1, neutral: 150 }];
  const negative = toneChartSeries.find(item => item.key === "negative");
  const neutral = toneChartSeries.find(item => item.key === "neutral");
  const rareScale = chartGeometry(rows, negative.series);
  const commonScale = chartGeometry(rows, neutral.series);
  assert.deepEqual(tonePanelStats(rows, "negative"), { total: 1, days: 1 });
  assert.equal(rareScale.ticks[0], 0);
  assert.equal(rareScale.ticks.at(-1), 1);
  assert.ok(rareScale.ticks.every(Number.isInteger));
  assert.ok(commonScale.ticks.at(-1) >= 150);
  assert.deepEqual(tonePanelStats([{ negative: 0 }, { negative: 0 }], "negative"), { total: 0, days: 0 });
});

test("media defaults to the inclusive last 30 days", () => {
  const source = fs.readFileSync(new URL("../src/MediaAnalysis.jsx", import.meta.url), "utf8");
  assert.match(source, /addDaysToDateKey\(today, -29\)/);
});
