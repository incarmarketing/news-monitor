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
  else score = 0;

  // Stored risk levels are supporting evidence only when the article tone is
  // already actionable. This prevents stale classifications from promoting a
  // neutral business article to the top of the risk queue.
  if (actionable && hasRiskLevel(riskLevels, "HIGH")) score = Math.max(score, 88);
  else if (actionable && hasRiskLevel(riskLevels, "MEDIUM")) score = Math.max(score, 66);

  if (actionable && watch) score += 3;
  const spreadBonus = actionable
    ? Math.min(6, Math.max(0, Number(relatedCount || 1) - 1))
    : 0;
  return Math.max(0, Math.min(99, Math.round(score + spreadBonus)));
}

const INSURANCE_PRIORITY_SIGNAL = /(?:\bGA\b|보험\s*GA|법인보험대리점|보험대리점|보험설계사|보험사|보험회사|보험업계|생명보험|손해보험|자동차보험|실손보험|종신보험|보장성보험|보험상품|보험계약|보험금|보험료|보험사기|불완전판매|부당승환|판매수수료|정착지원금|1200\s*%|모집질서|손해율|보험업법|보험\s*판매)/i;
const INSURANCE_COMPANY_SIGNAL = /(?:인카금융|한화생명|한화손보|한화손해보험|삼성생명|삼성화재|DB손해보험|DB생명|KB손해보험|KB라이프|교보생명|신한라이프|미래에셋생명|동양생명|메트라이프생명|KDB생명|롯데손해보험|롯데손보|현대해상|흥국생명|흥국화재|NH농협생명|NH농협손보|지에이코리아|글로벌금융판매|에이플러스에셋|영진에셋|메가금융서비스|한화생명금융서비스|[가-힣A-Za-z0-9]+(?:생명|화재|손보))/i;
const INSURANCE_POLICY_SIGNAL = /(?:보험업법|보험\s*판매|판매수수료|1200\s*%|부당승환|불완전판매|보험사기|보험설계사|보험대리점|법인보험대리점|모집질서|정착지원금|보험금\s*(?:청구|지급|편취|누수)|실손보험|자동차보험|손해율|보험\s*민원|보험\s*소비자)/i;
const NON_INSURANCE_MARKET_SIGNAL = /(?:비청산\s*장외파생|장외파생상품|파생상품거래|증거금\s*교환|금융투자업|증권사?|채권|회사채|공매도|주식|가상자산|코인|은행권?|카드사?|캐피탈|저축은행|새마을금고|가계대출|주택담보대출|부동산\s*PF|전자금융|결제대행)/i;
const MUNICIPAL_INSURANCE_SIGNAL = /(?:시민안전보험|시민보험|자전거(?:·|\s)*(?:PM|개인형\s*이동장치).*보험|군민안전보험|구민안전보험|도민안전보험)/i;

function cleanPriorityText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function priorityArticleText(article = {}) {
  const raw = article?.raw && typeof article.raw === "object" ? article.raw : {};
  return cleanPriorityText([
    article.title,
    article.description,
    raw.title,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
    article.summary,
  ].filter(Boolean).join(" "));
}

/**
 * Keeps the executive TOP 5 narrower than the monitoring feed. Collection is
 * intentionally broad, while this gate requires a material insurance/GA
 * subject before an article can compete for dashboard priority.
 */
export function isDashboardPriorityArticle(article = {}) {
  const title = cleanPriorityText(article.title || article.headline || "");
  const text = priorityArticleText(article);
  const category = String(article.category || article?.aiContext?.category || "");
  const directOwn = article.ownMentioned === true
    || article?.aiContext?.ownMentioned === true
    || /인카금융서비스|인카금융/i.test(`${title} ${text}`);

  if (directOwn) return true;

  const titleHasInsurance = INSURANCE_PRIORITY_SIGNAL.test(title) || INSURANCE_COMPANY_SIGNAL.test(title);
  const bodyHasInsurance = INSURANCE_PRIORITY_SIGNAL.test(text) || INSURANCE_COMPANY_SIGNAL.test(text);
  const policySpecific = INSURANCE_POLICY_SIGNAL.test(`${title} ${text}`);
  const categorizedPolicy = /정책|규제|금융당국|regulation|policy/i.test(category);
  const categorizedIndustry = /GA|보험사|경쟁사|업계동향|competitor|industry/i.test(category);

  // A municipal safety policy happens to use the word "insurance", but it is
  // not an insurance-company or GA management issue unless an industry actor
  // is explicitly named in the headline.
  if (MUNICIPAL_INSURANCE_SIGNAL.test(`${title} ${text}`) && !INSURANCE_COMPANY_SIGNAL.test(title)) {
    return false;
  }

  // Regulator names alone are not industry relevance. Capital-market, bank,
  // card and derivatives rules stay in monitoring but never enter TOP 5.
  if (NON_INSURANCE_MARKET_SIGNAL.test(title) && !policySpecific) {
    return false;
  }

  if (categorizedPolicy) {
    return titleHasInsurance || policySpecific;
  }
  if (categorizedIndustry) {
    return titleHasInsurance || (bodyHasInsurance && policySpecific);
  }
  return titleHasInsurance;
}

function metricObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function metricNumber(source, keys = []) {
  const object = metricObject(source);
  return keys.reduce((sum, key) => sum + Math.max(0, Number(object[key] || 0)), 0);
}

function normalizeReportDate(value) {
  const match = String(value || "").match(/(20\d{2})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function normalizeReportSlot(value) {
  const match = String(value || "").match(/(?:^|\D)(08|8|13|18)(?:\D|$)/);
  if (!match) return "";
  return match[1] === "8" ? "08" : match[1];
}

function reportRunTimestamp(row = {}) {
  const value = Date.parse(row.timestamp || row.createdAt || row.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

function scaleMetric(value, sourceTotal, targetTotal) {
  if (sourceTotal <= 0) return Math.max(0, Math.round(Number(value || 0)));
  return Math.max(0, Math.round((Number(value || 0) / sourceTotal) * targetTotal));
}

function reportRunMomentum(row = {}) {
  const metrics = metricObject(row.metrics);
  const categories = metricObject(metrics.by_category);
  const tones = metricObject(metrics.by_tone);
  const ownTones = metricObject(metrics.own_by_tone);
  const rawOwn = metricNumber(categories, ["own", "당사"]);
  const rawGa = metricNumber(categories, ["competitor", "ga", "GA", "경쟁사"]);
  const rawRegulation = metricNumber(categories, ["regulation", "policy", "정책", "규제", "정책/규제"]);
  const rawInsurance = metricNumber(categories, ["industry", "insurance", "보험사", "업계동향", "sponsorship", "other", "기타"]);
  const categoryTotal = rawOwn + rawGa + rawRegulation + rawInsurance;
  const collected = Math.max(categoryTotal, Number(metrics.total_collected || 0));
  const analyzed = Math.max(0, Number(metrics.total_after_cluster || 0)) || collected;
  const toneTotal = Math.max(1, Object.values(tones).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0));
  const ownNegative = scaleMetric(metrics.own_negative ?? ownTones.negative, collected || toneTotal, analyzed);
  const ownCaution = scaleMetric(ownTones.caution, collected || toneTotal, analyzed);
  const totalNegative = scaleMetric(tones.negative, toneTotal, analyzed);
  const totalCaution = scaleMetric(tones.caution, toneTotal, analyzed);
  const externalNegative = Math.max(0, totalNegative - ownNegative);
  const externalCaution = Math.max(0, totalCaution - ownCaution);
  const externalCategoryTotal = Math.max(1, rawGa + rawInsurance + rawRegulation);
  const policyShare = rawRegulation / externalCategoryTotal;
  const policyNegative = Math.round(externalNegative * policyShare);
  const policyCaution = Math.round(externalCaution * policyShare);

  return {
    own: scaleMetric(rawOwn, collected, analyzed),
    ga: scaleMetric(rawGa, collected, analyzed),
    insurance: scaleMetric(rawInsurance, collected, analyzed),
    regulation: scaleMetric(rawRegulation, collected, analyzed),
    ownNegative,
    ownCaution,
    policyNegative,
    industryNegative: Math.max(0, externalNegative - policyNegative),
    policyCaution,
    industryCaution: Math.max(0, externalCaution - policyCaution),
  };
}

/**
 * Restores historical dashboard days from persisted report metrics. The core
 * article snapshot is newest-first and capped, so using it for all seven days
 * creates false zeroes once older rows fall outside the cap. The current day
 * remains article-backed so the trend endpoint and composition panel match.
 */
export function mergeDashboardMomentumWithReportRuns(articleRows = [], reportRuns = []) {
  const latestRuns = new Map();
  (Array.isArray(reportRuns) ? reportRuns : []).forEach((row) => {
    const date = normalizeReportDate(row.date || row.report_date || row.reportDate || row.timestamp);
    const slot = normalizeReportSlot(row.slot || row.report_slot || row.window_label);
    if (!date || !slot) return;
    const key = `${date}|${slot}`;
    const current = latestRuns.get(key);
    if (!current || reportRunTimestamp(row) >= reportRunTimestamp(current)) latestRuns.set(key, row);
  });

  const reportDays = new Map();
  latestRuns.forEach((row, key) => {
    const date = key.slice(0, 10);
    const next = reportDays.get(date) || {
      date,
      own: 0,
      ga: 0,
      insurance: 0,
      regulation: 0,
      ownNegative: 0,
      ownCaution: 0,
      policyNegative: 0,
      industryNegative: 0,
      policyCaution: 0,
      industryCaution: 0,
    };
    const values = reportRunMomentum(row);
    Object.keys(values).forEach((metric) => { next[metric] += Number(values[metric] || 0); });
    reportDays.set(date, next);
  });

  const rows = Array.isArray(articleRows) ? articleRows : [];
  const latestArticleDate = rows.at(-1)?.date || "";
  return rows.map((row) => {
    const reportRow = reportDays.get(row.date);
    if (!reportRow || row.date === latestArticleDate) return row;
    return {
      ...row,
      ...reportRow,
      dateLabel: row.dateLabel,
      riskIndex: calculateDailyDashboardRiskIndex(reportRow),
      source: "report-runs",
    };
  });
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
