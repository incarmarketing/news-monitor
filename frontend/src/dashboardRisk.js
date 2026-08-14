const TONE_RANK = Object.freeze({
  negative: 4,
  "부정": 4,
  caution: 3,
  "주의": 3,
  positive: 2,
  "긍정": 2,
  neutral: 1,
  "중립": 1,
  exclude: 0,
  "제외": 0,
});

function normalizedToneRank(value) {
  return TONE_RANK[String(value || "").trim().toLowerCase()] || 0;
}

function hasRiskLevel(levels, expected) {
  return levels.some((value) => String(value || "").trim().toUpperCase() === expected);
}

/**
 * Maps normalized article records to the four dashboard momentum series.
 * Canonical AI context wins over localized labels so competitor records do
 * not disappear into the generic insurer series after UI normalization.
 */
export function classifyDashboardArticleSeries(article = {}) {
  const canonical = String(article?.aiContext?.category || "").trim().toLowerCase();
  const category = String(article?.category || "").trim();
  const context = `${article?.title || ""} ${article?.keyword || ""} ${article?.summary || ""}`;

  if (
    article?.ownMentioned === true
    || article?.aiContext?.ownMentioned === true
    || canonical === "own"
    || /당사/.test(category)
  ) return "own";

  if (
    canonical === "regulation"
    || canonical === "policy"
    || /정책|규제|금융당국/.test(category)
  ) return "regulation";

  if (
    canonical === "competitor"
    || canonical === "ga"
    || /GA|경쟁/.test(category)
    || /(?:^|\s)GA(?:\s|$)|법인보험대리점|보험대리점|글로벌금융판매|지에이코리아|에이플러스에셋|영진에셋|메가(?:금융|인포)?에셋/.test(context)
  ) return "ga";

  return "insurance";
}

/**
 * Converts the latest momentum bucket into the composition chart's rows.
 * Both dashboard panels must consume this same aggregate so category counts
 * cannot diverge when stored labels and canonical AI context disagree.
 */
export function buildDashboardCompositionRows(momentumRows = []) {
  const latest = Array.isArray(momentumRows) ? momentumRows.at(-1) || {} : {};
  return [
    { name: "당사", value: Number(latest.own || 0) },
    { name: "GA", value: Number(latest.ga || 0) },
    { name: "보험사", value: Number(latest.insurance || 0) },
    { name: "정책/규제", value: Number(latest.regulation || 0) },
  ];
}

/**
 * Formats a non-zero composition share without allowing a small category to
 * disappear as 0%. The visual bar keeps the exact proportional weight while
 * the label remains meaningful for operators.
 */
export function formatDashboardCompositionShare(value, total) {
  const safeValue = Math.max(0, Number(value || 0));
  const safeTotal = Math.max(0, Number(total || 0));
  if (!safeValue || !safeTotal) return "0%";
  const share = (safeValue / safeTotal) * 100;
  return share < 1 ? "<1%" : `${Math.round(share)}%`;
}

/**
 * Calculates an operational risk index, not an AI confidence score.
 * Tone and direct company impact deliberately dominate article volume.
 */
export function calculateDashboardRiskIndex({
  tones = [],
  directOwnMention = false,
  directOwnNegative = false,
  directOwnCaution = false,
  policyContext = false,
  insuranceContext = false,
  watch = false,
  riskLevels = [],
  relatedCount = 1,
} = {}) {
  const highestTone = Math.max(0, ...tones.map(normalizedToneRank));
  const negative = highestTone >= 4;
  const caution = highestTone === 3;
  const actionable = negative || caution || directOwnNegative || directOwnCaution;

  let score;
  if (directOwnNegative) score = 92;
  else if (directOwnCaution) score = 80;
  else if (negative && policyContext) score = 76;
  else if (negative && insuranceContext) score = 72;
  else if (negative) score = 68;
  else if (caution && policyContext) score = 62;
  else if (caution && insuranceContext) score = 56;
  else if (caution) score = 50;
  else if (directOwnMention && highestTone === 2) score = 24;
  else if (directOwnMention) score = 28;
  else if (policyContext) score = 20;
  else if (insuranceContext) score = highestTone === 2 ? 10 : 14;
  else score = highestTone === 2 ? 8 : 6;

  // Stored risk levels are supporting evidence only when the article tone is
  // already actionable. This prevents stale classifications from promoting a
  // neutral business article to the top of the risk queue.
  if (actionable && hasRiskLevel(riskLevels, "HIGH")) score = Math.max(score, 88);
  else if (actionable && hasRiskLevel(riskLevels, "MEDIUM")) score = Math.max(score, 66);

  if (actionable && watch) score += 3;
  const spreadBonus = Math.min(actionable ? 6 : 2, Math.max(0, Number(relatedCount || 1) - 1));
  return Math.max(0, Math.min(99, Math.round(score + spreadBonus)));
}

/**
 * Calculates a daily portfolio risk index from actionable article counts.
 * Neutral and positive coverage never contributes to this score.
 */
export function calculateDailyDashboardRiskIndex({
  ownNegative = 0,
  ownCaution = 0,
  policyNegative = 0,
  industryNegative = 0,
  policyCaution = 0,
  industryCaution = 0,
} = {}) {
  const ownNegativeScore = Math.min(60, Math.max(0, Number(ownNegative || 0)) * 30);
  const ownCautionScore = Math.min(24, Math.max(0, Number(ownCaution || 0)) * 12);
  const externalNegativeScore = Math.min(
    30,
    (Math.max(0, Number(policyNegative || 0)) + Math.max(0, Number(industryNegative || 0))) * 10,
  );
  const externalCautionScore = Math.min(
    30,
    Math.max(0, Number(policyCaution || 0)) * 5 + Math.max(0, Number(industryCaution || 0)) * 3,
  );

  return Math.min(100, Math.round(
    ownNegativeScore + ownCautionScore + externalNegativeScore + externalCautionScore,
  ));
}
