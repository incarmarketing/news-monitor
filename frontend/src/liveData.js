const DASHBOARD_SESSION_KEY = "marketing_pr_session_v1";

const SUPABASE_CONFIG_PATHS = [
  "/data/supabase.json",
  "/public/data/supabase.json",
  `${import.meta.env.BASE_URL || "/"}data/supabase.json`,
  "/supabase.json",
];

const STATIC_DATA_PATHS = [
  "/data/articles.json",
  "/public/data/articles.json",
  `${import.meta.env.BASE_URL || "/"}data/articles.json`,
];

const STOCK_MARKET_DATA_PATHS = [
  "/data/stock-market.json",
  "/public/data/stock-market.json",
  `${import.meta.env.BASE_URL || "/"}data/stock-market.json`,
];

const STOCK_LISTING_NOISE_TITLE_RE = /(?:\[?52주\]?\s*)?(?:최저가|최고가)|장중\s*(?:신저가|신고가)|강세\s*토픽|약세\s*토픽|특징주|오전\s*이슈\s*\[보험\]|\[리스트\]|MVP\s*상위|상위\s*\d+\s*선/;
const INVESTMENT_REPORT_RE = /투자의견|목표주가|목표가|증권가|리포트|애널리스트/;
const OWN_NAME_RE = /인카금융서비스|인카금융/;

function isExpired(session) {
  return !session?.session_expires_at || new Date(session.session_expires_at).getTime() <= Date.now();
}

export function getStoredSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(DASHBOARD_SESSION_KEY) || "null");
    if (!session?.session_token || isExpired(session)) {
      sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
    return null;
  }
}

export function saveDashboardSession(session) {
  if (session?.session_token) {
    sessionStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify(session));
  }
}

async function fetchJson(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`request_${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function loadSupabaseConfig() {
  for (const path of SUPABASE_CONFIG_PATHS) {
    try {
      const config = await fetchJson(path);
      if (config?.url && config?.anon_key) return config;
    } catch {
      // Try the next path. The Vite dev server exposes /data through vite.config.js.
    }
  }
  return null;
}

async function dashboardApi(config, session, action, payload = {}, options = {}) {
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  if (!session?.session_token && !options.allowAnonymous) throw new Error("missing_dashboard_session");
  const headers = {
    apikey: config.anon_key,
    Authorization: `Bearer ${config.anon_key}`,
    "Content-Type": "application/json",
  };
  if (session?.session_token && !options.allowAnonymous) {
    headers["X-Dashboard-Session"] = session.session_token;
  }
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/dashboard-api`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
    throw new Error(data?.error || `dashboard_api_${response.status}`);
  }
  return data;
}

async function rest(config, session, path) {
  const result = await dashboardApi(config, session, "rest", { path, method: "GET" });
  return result && Object.prototype.hasOwnProperty.call(result, "data") ? result.data : result;
}

async function publicRest(config, path) {
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `supabase_public_${response.status}`);
  return data;
}

export async function triggerNewsCollection(payload = {}) {
  const config = await loadSupabaseConfig();
  const session = getStoredSession();
  return dashboardApi(config, session, "trigger_collection", {
    workflow: payload.workflow || "news-briefing.yml",
    period_reports: payload.period_reports || "none",
    send_kakao: payload.send_kakao === true,
    report_slot: payload.report_slot || "auto",
    source: payload.source || "dashboard_manual_refresh",
  }, { allowAnonymous: true });
}

async function writeRest(path, method, body, headers = {}) {
  const config = await loadSupabaseConfig();
  const session = getStoredSession();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  if (!session?.session_token) throw new Error("missing_dashboard_session");
  const result = await dashboardApi(config, session, "rest", { path, method, body, headers });
  return result && Object.prototype.hasOwnProperty.call(result, "data") ? result.data : result;
}

export async function savePressAlias(host, pressName) {
  const cleanHost = String(host || "").trim().toLowerCase();
  const cleanName = String(pressName || "").trim();
  if (!cleanHost || !cleanName) throw new Error("host_and_press_required");
  return writeRest(
    "press_aliases?on_conflict=host",
    "POST",
    [{ host: cleanHost, press_name: cleanName }],
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
}

export async function saveMediaRelation(media = {}) {
  const name = String(media.name || "").trim();
  if (!name) throw new Error("media_name_required");
  const body = {
    name,
    url: String(media.url || "").trim(),
    status: String(media.status || "중립").trim() || "중립",
    grade: String(media.grade || "B").trim() || "B",
    owner: String(media.owner || "").trim(),
    contact_date: media.contactDate || media.contact_date || null,
    beat: String(media.beat || "").trim(),
    lead_reporter: String(media.leadReporter || media.lead_reporter || "").trim(),
    email: String(media.email || "").trim(),
    phone: String(media.phone || "").trim(),
    memo: String(media.memo || "").trim(),
    hidden: media.hidden === true,
  };
  return writeRest(
    "media_relations?on_conflict=name",
    "POST",
    [body],
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
}

export async function saveMonitorKeyword(keyword, category = "other") {
  const cleanKeyword = String(keyword || "").trim();
  const cleanCategory = String(category || "other").trim() || "other";
  if (!cleanKeyword) throw new Error("keyword_required");
  return writeRest(
    "monitor_keywords?on_conflict=keyword,category",
    "POST",
    [{ keyword: cleanKeyword, category: cleanCategory, enabled: true }],
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
}

export async function saveClassificationFeedback(article = {}, correction = {}) {
  const title = String(article.title || "").trim();
  const articleHash = stableArticleHash(article);
  if (!title && !articleHash) throw new Error("feedback_article_required");
  const feedback = await writeRest(
    "classification_feedback",
    "POST",
    [{
      article_hash: articleHash || null,
      title,
      link: String(article.link || "").trim(),
      previous_category: String(article.category || article.category_label || "").trim(),
      previous_tone: String(article.tone || article.tone_label || "").trim(),
      corrected_category: String(correction.category || "").trim(),
      corrected_tone: String(correction.tone || "").trim(),
      reason: String(correction.reason || "").trim(),
      created_by: String(correction.createdBy || "").trim(),
    }],
    { Prefer: "return=representation" },
  );
  const patch = articlePatchFromCorrection(correction);
  let patched = false;
  let patchError = "";
  if (Object.keys(patch).length) {
    const target = articleHash
      ? `news_articles?article_hash=eq.${encodeURIComponent(articleHash)}`
      : article.link
        ? `news_articles?link=eq.${encodeURIComponent(String(article.link).trim())}`
        : "";
    if (target) {
      try {
        await writeRest(target, "PATCH", patch, { Prefer: "return=minimal" });
        patched = true;
      } catch (error) {
        patchError = error?.message || "article_patch_failed";
      }
    }
  }
  return { feedback, patched, patchError };
}

export async function saveArticleScrap(article = {}) {
  const articleHash = stableArticleHash(article) || stableArticleKey(article);
  const title = String(article.title || "").trim();
  if (!articleHash || !title) throw new Error("scrap_article_required");
  const snapshot = articleSnapshotForScrap(article, articleHash);
  return writeRest(
    "article_scraps?on_conflict=article_hash",
    "POST",
    [{
      article_hash: articleHash,
      article_snapshot: snapshot,
      created_by: "dashboard",
    }],
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
}

export async function generateScrapAnalysisWithGemini(payload = {}) {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = getStoredSession();
  const headers = {
    apikey: config.anon_key,
    Authorization: `Bearer ${config.anon_key}`,
    "Content-Type": "application/json",
  };
  if (session?.session_token) {
    headers["X-Dashboard-Session"] = session.session_token;
  }
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/analyze-scraps`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `analyze_scraps_${response.status}`);
  }
  return data;
}

export async function saveScrapAnalysisReport(payload = {}) {
  const report = payload.report && typeof payload.report === "object" ? payload.report : {};
  const articles = Array.isArray(payload.articles) ? payload.articles : [];
  const articleHashes = articles
    .map((article) => stableArticleHash(article) || stableArticleKey(article))
    .filter(Boolean);
  const title = String(report.title || payload.title || "스크랩 기사 분석 보고서").trim();
  const row = {
    title,
    prompt: String(payload.prompt || "").trim(),
    report,
    analysis: String(payload.analysis || "").trim(),
    article_count: Number(payload.articleCount || articles.length || 0),
    article_hashes: articleHashes,
    model: String(payload.model || "").trim(),
    usage: payload.usageMetadata || payload.usage || {},
    status: "completed",
    created_by: "dashboard",
  };
  try {
    const saved = await writeRest(
      "clipping_analysis_reports",
      "POST",
      [row],
      { Prefer: "return=representation" },
    );
    return normalizeClippingAnalysisReport(Array.isArray(saved) ? saved[0] : saved);
  } catch (error) {
    const fallbackHash = `clip_report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const fallback = await writeRest(
      "article_scraps?on_conflict=article_hash",
      "POST",
      [{
        article_hash: fallbackHash,
        article_snapshot: {
          type: "analysis_report",
          ...row,
        },
        created_by: "dashboard",
      }],
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
    return normalizeClippingAnalysisReportFromScrap(Array.isArray(fallback) ? fallback[0] : fallback);
  }
}

export async function generatePressReleaseWithGemini(payload = {}) {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = getStoredSession();
  const headers = {
    apikey: config.anon_key,
    Authorization: `Bearer ${config.anon_key}`,
    "Content-Type": "application/json",
  };
  if (session?.session_token) {
    headers["X-Dashboard-Session"] = session.session_token;
  }
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/generate-press-release`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error || `generate_press_release_${response.status}`);
  }
  return data;
}

function stableArticleHash(article = {}) {
  const candidates = [article.article_hash, article.articleHash, article.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return candidates.find((value) => /^[a-f0-9]{32,64}$/i.test(value)) || "";
}

function stableArticleKey(article = {}) {
  const raw = [
    article.link,
    article.title,
    article.source,
    article.date || article.report_date || article.pubDate,
  ].map((value) => String(value || "").trim()).filter(Boolean).join("|");
  if (!raw) return "";
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `scrap_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function articleSnapshotForScrap(article = {}, articleHash = "") {
  return {
    article_hash: articleHash,
    title: article.title || "",
    link: article.link || "",
    source: article.source || "",
    keyword: article.keyword || "",
    summary: article.summary || "",
    pub_date: article.pubDate || article.pub_date || article.date || "",
    report_date: article.date || article.report_date || "",
    report_slot: article.slot || article.report_slot || "",
    score: article.score || 0,
    category: article.category || article.category_label || "",
    tone: article.tone || article.tone_label || "",
    ai_context: article.aiContext || {},
    clipping_recommended: article.clippingRecommended === true,
    clipping_reason: article.clippingReason || "",
    risk_level: article.riskLevel || article.risk_level || "",
    cluster_size: article.relatedCount || article.cluster_size || article.clusterSize || 1,
  };
}

function articlePatchFromCorrection(correction = {}) {
  const category = backendCategory(correction.category);
  const tone = backendTone(correction.tone);
  const patch = {};
  if (category) patch.category = category;
  if (tone) patch.tone = tone;
  if (tone === "exclude") patch.status = "excluded_by_feedback";
  return patch;
}

function backendCategory(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (!text) return "";
  if (["own", "company"].includes(canonical) || /당사|인카/.test(text)) return "own";
  if (["regulation", "policy"].includes(canonical) || /정책|규제|당국|수수료/.test(text)) return "regulation";
  if (["competitor"].includes(canonical) || /ga|보험사|경쟁사|글로벌금융|메가|설계사/i.test(text)) return "competitor";
  if (["industry", "market"].includes(canonical) || /업계|동향|시장/.test(text)) return "industry";
  if (["exclude", "noise"].includes(canonical) || /제외|노이즈/.test(text)) return "other";
  if (["other"].includes(canonical) || /기타/.test(text)) return "other";
  return "";
}

function backendTone(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (!text) return "";
  if (["exclude", "noise", "excluded"].includes(canonical) || /제외|노이즈/.test(text)) return "exclude";
  if (["negative", "high"].includes(canonical) || /부정|위험|악재/.test(text)) return "negative";
  if (["caution", "medium", "warning"].includes(canonical) || /주의|경계/.test(text)) return "caution";
  if (["positive"].includes(canonical) || /긍정|호재/.test(text)) return "positive";
  if (["neutral"].includes(canonical) || /중립/.test(text)) return "neutral";
  return "";
}

export async function saveReporterProfile(reporter = {}) {
  const name = String(reporter.name || "").trim();
  const media = String(reporter.media || reporter.outlet || "").trim();
  if (!name || !media) throw new Error("reporter_required");
  const body = {
    name,
    media,
    beat: String(reporter.beat || "").trim(),
    status: String(reporter.status || "중립").trim() || "중립",
    contact_date: reporter.contactDate || reporter.contact_date || null,
    email: String(reporter.email || "").trim(),
    phone: String(reporter.phone || "").trim(),
    request: String(reporter.request || "").trim(),
    memo: String(reporter.memo || "").trim(),
  };
  const id = reporter.id && /^\d+$/.test(String(reporter.id)) ? String(reporter.id) : "";
  if (id) {
    return writeRest(
      `reporters?id=eq.${encodeURIComponent(id)}`,
      "PATCH",
      body,
      { Prefer: "return=representation" },
    );
  }
  return writeRest(
    "reporters",
    "POST",
    [body],
    { Prefer: "return=representation" },
  );
}

export async function deleteReporterProfile(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId || !/^\d+$/.test(cleanId)) throw new Error("remote_reporter_id_required");
  return writeRest(
    `reporters?id=eq.${encodeURIComponent(cleanId)}`,
    "DELETE",
    null,
    { Prefer: "return=minimal" },
  );
}

async function fetchTable(config, session, table, query, pageSize = 1000, maxRows = 50000) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const connector = query ? "&" : "";
    const page = await rest(config, session, `${table}?${query}${connector}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page)) return offset === 0 ? [] : rows;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchPublicTable(config, table, query, pageSize = 1000, maxRows = 50000) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const connector = query ? "&" : "";
    const page = await publicRest(config, `${table}?${query}${connector}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page)) return offset === 0 ? [] : rows;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function verifyDashboardLogin(employeeNo, password) {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = await fetchJson(`${config.url.replace(/\/$/, "")}/rest/v1/rpc/verify_dashboard_login`, {
    method: "POST",
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_employee_no: employeeNo, p_password: password }),
  });
  if (session?.ok) saveDashboardSession(session);
  return session;
}

export async function loadOperationalData() {
  const base = {
    source: "static",
    status: "loading",
    message: "누적 데이터 확인 중",
    articles: [],
    notifications: [],
    watchRuns: [],
    reportRuns: [],
    scraps: [],
    scrapAnalysisReports: [],
    mediaRelations: [],
    reporters: [],
    ads: [],
    aliases: [],
    keywords: [],
    riskDrafts: [],
    feedback: [],
    feedbackGeneratedAt: "",
    aiStatus: null,
    qualityChecks: null,
    stockMarket: null,
    gaIntel: null,
    session: null,
  };

  try {
    const stockMarket = await loadStockMarketData();
    const session = getStoredSession();
    if (session?.session_token) {
      const remoteData = await loadOperationalDataFromSupabaseSession();
      if (remoteData?.status === "live") return { ...remoteData, stockMarket };
    }
    const publicData = await loadOperationalDataFromSupabasePublic();
    if (publicData?.status === "live") return { ...publicData, stockMarket };
    const staticData = await loadStaticOperationalData();
    if (staticData) return { ...staticData, stockMarket: staticData.stockMarket || stockMarket };
    return { ...base, stockMarket, status: "empty", message: "누적 데이터 없음" };
  } catch (error) {
    return { ...base, status: "error", message: error?.message || "누적 데이터 연결 실패" };
  }
}

export async function loadStockMarketData() {
  for (const path of STOCK_MARKET_DATA_PATHS) {
    try {
      const payload = await fetchJson(path);
      if (payload?.company || payload?.indices?.length) return normalizeStockMarket(payload);
    } catch {
      // Try the next path.
    }
  }
  return null;
}

function normalizeStockMarket(payload) {
  return {
    ...payload,
    indices: Array.isArray(payload?.indices) ? payload.indices : [],
    peerGroups: Array.isArray(payload?.peer_groups) ? payload.peer_groups : [],
    relativeTrend: Array.isArray(payload?.relative_trend) ? payload.relative_trend : [],
    dartDisclosures: normalizeDartDisclosures(payload?.dart_disclosures || payload?.dartDisclosures),
    summary: payload?.summary || {},
  };
}

function normalizeDartDisclosures(payload) {
  if (Array.isArray(payload)) {
    return { status: payload.length ? "ok" : "empty", items: payload };
  }
  return {
    ...(payload || {}),
    status: payload?.status || (Array.isArray(payload?.items) && payload.items.length ? "ok" : "empty"),
    items: Array.isArray(payload?.items) ? payload.items : [],
  };
}

function normalizeGaIntel(payload = {}) {
  return {
    ...payload,
    labels: Array.isArray(payload.labels) ? payload.labels : [],
    companies: Array.isArray(payload.companies) ? payload.companies : [],
    market: Array.isArray(payload.market) ? payload.market : [],
    revenueTracker: Array.isArray(payload.revenueTracker || payload.revenue_tracker)
      ? (payload.revenueTracker || payload.revenue_tracker)
      : [],
  };
}

function normalizeGaIntelFromTables({ companies = [], disclosureMetrics = [], revenueMetrics = [], marketMetrics = [] }) {
  if (!Array.isArray(companies) || !companies.length || !Array.isArray(disclosureMetrics) || !disclosureMetrics.length) {
    return null;
  }
  const periods = Array.from(new Set(disclosureMetrics.map((row) => row.period_label || standMmLabel(row.stand_mm)).filter(Boolean)));
  const order = new Map(periods.map((label, index) => [label, index]));
  const byCompany = new Map();
  companies.forEach((row) => {
    const name = String(row.name || "").trim();
    if (!name) return;
    byCompany.set(name, {
      name,
      short: row.short_name || name,
      displayOrder: Number(row.display_order || 999),
      plannerTrend: Array(periods.length).fill(null),
      stayTrend: Array(periods.length).fill(null),
      retention13LifeTrend: Array(periods.length).fill(null),
      retention25LifeTrend: Array(periods.length).fill(null),
      poorSalesLifeTrend: Array(periods.length).fill(null),
    });
  });
  disclosureMetrics.forEach((row) => {
    const name = String(row.company_name || "").trim();
    const label = row.period_label || standMmLabel(row.stand_mm);
    const index = order.get(label);
    if (!name || index === undefined) return;
    if (!byCompany.has(name)) {
      byCompany.set(name, {
        name,
        short: name,
        displayOrder: 999,
        plannerTrend: Array(periods.length).fill(null),
        stayTrend: Array(periods.length).fill(null),
        retention13LifeTrend: Array(periods.length).fill(null),
        retention25LifeTrend: Array(periods.length).fill(null),
        poorSalesLifeTrend: Array(periods.length).fill(null),
      });
    }
    const target = byCompany.get(name);
    target.plannerTrend[index] = numberOrNull(row.planners);
    target.stayTrend[index] = numberOrNull(row.stay_rate);
    target.retention13LifeTrend[index] = numberOrNull(row.retention_13_life);
    target.retention25LifeTrend[index] = numberOrNull(row.retention_25_life);
    target.poorSalesLifeTrend[index] = numberOrNull(row.poor_sales_life);
  });
  const companyRows = Array.from(byCompany.values()).sort((a, b) => {
    const left = Number(a.displayOrder || 999);
    const right = Number(b.displayOrder || 999);
    if (left !== right) return left - right;
    return String(a.short).localeCompare(String(b.short), "ko");
  });
  const revenueTracker = (Array.isArray(revenueMetrics) ? revenueMetrics : [])
    .map((row) => ({
      companyName: row.company_name || "",
      period: row.period_key || row.period_label || "",
      label: row.period_label || row.period_key || "",
      amount: row.amount_krw_100m,
      status: row.status || "",
      sourceLabel: row.source_label || "",
      sourceUrl: row.source_url || "",
      note: row.note || "",
    }));
  const market = (Array.isArray(marketMetrics) ? marketMetrics : []).map((row) => ({
    period: row.period_label || standMmLabel(row.stand_mm),
    standMm: row.stand_mm || "",
    companies: numberOrNull(row.companies_count),
    planners: numberOrNull(row.total_planners),
    stay: numberOrNull(row.stay_rate),
    retention13Life: numberOrNull(row.retention_13_life),
    retention25Life: numberOrNull(row.retention_25_life),
    poorSalesLife: numberOrNull(row.poor_sales_life),
  }));
  return {
    source: {
      title: "Supabase GA 업계 동향 원장",
      updatedAt: new Date().toISOString().slice(0, 10),
      note: "운영 DB에서 읽은 통합공시·매출 추적 데이터입니다.",
    },
    labels: periods,
    companyKey: "인카금융서비스",
    companies: companyRows,
    revenueTracker,
    market,
  };
}

function standMmLabel(value) {
  const text = String(value || "").trim();
  if (!/^\d{6}$/.test(text)) return text;
  const year = text.slice(0, 4);
  const month = text.slice(4, 6);
  return month === "06" ? `${year}.6` : year;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadStaticOperationalData() {
  for (const path of STATIC_DATA_PATHS) {
    try {
      const payload = await fetchJson(path);
      const articles = Array.isArray(payload?.articles) ? deduplicateArticles(payload.articles.map(normalizeArticle).filter(Boolean)) : [];
      const reportRuns = Array.isArray(payload?.report_runs) ? payload.report_runs.map(normalizeReportRun) : [];
      if (!articles.length && !reportRuns.length) continue;
      const rawScraps = Array.isArray(payload?.scraps) ? payload.scraps : [];
      const storedScrapReports = rawScraps.map(normalizeClippingAnalysisReportFromScrap).filter(Boolean);
      const directScrapReports = Array.isArray(payload?.clipping_analysis_reports)
        ? payload.clipping_analysis_reports.map(normalizeClippingAnalysisReport).filter(Boolean)
        : [];
      return {
        source: "static",
        status: "live",
        message: `누적 데이터 ${articles.length.toLocaleString("ko-KR")}건`,
        articles,
        notifications: Array.isArray(payload?.notifications) ? payload.notifications.map(normalizeNotification) : [],
        watchRuns: Array.isArray(payload?.watch_runs) ? payload.watch_runs.map(normalizeWatchRun) : [],
        reportRuns,
        scraps: rawScraps.map(normalizeScrap).filter(Boolean),
        scrapAnalysisReports: mergeScrapAnalysisReportRows(directScrapReports, storedScrapReports),
        mediaRelations: Array.isArray(payload?.media_relations)
          ? payload.media_relations.filter((row) => !row.hidden).map(normalizeMedia)
          : [],
        reporters: Array.isArray(payload?.reporters) ? payload.reporters.map(normalizeReporter) : [],
        ads: Array.isArray(payload?.ads) ? payload.ads.map(normalizeAd) : [],
        aliases: Array.isArray(payload?.aliases) ? payload.aliases : [],
        keywords: Array.isArray(payload?.keywords) ? payload.keywords.map(normalizeKeyword).filter(Boolean) : [],
        feedback: Array.isArray(payload?.classification_feedback) ? payload.classification_feedback.map(normalizeFeedback).filter(Boolean) : [],
        feedbackGeneratedAt: payload?.classification_feedback_generated_at || "",
        aiStatus: payload?.ai_status || null,
        qualityChecks: payload?.quality_checks || null,
        stockMarket: payload?.stock_market ? normalizeStockMarket(payload.stock_market) : null,
        gaIntel: payload?.ga_competitor ? normalizeGaIntel(payload.ga_competitor) : null,
        session: null,
      };
    } catch {
      // Try the next path.
    }
  }
  return null;
}

async function loadOperationalDataFromSupabaseSession() {
  const base = {
    source: "sample",
    status: "sample",
    message: "샘플 데이터",
    articles: [],
    notifications: [],
    watchRuns: [],
    reportRuns: [],
    scraps: [],
    scrapAnalysisReports: [],
    mediaRelations: [],
    reporters: [],
    ads: [],
    aliases: [],
    keywords: [],
    feedback: [],
    feedbackGeneratedAt: "",
    aiStatus: null,
    qualityChecks: null,
    gaIntel: null,
    session: getStoredSession(),
  };

  try {
    const config = await loadSupabaseConfig();
    const session = getStoredSession();
    if (!config?.url || !config?.anon_key) {
      return { ...base, message: "Supabase 설정 대기" };
    }
    if (!session?.session_token) {
      return { ...base, message: "운영 로그인 필요" };
    }

    const articles = await fetchTable(
      config,
      session,
      "news_articles",
      [
        "select=article_hash,report_date,report_slot,window_label,title,link,source,keyword,summary,pub_date,pub_date_raw,score,category,tone,own_mentioned,negative_target,classification_evidence,classification_reason,classification_confidence,classification_provider,clipping_recommended,clipping_reason,risk_level,status,cluster_size,raw",
        "order=report_date.desc,score.desc",
      ].join("&"),
      1000,
      50000,
    );
    const optionalRequests = {
      notifications: rest(
        config,
        session,
        "notification_sends?select=id,sent_at,channel,message_type,title,body,link_url,status,error,created_at&order=sent_at.desc&limit=80",
      ),
      watchRuns: rest(
        config,
        session,
        "negative_watch_runs?select=run_key,scanned_at,minutes_back,scanned_count,negative_count,new_negative_count,status,message&order=scanned_at.desc&limit=20",
      ),
      reportRuns: rest(
        config,
        session,
        "report_runs?select=run_key,report_date,report_slot,timestamp,window_label,risk_level,metrics&order=report_date.desc,report_slot.desc&limit=500",
      ),
      scraps: rest(
        config,
        session,
        "article_scraps?select=article_hash,article_snapshot,created_at&order=created_at.desc&limit=100",
      ),
      scrapAnalysisReports: rest(
        config,
        session,
        "clipping_analysis_reports?select=id,title,prompt,report,analysis,article_count,article_hashes,model,usage,status,created_by,created_at,updated_at&order=created_at.desc&limit=50",
      ),
      mediaRelations: rest(config, session, "media_relations?select=name,url,status,grade,owner,contact_date,beat,lead_reporter,email,phone,memo,hidden&order=name.asc"),
      reporters: rest(config, session, "reporters?select=id,name,media,beat,status,contact_date,email,phone,request,memo,updated_at&order=updated_at.desc&limit=500"),
      ads: rest(config, session, "ad_spends?select=id,media,spend_month,amount,spend_type,memo,updated_at&order=spend_month.desc,updated_at.desc&limit=500"),
      aliases: rest(config, session, "press_aliases?select=host,press_name&order=press_name.asc,host.asc&limit=1000"),
      keywords: rest(config, session, "monitor_keywords?select=keyword,category,enabled&enabled=eq.true&order=category.asc,created_at.asc&limit=1000"),
      riskDrafts: rest(config, session, "risk_response_drafts?select=id,article_hash,draft_type,title,link,source,tone,risk_level,issue,draft,status,model,context,created_by,created_at,updated_at&order=created_at.desc&limit=200"),
      feedback: rest(config, session, "classification_feedback?select=id,article_hash,title,link,previous_category,previous_tone,corrected_category,corrected_tone,reason,created_by,created_at&order=created_at.desc&limit=500"),
      gaCompanies: rest(config, session, "ga_companies?select=name,short_name,display_order,active&active=eq.true&order=display_order.asc,name.asc&limit=200"),
      gaDisclosureMetrics: rest(config, session, "ga_disclosure_metrics?select=company_name,stand_mm,period_label,planners,stay_rate,retention_13_life,retention_25_life,poor_sales_life,source_url,collected_at&order=stand_mm.asc,company_name.asc&limit=5000"),
      gaRevenueMetrics: rest(config, session, "ga_revenue_metrics?select=company_name,period_key,period_label,amount_krw_100m,status,source_label,source_url,note,confirmed_at&order=period_key.asc&limit=500"),
      gaMarketMetrics: rest(config, session, "ga_market_metrics?select=stand_mm,period_label,companies_count,total_planners,stay_rate,retention_13_life,retention_25_life,poor_sales_life,collected_at&order=stand_mm.asc&limit=500"),
    };
    const optionalEntries = await Promise.allSettled(
      Object.entries(optionalRequests).map(async ([key, promise]) => [key, await promise]),
    );
    const optionalData = {};
    const optionalErrors = [];
    optionalEntries.forEach((entry) => {
      if (entry.status === "fulfilled") {
        optionalData[entry.value[0]] = entry.value[1];
      } else {
        optionalErrors.push(entry.reason?.message || "optional_load_failed");
      }
    });
    const {
      notifications = [],
      watchRuns = [],
      reportRuns = [],
      scraps = [],
      scrapAnalysisReports = [],
      mediaRelations = [],
      reporters = [],
      ads = [],
      aliases = [],
      keywords = [],
      riskDrafts = [],
      feedback = [],
      gaCompanies = [],
      gaDisclosureMetrics = [],
      gaRevenueMetrics = [],
      gaMarketMetrics = [],
    } = optionalData;
    const message = optionalErrors.length
      ? `운영 DB 연결 · 일부 원장 확인 필요 ${optionalErrors.length}건`
      : "운영 DB 연결";

    const rawScraps = Array.isArray(scraps) ? scraps : [];
    const storedScrapReports = rawScraps.map(normalizeClippingAnalysisReportFromScrap).filter(Boolean);
    const directScrapReports = Array.isArray(scrapAnalysisReports)
      ? scrapAnalysisReports.map(normalizeClippingAnalysisReport).filter(Boolean)
      : [];

    return {
      source: "supabase",
      status: "live",
      message,
      articles: Array.isArray(articles) ? deduplicateArticles(articles.map(normalizeArticle).filter(Boolean)) : [],
      notifications: Array.isArray(notifications) ? notifications.map(normalizeNotification) : [],
      watchRuns: Array.isArray(watchRuns) ? watchRuns.map(normalizeWatchRun) : [],
      reportRuns: Array.isArray(reportRuns) ? reportRuns.map(normalizeReportRun) : [],
      scraps: rawScraps.map(normalizeScrap).filter(Boolean),
      scrapAnalysisReports: mergeScrapAnalysisReportRows(directScrapReports, storedScrapReports),
      mediaRelations: Array.isArray(mediaRelations) ? mediaRelations.filter((row) => !row.hidden).map(normalizeMedia) : [],
      reporters: Array.isArray(reporters) ? reporters.map(normalizeReporter) : [],
      ads: Array.isArray(ads) ? ads.map(normalizeAd) : [],
      aliases: Array.isArray(aliases) ? aliases : [],
      keywords: Array.isArray(keywords) ? keywords.map(normalizeKeyword).filter(Boolean) : [],
      riskDrafts: Array.isArray(riskDrafts) ? riskDrafts.map(normalizeRiskDraft).filter(Boolean) : [],
      feedback: Array.isArray(feedback) ? feedback.map(normalizeFeedback).filter(Boolean) : [],
      feedbackGeneratedAt: new Date().toISOString(),
      dataLoadWarnings: optionalErrors,
      aiStatus: null,
      qualityChecks: null,
      gaIntel: normalizeGaIntelFromTables({
        companies: gaCompanies,
        disclosureMetrics: gaDisclosureMetrics,
        revenueMetrics: gaRevenueMetrics,
        marketMetrics: gaMarketMetrics,
      }),
      session,
    };
  } catch (error) {
    return { ...base, status: "error", message: error?.message || "운영 데이터 연결 실패" };
  }
}

async function loadOperationalDataFromSupabasePublic() {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) return null;

  try {
    const articles = await fetchPublicTable(
      config,
      "news_articles",
      [
        "select=article_hash,report_date,report_slot,window_label,title,link,source,keyword,summary,pub_date,pub_date_raw,score,category,tone,own_mentioned,negative_target,classification_evidence,classification_reason,classification_confidence,classification_provider,clipping_recommended,clipping_reason,risk_level,status,cluster_size",
        "order=report_date.desc,score.desc",
      ].join("&"),
      1000,
      50000,
    );
    const optionalRequests = {
      reportRuns: publicRest(
        config,
        "report_runs?select=run_key,report_date,report_slot,timestamp,window_label,risk_level,metrics&order=report_date.desc,report_slot.desc&limit=500",
      ),
      mediaRelations: publicRest(config, "media_relations?select=name,url,status,grade,owner,contact_date,beat,lead_reporter,email,phone,memo,hidden&order=name.asc"),
      aliases: publicRest(config, "press_aliases?select=host,press_name&order=press_name.asc,host.asc&limit=1000"),
      keywords: publicRest(config, "monitor_keywords?select=keyword,category,enabled&enabled=eq.true&order=category.asc,created_at.asc&limit=1000"),
    };
    const optionalEntries = await Promise.allSettled(
      Object.entries(optionalRequests).map(async ([key, promise]) => [key, await promise]),
    );
    const optionalData = {};
    optionalEntries.forEach((entry) => {
      if (entry.status === "fulfilled") optionalData[entry.value[0]] = entry.value[1];
    });
    const normalizedArticles = Array.isArray(articles)
      ? deduplicateArticles(articles.map(normalizeArticle).filter(Boolean))
      : [];
    if (!normalizedArticles.length && !Array.isArray(optionalData.reportRuns)) return null;
    return {
      source: "supabase",
      status: "live",
      message: `운영 DB 연결 · 기사 ${normalizedArticles.length.toLocaleString("ko-KR")}건`,
      articles: normalizedArticles,
      notifications: [],
      watchRuns: [],
      reportRuns: Array.isArray(optionalData.reportRuns) ? optionalData.reportRuns.map(normalizeReportRun) : [],
      scraps: [],
      scrapAnalysisReports: [],
      mediaRelations: Array.isArray(optionalData.mediaRelations)
        ? optionalData.mediaRelations.filter((row) => !row.hidden).map(normalizeMedia)
        : [],
      reporters: [],
      ads: [],
      aliases: Array.isArray(optionalData.aliases) ? optionalData.aliases : [],
      keywords: Array.isArray(optionalData.keywords) ? optionalData.keywords.map(normalizeKeyword).filter(Boolean) : [],
      feedback: [],
      feedbackGeneratedAt: "",
      aiStatus: null,
      qualityChecks: null,
      gaIntel: null,
      session: null,
    };
  } catch {
    return null;
  }
}

export async function generateRiskResponseWithGemini(payload = {}) {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = getStoredSession();
  const headers = {
    apikey: config.anon_key,
    Authorization: `Bearer ${config.anon_key}`,
    "Content-Type": "application/json",
  };
  if (session?.session_token) {
    headers["X-Dashboard-Session"] = session.session_token;
  }
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/generate-risk-response`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.error || `generate_risk_response_${response.status}`);
  }
  return data;
}

function normalizeKeyword(row) {
  const keyword = typeof row === "string" ? row : row?.keyword;
  if (!keyword) return null;
  return {
    keyword: String(keyword).trim(),
    category: row?.category || "other",
    enabled: row?.enabled !== false,
  };
}

function normalizeRiskDraft(row) {
  if (!row?.draft || !row?.title) return null;
  return {
    id: row.id || `${row.article_hash || row.link || row.title}-${row.draft_type}`,
    articleHash: row.article_hash || "",
    draftType: row.draft_type || "press",
    title: row.title || "",
    link: row.link || "",
    source: row.source || "",
    tone: normalizeTone(row.tone) || "부정",
    riskLevel: String(row.risk_level || "").toUpperCase(),
    issue: row.issue || "",
    draft: row.draft || "",
    status: row.status || "draft",
    model: row.model || "",
    context: row.context || {},
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    date: formatArticleDate(row.created_at) || String(row.created_at || "").slice(0, 10),
    time: formatTime(row.created_at),
  };
}

function normalizeClippingAnalysisReport(row) {
  if (!row?.report && !row?.analysis && !row?.title) return null;
  const report = row.report && typeof row.report === "object" ? row.report : {};
  const createdAt = row.created_at || row.createdAt || "";
  return {
    id: row.id || `${createdAt}-${row.title || "clipping"}`,
    title: row.title || report.title || "스크랩 기사 분석 보고서",
    prompt: row.prompt || "",
    report,
    analysis: row.analysis || "",
    articleCount: Number(row.article_count || row.articleCount || 0),
    articleHashes: Array.isArray(row.article_hashes) ? row.article_hashes : [],
    model: row.model || "",
    usage: row.usage || {},
    status: row.status || "completed",
    createdBy: row.created_by || "",
    createdAt,
    updatedAt: row.updated_at || "",
    date: formatArticleDate(createdAt) || String(createdAt || "").slice(0, 10),
    time: formatTime(createdAt),
  };
}

function normalizeClippingAnalysisReportFromScrap(row) {
  const snapshot = row?.article_snapshot || {};
  if (snapshot.type !== "analysis_report") return null;
  return normalizeClippingAnalysisReport({
    id: row.article_hash || snapshot.id,
    title: snapshot.title,
    prompt: snapshot.prompt,
    report: snapshot.report,
    analysis: snapshot.analysis,
    article_count: snapshot.article_count,
    article_hashes: snapshot.article_hashes,
    model: snapshot.model,
    usage: snapshot.usage,
    status: snapshot.status,
    created_by: row.created_by || snapshot.created_by,
    created_at: row.created_at || snapshot.created_at,
    updated_at: row.updated_at || snapshot.updated_at,
  });
}

function mergeScrapAnalysisReportRows(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach((row) => {
    const key = String(row.id || `${row.createdAt}-${row.title}`).trim();
    if (key) map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function normalizeFeedback(row) {
  if (!row?.title && !row?.article_hash && !row?.link) return null;
  return {
    id: row.id || `${row.article_hash || row.link || row.title}-${row.created_at || ""}`,
    articleHash: row.article_hash || "",
    title: row.title || "",
    link: row.link || "",
    previousCategory: row.previous_category || "",
    previousTone: row.previous_tone || "",
    correctedCategory: row.corrected_category || "",
    correctedTone: row.corrected_tone || "",
    reason: feedbackReasonLabel(row.reason),
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
    date: formatArticleDate(row.created_at) || String(row.created_at || "").slice(0, 10),
    time: formatTime(row.created_at),
  };
}

function feedbackReasonLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return {
    dashboard_manual_correction: "수동 분류 수정",
  }[text] || text;
}

function normalizeScrap(row) {
  const snapshot = row?.article_snapshot || {};
  if (snapshot.type === "analysis_report") return null;
  const article = normalizeArticle({
    ...snapshot,
    article_hash: row?.article_hash || snapshot.article_hash || snapshot.id,
  });
  if (!article) return null;
  return {
    ...article,
    scrapedAt: row?.created_at ? String(row.created_at).slice(0, 10) : "",
  };
}

function normalizeArticle(row) {
  if (!row?.title) return null;
  if (isStockListingNoise(row)) return null;
  const publicationSource = row.pub_date || row.pub_date_raw || row.published_at || row.published_date || "";
  const dateSource = publicationSource || row.date || row.report_date || "";
  const showTime = shouldShowArticleTime(row, publicationSource || row.date || row.report_date);
  const aiContext = normalizeAiContext(row);
  const category = normalizeCategory(aiContext.category || row.category_label || row.category);
  const tone = normalizeArticleTone(row, category, aiContext);
  return {
    id: row.article_hash || row.id || row.link || row.title,
    articleHash: row.article_hash || row.articleHash || "",
    date: formatArticleDate(dateSource) || String(row.report_date || row.date || "").slice(0, 10),
    time: showTime ? formatTime(publicationSource || row.date || row.report_date) : "",
    pubDate: publicationSource || "",
    slot: row.report_slot || row.slot || row.window_label || row.window || "",
    source: normalizeArticleSource(row.source, row.link, row.title),
    title: row.title,
    link: row.link || "#",
    keyword: row.keyword || "",
    summary: row.summary || "",
    issueSummary: row.issue_summary || row.issueSummary || "",
    category,
    tone,
    aiContext,
    clippingRecommended: Boolean(aiContext.clippingRecommended),
    clippingReason: aiContext.clippingReason || "",
    riskLevel: String(row.risk_level || row.risk || "").toUpperCase(),
    score: Number(row.score || 0),
    status: row.status || "분석 완료",
    clusterSize: Number(row.cluster_size || row.clusterSize || 1),
  };
}

function normalizeArticleTone(row, category, aiContext = {}) {
  let tone = normalizeTone(aiContext.tone || row.tone || row.risk_level || row.risk || row.status);
  if (isReliefSupportArticle(row)) return category === "당사" ? "긍정" : "중립";
  if (category !== "당사" && tone === "긍정") return "중립";
  if (
    tone === "부정"
    && (
      category !== "당사"
      || aiContext.negativeTarget && aiContext.negativeTarget !== "own"
      || aiContext.ownMentioned === false
      || aiContext.tone && !aiContext.evidence
    )
  ) {
    return category === "당사" ? "주의" : "주의";
  }
  return tone;
}

function normalizeAiContext(row = {}) {
  const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
  const context = row.ai_context || row.aiContext || raw._ai_context || raw.ai_context || {};
  const source = context && typeof context === "object" ? context : {};
  const merged = {
    ...source,
    category: source.category ?? row.category,
    tone: source.tone ?? row.tone,
    own_mentioned: source.own_mentioned ?? row.own_mentioned,
    negative_target: source.negative_target ?? row.negative_target,
    evidence: source.evidence ?? row.classification_evidence,
    reason: source.reason ?? row.classification_reason,
    confidence: source.confidence ?? row.classification_confidence,
    provider: source.provider ?? row.classification_provider,
    clipping_recommended: source.clipping_recommended ?? row.clipping_recommended,
    clipping_reason: source.clipping_reason ?? row.clipping_reason,
  };
  return {
    category: normalizeBackendCategory(merged.category),
    tone: normalizeBackendTone(merged.tone),
    ownMentioned: normalizeContextBool(merged.own_mentioned),
    negativeTarget: normalizeNegativeTarget(merged.negative_target),
    evidence: String(merged.evidence || "").trim(),
    reason: String(merged.reason || "").trim(),
    confidence: Number(merged.confidence || 0) || 0,
    provider: merged.provider || "",
    clippingRecommended: normalizeContextBool(merged.clipping_recommended) === true,
    clippingReason: String(merged.clipping_reason || "").trim(),
  };
}

function normalizeContextBool(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return undefined;
}

function normalizeBackendCategory(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["own", "company", "incar"].includes(text)) return "own";
  if (["regulation", "policy"].includes(text)) return "regulation";
  if (["competitor", "ga"].includes(text)) return "competitor";
  if (["industry", "market"].includes(text)) return "industry";
  if (["exclude", "noise"].includes(text)) return "other";
  if (text === "other") return "other";
  return value;
}

function normalizeBackendTone(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["negative", "high"].includes(text)) return "negative";
  if (["caution", "warning", "risk", "medium"].includes(text)) return "caution";
  if (text === "positive") return "positive";
  if (text === "neutral") return "neutral";
  if (["exclude", "noise"].includes(text)) return "exclude";
  return value;
}

function normalizeNegativeTarget(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["own", "company", "incar"].includes(text)) return "own";
  if (["industry", "market"].includes(text)) return "industry";
  if (["competitor", "ga"].includes(text)) return "competitor";
  if (["policy", "regulation"].includes(text)) return "policy";
  if (["none", "no", "없음"].includes(text)) return "none";
  return text;
}

function isReliefSupportArticle(row = {}) {
  const text = `${row.title || ""} ${row.summary || ""} ${row.description || ""} ${row.keyword || ""}`;
  const reliefTarget = /전세사기|사기\s*피해|피해\s*(?:청년|가구|계층|자|지원|복구)|금융취약계층|취약계층|재난|재해|수해|화재\s*피해|구호|구제/i.test(text);
  const supportAction = /지원|후원|기부|성금|사회공헌|구호|구제|보호|돕|나눔|캠페인|협약|ESG/i.test(text);
  const accusation = /혐의|연루|가해|횡령|배임|고발|수사|제재|처분|논란|불법|사칭|피의|압수수색|기관주의|과태료|과징금/i.test(text);
  return reliefTarget && supportAction && !accusation;
}

function isStockListingNoise(row = {}) {
  const title = String(row.title || "");
  const sourceLink = `${row.source || ""} ${row.link || ""}`.toLowerCase();
  const text = `${title} ${sourceLink} ${row.summary || ""} ${row.description || ""} ${row.keyword || ""}`;
  const isItoozaListing = sourceLink.includes("itooza") && /52주|최고가|최저가|MVP|리스트|상위\s*\d+\s*선/.test(title);
  if (!STOCK_LISTING_NOISE_TITLE_RE.test(title) && !isItoozaListing) return false;
  if (OWN_NAME_RE.test(title) && INVESTMENT_REPORT_RE.test(text)) return false;
  return true;
}

function normalizeArticleSource(source, link = "", title = "") {
  const raw = String(source || "").trim();
  if (raw && !isPortalSource(raw)) return raw;
  const titleSource = String(title || "").match(/\s[-–]\s([^-\n|]+)$/)?.[1]?.trim();
  if (titleSource && !isPortalSource(titleSource)) return titleSource.replace(/^www\./, "");
  const host = safeHost(link);
  if (host && !isPortalSource(host)) return host;
  return raw || "미확인";
}

function isPortalSource(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "google" || text === "naver" || text === "daum" || text === "bing" || text.includes("google.");
}

function safeHost(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatArticleDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (dateOnly && !hasExplicitTime(raw)) {
    return `${dateOnly[1]}-${dateOnly[2].padStart(2, "0")}-${dateOnly[3].padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return dateOnly
      ? `${dateOnly[1]}-${dateOnly[2].padStart(2, "0")}-${dateOnly[3].padStart(2, "0")}`
      : "";
  }
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shouldShowArticleTime(row, value) {
  if (!hasExplicitTime(value)) return false;
  if (isOfficialRegulatorArticle(row) && isDateOnlyRegulatorTimestamp(value)) return false;
  return true;
}

function hasExplicitTime(value) {
  return /(?:T|\s)\d{1,2}:\d{2}/.test(String(value || ""));
}

function isDateOnlyRegulatorTimestamp(value) {
  return /(?:T|\s)00:00(?::00)?(?:\.000)?(?:Z|\+00:00)?$/i.test(String(value || "").trim());
}

function deduplicateArticles(rows = []) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = articleDedupKey(row);
    if (!key) return;
    const current = byKey.get(key);
    if (!current || shouldReplaceDedupedArticle(current, row)) {
      byKey.set(key, row);
    }
  });
  return Array.from(byKey.values());
}

function articleDedupKey(row) {
  if (isOfficialRegulatorArticle(row)) {
    const title = normalizeRegulatorTitle(row.title);
    if (title) return `regulator:${row.date || ""}:${title.slice(0, 44)}`;
  }
  const link = normalizeArticleLink(row.link);
  if (link) return `link:${link}`;
  const title = normalizeRegulatorTitle(row.title);
  return title ? `article:${row.date || ""}:${row.source || ""}:${title}` : "";
}

function isOfficialRegulatorArticle(row) {
  const text = `${row.source || ""} ${row.keyword || ""} ${row.category || ""} ${row.category_label || ""} ${row.link || ""}`;
  return /금융감독원|금융위원회|금융당국|정책\/규제|fss\.or\.kr|fsc\.go\.kr/.test(text);
}

function normalizeRegulatorTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”"''「」『』()[\]{}]/g, " ")
    .replace(/금융위원회\s*,?/g, " ")
    .replace(/금융위\s*,?/g, " ")
    .replace(/금감원\s*,?/g, " ")
    .replace(/-\s*(금융위|금융위원회|금감원|금융감독원).*$/g, " ")
    .replace(/\b\d{1,2}월\s*\d{1,2}일\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArticleLink(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "#") return "";
  return raw.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

function shouldReplaceDedupedArticle(current, next) {
  const toneRank = { 부정: 4, 주의: 3, 긍정: 2, 중립: 1, 제외: 0 };
  const currentTone = toneRank[current.tone] || 0;
  const nextTone = toneRank[next.tone] || 0;
  if (nextTone !== currentTone) return nextTone > currentTone;
  const currentScore = Number(current.score || 0);
  const nextScore = Number(next.score || 0);
  if (nextScore !== currentScore) return nextScore > currentScore;
  const currentSummary = String(current.summary || "").length;
  const nextSummary = String(next.summary || "").length;
  return nextSummary > currentSummary;
}

function normalizeNotification(row) {
  const rawTitle = row.title || row.message_type || row.channel || "알림톡";
  return {
    id: row.id || `${row.sent_at}-${row.message_type}`,
    sentAt: row.sent_at || row.created_at || "",
    rawStatus: row.status || "",
    rawTitle,
    messageType: row.message_type || "",
    channel: row.channel || "",
    time: formatTime(row.sent_at || row.created_at),
    type: compactNotificationTitle(row),
    status: row.status === "success" || row.status === "sent" || row.status === "성공" ? "성공" : row.status || "확인",
    body: row.body || row.error || "",
    link: row.link_url || "",
  };
}

function compactNotificationTitle(row) {
  const rawTitle = String(row?.title || row?.message_type || row?.channel || "알림톡").trim();
  const dateText = compactNotificationDate(rawTitle) || compactNotificationDate(row?.sent_at || row?.created_at);
  const titleKey = `${rawTitle} ${row?.message_type || ""}`.toLowerCase();
  if (/ai_usage_alert|ai\s*요약\s*사용량|ai.*사용량/.test(titleKey)) {
    return dateText ? `API 사용량 확인 ${dateText}` : "API 사용량 확인";
  }
  if (/daily_report|일일\s*언론\s*동향/.test(titleKey)) {
    return dateText ? `일일 언론 동향 ${dateText}` : "일일 언론 동향";
  }
  if (/weekly_report|주간\s*언론\s*동향/.test(titleKey)) {
    return dateText ? `주간 언론 동향 ${dateText}` : "주간 언론 동향";
  }
  if (/monthly_report|월간\s*언론\s*동향/.test(titleKey)) {
    return dateText ? `월간 언론 동향 ${dateText}` : "월간 언론 동향";
  }
  return rawTitle;
}

function compactNotificationDate(value) {
  const text = String(value || "");
  const match = text.match(/(20\d{2})[-.](\d{2})[-.](\d{2})/);
  if (!match) return "";
  return `${match[1].slice(2)}.${match[2]}.${match[3]}`;
}

function normalizeWatchRun(row) {
  return {
    id: row.run_key || row.scanned_at,
    label: "부정기사 감시",
    cadence: "24시간 · 5분",
    scannedAt: row.scanned_at || "",
    rawStatus: row.status || "",
    minutesBack: Number(row.minutes_back || 0),
    latest: formatTime(row.scanned_at),
    state: row.status === "ok" || row.status === "success" ? "정상" : row.status || "확인",
    scanned: Number(row.scanned_count || 0),
    negative: Number(row.negative_count || 0),
    fresh: Number(row.new_negative_count || 0),
    message: row.message || "",
  };
}

function normalizeReportRun(row) {
  const metrics = row?.metrics && typeof row.metrics === "object" ? row.metrics : {};
  return {
    id: row?.run_key || row?.id || `${row?.report_date || row?.date || ""}-${row?.report_slot || row?.slot || ""}`,
    date: String(row?.report_date || row?.date || row?.timestamp || "").slice(0, 10),
    slot: row?.report_slot || row?.slot || row?.window_label || "",
    timestamp: row?.timestamp || "",
    riskLevel: String(row?.risk_level || row?.riskLevel || metrics.risk_level || "").toUpperCase(),
    metrics,
  };
}

function normalizeMedia(row) {
  return {
    name: row.name || "미확인",
    url: row.url || "",
    status: row.status || "중립",
    grade: row.grade || "B",
    owner: row.owner || "",
    contactDate: row.contact_date || "",
    beat: row.beat || "",
    leadReporter: row.lead_reporter || "",
    email: row.email || "",
    phone: row.phone || "",
    memo: row.memo || "",
  };
}

function normalizeReporter(row) {
  return {
    id: row.id || `${row.media}-${row.name}`,
    name: row.name || "미확인",
    media: row.media || "미확인",
    outlet: row.media || "미확인",
    beat: row.beat || "",
    recent: "-",
    status: row.status || "중립",
    contactDate: row.contact_date || "",
    email: row.email || "",
    phone: row.phone || "",
    request: row.request || "",
    memo: row.memo || "",
  };
}

function normalizeAd(row) {
  return {
    id: row.id || `${row.media}-${row.spend_month}`,
    month: row.spend_month || "",
    media: row.media || "미확인",
    amount: Number(row.amount || 0),
    type: row.spend_type || "광고",
    memo: row.memo || "",
  };
}

export function normalizeTone(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (["exclude", "noise", "excluded"].includes(canonical) || /제외|노이즈/.test(text)) return "제외";
  if (["negative", "high"].includes(canonical) || /부정|위험|악재/.test(text)) return "부정";
  if (["caution", "medium", "warning"].includes(canonical) || /주의|경계/.test(text)) return "주의";
  if (["positive"].includes(canonical) || /긍정|호재/.test(text)) return "긍정";
  return "중립";
}

function normalizeToneLegacy(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("exclude") || text.includes("제외") || text.includes("노이즈")) return "제외";
  if (text.includes("negative") || text.includes("부정") || text.includes("high")) return "부정";
  if (text.includes("caution") || text.includes("주의") || text.includes("medium")) return "주의";
  if (text.includes("positive") || text.includes("긍정")) return "긍정";
  return "중립";
}

function normalizeCategory(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (!text) return "미분류";
  if (["own", "company"].includes(canonical) || /당사|인카/.test(text)) return "당사";
  if (["regulation", "policy"].includes(canonical) || /정책|규제|당국|수수료/.test(text)) return "정책/규제";
  if (["competitor"].includes(canonical)) return "보험사";
  if (["industry", "market"].includes(canonical) || /업계|동향|시장/.test(text)) return "업계동향";
  if (["other"].includes(canonical)) return "기타";
  if (["exclude", "noise"].includes(canonical) || /제외|노이즈/.test(text)) return "제외";
  if (/ga|글로벌금융|메가|설계사/.test(canonical)) return "GA";
  if (/보험|생명|손해/.test(text)) return "보험사";
  return text;
}

function normalizeCategoryLegacy(value) {
  const text = String(value || "").trim();
  if (!text) return "미분류";
  if (/own|company|당사|인카/i.test(text)) return "당사";
  if (/ga|글로벌금융|메가금융|설계사/i.test(text)) return "GA";
  if (/보험사|생명|손해/i.test(text)) return "보험사";
  if (/정책|규제|당국|수수료|룰/i.test(text)) return "정책/규제";
  if (/exclude|noise|제외|노이즈/i.test(text)) return "제외";
  return text;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value);
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : raw.slice(0, 5);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
