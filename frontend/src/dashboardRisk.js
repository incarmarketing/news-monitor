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

