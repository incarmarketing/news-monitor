import assert from "node:assert/strict";
import test from "node:test";

import { calculateDashboardRiskIndex } from "../src/dashboardRisk.js";

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

