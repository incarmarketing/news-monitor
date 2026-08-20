import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardCompositionRows,
  calculateDailyDashboardRiskIndex,
  calculateDashboardRiskIndex,
  classifyDashboardArticleSeries,
  formatDashboardCompositionShare,
  isDashboardPriorityArticle,
  mergeDashboardMomentumWithReportRuns,
} from "../src/dashboardRisk.js";

test("neutral insurer performance does not become a high risk issue", () => {
  const score = calculateDashboardRiskIndex({ tones: ["중립"], insuranceContext: true, relatedCount: 1 });
  assert.equal(score, 0);
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
  assert.equal(score, 0);
});

test("neutral company coverage remains important but is not scored as risk", () => {
  assert.equal(calculateDashboardRiskIndex({
    tones: ["중립"],
    directOwnMention: true,
    relatedCount: 8,
  }), 0);
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

test("small composition shares remain visible inside the stacked bar", () => {
  assert.equal(formatDashboardCompositionShare(1, 100), "1%");
  assert.equal(formatDashboardCompositionShare(1, 250), "<1%");
  assert.equal(formatDashboardCompositionShare(0, 100), "0%");
});

test("composition rows keep zero-value categories for a stable dashboard table", () => {
  assert.deepEqual(buildDashboardCompositionRows([{ own: 1, insurance: 2 }]), [
    { name: "당사", value: 1 },
    { name: "GA", value: 0 },
    { name: "보험사", value: 2 },
    { name: "정책/규제", value: 0 },
  ]);
});

test("capital-market regulator news cannot enter the insurance priority board", () => {
  assert.equal(isDashboardPriorityArticle({
    title: "금감원, 비청산 장외파생상품거래 가이드라인 1년 연장",
    category: "정책/규제",
    summary: "증거금 교환 제도의 적용 기한을 연장한다.",
  }), false);
  assert.equal(isDashboardPriorityArticle({
    title: "금감원, 비청산 장외파생상품 증거금 교환 가이드라인 보험회사 적용 연장",
    category: "정책/규제",
  }), false);
});

test("municipal safety insurance renewal stays outside the executive top issues", () => {
  assert.equal(isDashboardPriorityArticle({
    title: "성남시, 자전거·PM 시민보험 갱신",
    category: "보험사",
  }), false);
});

test("material insurer and GA rules remain eligible for dashboard priority", () => {
  assert.equal(isDashboardPriorityArticle({
    title: "한화손해보험, 신계약 CSM 역대 최대",
    category: "보험사",
  }), true);
  assert.equal(isDashboardPriorityArticle({
    title: "GA 1200%룰 시행, 판매수수료 관리 강화",
    category: "정책/규제",
  }), true);
});

test("persisted report metrics restore capped historical dashboard days", () => {
  const articleRows = [
    { date: "2026-08-18", dateLabel: "8/18", own: 0, ga: 0, insurance: 0, regulation: 0, riskIndex: 0 },
    { date: "2026-08-19", dateLabel: "8/19", own: 0, ga: 1, insurance: 1, regulation: 0, riskIndex: 0 },
    { date: "2026-08-20", dateLabel: "8/20", own: 0, ga: 4, insurance: 8, regulation: 4, riskIndex: 10 },
  ];
  const reportRuns = [
    {
      date: "2026-08-18",
      slot: "08",
      timestamp: "2026-08-18T08:05:00+09:00",
      metrics: {
        total_collected: 20,
        total_after_cluster: 10,
        by_category: { own: 2, competitor: 4, industry: 10, regulation: 4 },
        by_tone: { negative: 0, caution: 4, positive: 2, neutral: 14 },
        own_negative: 0,
        own_by_tone: { caution: 2 },
      },
    },
    {
      date: "2026-08-19",
      slot: "13",
      timestamp: "2026-08-19T13:05:00+09:00",
      metrics: {
        total_collected: 10,
        total_after_cluster: 5,
        by_category: { own: 0, competitor: 4, industry: 4, regulation: 2 },
        by_tone: { negative: 0, caution: 2, positive: 0, neutral: 8 },
        own_negative: 0,
      },
    },
  ];

  const rows = mergeDashboardMomentumWithReportRuns(articleRows, reportRuns);
  assert.ok(rows[0].ga > 0);
  assert.ok(rows[0].insurance > 0);
  assert.ok(rows[0].riskIndex > 0);
  assert.equal(rows[1].source, "report-runs");
  assert.deepEqual(rows[2], articleRows[2]);
});

test("duplicate report executions use the latest run for each slot", () => {
  const rows = mergeDashboardMomentumWithReportRuns([
    { date: "2026-08-19", dateLabel: "8/19", own: 0, ga: 0, insurance: 0, regulation: 0, riskIndex: 0 },
    { date: "2026-08-20", dateLabel: "8/20", own: 0, ga: 1, insurance: 1, regulation: 0, riskIndex: 0 },
  ], [
    {
      date: "2026-08-19", slot: "13", timestamp: "2026-08-19T13:01:00+09:00",
      metrics: { total_collected: 10, total_after_cluster: 10, by_category: { competitor: 10 }, by_tone: { neutral: 10 } },
    },
    {
      date: "2026-08-19", slot: "13", timestamp: "2026-08-19T13:09:00+09:00",
      metrics: { total_collected: 4, total_after_cluster: 4, by_category: { competitor: 4 }, by_tone: { neutral: 4 } },
    },
  ]);

  assert.equal(rows[0].ga, 4);
});
