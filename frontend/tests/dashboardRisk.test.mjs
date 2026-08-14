import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardCompositionRows,
  calculateDailyDashboardRiskIndex,
  calculateDashboardRiskIndex,
  classifyDashboardArticleSeries,
} from "../src/dashboardRisk.js";

test("neutral insurer performance does not become a high risk issue", () => {
  const score = calculateDashboardRiskIndex({ tones: ["중립"], insuranceContext: true, relatedCount: 1 });
  assert.equal(score, 14);
});

test("insurance regulation caution outranks neutral insurer performance", () => {
  const neutralInsurer = calculateDashboardRiskIndex({ tones: ["중립"], insuranceContext: true });
  const policyCaution = calculateDashboardRiskIndex({ tones: ["주의"], policyContext: true });
  assert.ok(policyCaution > neutralInsurer);
  assert.equal(policyCaution, 62);
});

test("direct company negative remains the highest operational priority", () => {
  const ownNegative = calculateDashboardRiskIndex({
    tones: ["부정"],
    directOwnMention: true,
    directOwnNegative: true,
    riskLevels: ["HIGH"],
  });
  const industryNegative = calculateDashboardRiskIndex({ tones: ["부정"], insuranceContext: true });
  assert.ok(ownNegative > industryNegative);
  assert.equal(ownNegative, 92);
});

test("classification confidence cannot inflate a neutral risk index", () => {
  const score = calculateDashboardRiskIndex({ tones: ["중립"], insuranceContext: true, relatedCount: 30 });
  assert.equal(score, 16);
});

test("daily risk index stays zero without negative or caution signals", () => {
  assert.equal(calculateDailyDashboardRiskIndex({}), 0);
});

test("historical caution articles produce a non-zero daily risk index", () => {
  const score = calculateDailyDashboardRiskIndex({ policyCaution: 2, industryCaution: 3 });
  assert.equal(score, 19);
});

test("direct company negative signals dominate daily risk", () => {
  const ownNegative = calculateDailyDashboardRiskIndex({ ownNegative: 1 });
  const fiveIndustryCautions = calculateDailyDashboardRiskIndex({ industryCaution: 5 });
  assert.ok(ownNegative > fiveIndustryCautions);
  assert.equal(ownNegative, 30);
});

test("daily risk index is capped at 100", () => {
  const score = calculateDailyDashboardRiskIndex({
    ownNegative: 10,
    ownCaution: 10,
    policyNegative: 10,
    industryNegative: 10,
    policyCaution: 10,
    industryCaution: 10,
  });
  assert.equal(score, 100);
});

test("canonical competitor records are counted in the GA momentum series", () => {
  const series = classifyDashboardArticleSeries({
    category: "보험사",
    aiContext: { category: "competitor", ownMentioned: false },
    title: "GA 상반기 실적 비교",
  });
  assert.equal(series, "ga");
});

test("industry records remain in the insurer momentum series", () => {
  const series = classifyDashboardArticleSeries({
    category: "업계동향",
    aiContext: { category: "industry", ownMentioned: false },
  });
  assert.equal(series, "insurance");
});

test("company and regulation classifications take precedence over GA context", () => {
  assert.equal(classifyDashboardArticleSeries({
    category: "당사",
    aiContext: { category: "own", ownMentioned: true },
    title: "인카금융서비스 GA 성과",
  }), "own");
  assert.equal(classifyDashboardArticleSeries({
    category: "정책/규제",
    aiContext: { category: "regulation", ownMentioned: false },
    title: "GA 판매수수료 제도 개편",
  }), "regulation");
});

test("composition rows reuse the latest momentum bucket without reclassifying", () => {
  const rows = buildDashboardCompositionRows([
    { own: 2, ga: 4, insurance: 7, regulation: 3 },
    { own: 1, ga: 9, insurance: 12, regulation: 17 },
  ]);

  assert.deepEqual(rows, [
    { name: "당사", value: 1 },
    { name: "GA", value: 9 },
    { name: "보험사", value: 12 },
    { name: "정책/규제", value: 17 },
  ]);
  assert.equal(rows.reduce((sum, item) => sum + item.value, 0), 39);
});
