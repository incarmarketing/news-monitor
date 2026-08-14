import assert from "node:assert/strict";
import test from "node:test";

import { calculateDailyDashboardRiskIndex, calculateDashboardRiskIndex } from "../src/dashboardRisk.js";

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
