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

const STOCK_LISTING_NOISE_TITLE_RE = /52주\s*(?:최저가|최고가)|장중\s*(?:신저가|신고가)|강세\s*토픽|약세\s*토픽|특징주|오전\s*이슈\s*\[보험\]/;
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
    status: String(media.status || "중립").trim() || "중립",
    grade: String(media.grade || "B").trim() || "B",
    owner: String(media.owner || "").trim(),
    contact_date: media.contactDate || media.contact_date || null,
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

export async function saveReporterProfile(reporter = {}) {
  const name = String(reporter.name || "").trim();
  const media = String(reporter.media || reporter.outlet || "").trim();
  if (!name || !media) throw new Error("reporter_required");
  const body = {
    name,
    media,
    status: String(reporter.status || "중립").trim() || "중립",
    contact_date: reporter.contactDate || reporter.contact_date || null,
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
    mediaRelations: [],
    reporters: [],
    ads: [],
    aliases: [],
    keywords: [],
    session: null,
  };

  try {
    const staticData = await loadStaticOperationalData();
    if (staticData) return staticData;
    return { ...base, status: "empty", message: "누적 데이터 없음" };
  } catch (error) {
    return { ...base, status: "error", message: error?.message || "누적 데이터 연결 실패" };
  }
}

async function loadStaticOperationalData() {
  for (const path of STATIC_DATA_PATHS) {
    try {
      const payload = await fetchJson(path);
      const articles = Array.isArray(payload?.articles) ? deduplicateArticles(payload.articles.map(normalizeArticle).filter(Boolean)) : [];
      const reportRuns = Array.isArray(payload?.report_runs) ? payload.report_runs.map(normalizeReportRun) : [];
      if (!articles.length && !reportRuns.length) continue;
      return {
        source: "static",
        status: "live",
        message: `누적 데이터 ${articles.length.toLocaleString("ko-KR")}건`,
        articles,
        notifications: Array.isArray(payload?.notifications) ? payload.notifications.map(normalizeNotification) : [],
        watchRuns: Array.isArray(payload?.watch_runs) ? payload.watch_runs.map(normalizeWatchRun) : [],
        reportRuns,
        scraps: Array.isArray(payload?.scraps) ? payload.scraps.map(normalizeScrap).filter(Boolean) : [],
        mediaRelations: Array.isArray(payload?.media_relations)
          ? payload.media_relations.filter((row) => !row.hidden).map(normalizeMedia)
          : [],
        reporters: Array.isArray(payload?.reporters) ? payload.reporters.map(normalizeReporter) : [],
        ads: Array.isArray(payload?.ads) ? payload.ads.map(normalizeAd) : [],
        aliases: Array.isArray(payload?.aliases) ? payload.aliases : [],
        keywords: Array.isArray(payload?.keywords) ? payload.keywords.map(normalizeKeyword).filter(Boolean) : [],
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
    mediaRelations: [],
    reporters: [],
    ads: [],
    aliases: [],
    keywords: [],
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

    const [articles, notifications, watchRuns, reportRuns, scraps, mediaRelations, reporters, ads, aliases, keywords] = await Promise.all([
      fetchTable(
        config,
        session,
        "news_articles",
        [
          "select=article_hash,report_date,report_slot,window_label,title,link,source,keyword,summary,pub_date,pub_date_raw,score,category,tone,risk_level,status,cluster_size",
          "order=report_date.desc,score.desc",
        ].join("&"),
        1000,
        50000,
      ),
      rest(
        config,
        session,
        "notification_sends?select=id,sent_at,channel,message_type,title,body,link_url,status,error,created_at&order=sent_at.desc&limit=80",
      ),
      rest(
        config,
        session,
        "negative_watch_runs?select=run_key,scanned_at,minutes_back,scanned_count,negative_count,new_negative_count,status,message&order=scanned_at.desc&limit=20",
      ),
      rest(
        config,
        session,
        "report_runs?select=run_key,report_date,report_slot,timestamp,window_label,risk_level,metrics&order=report_date.desc,report_slot.desc&limit=500",
      ),
      rest(
        config,
        session,
        "article_scraps?select=article_hash,article_snapshot,created_at&order=created_at.desc&limit=100",
      ),
      rest(config, session, "media_relations?select=name,status,grade,owner,contact_date,memo,hidden&order=name.asc"),
      rest(config, session, "reporters?select=id,name,media,status,contact_date,memo,updated_at&order=updated_at.desc&limit=500"),
      rest(config, session, "ad_spends?select=id,media,spend_month,amount,spend_type,memo,updated_at&order=spend_month.desc,updated_at.desc&limit=500"),
      rest(config, session, "press_aliases?select=host,press_name&order=press_name.asc,host.asc&limit=1000"),
      rest(config, session, "monitor_keywords?select=keyword,category,enabled&enabled=eq.true&order=category.asc,created_at.asc&limit=1000"),
    ]);

    return {
      source: "supabase",
      status: "live",
      message: "운영 DB 연결",
      articles: Array.isArray(articles) ? deduplicateArticles(articles.map(normalizeArticle).filter(Boolean)) : [],
      notifications: Array.isArray(notifications) ? notifications.map(normalizeNotification) : [],
      watchRuns: Array.isArray(watchRuns) ? watchRuns.map(normalizeWatchRun) : [],
      reportRuns: Array.isArray(reportRuns) ? reportRuns.map(normalizeReportRun) : [],
      scraps: Array.isArray(scraps) ? scraps.map(normalizeScrap).filter(Boolean) : [],
      mediaRelations: Array.isArray(mediaRelations) ? mediaRelations.filter((row) => !row.hidden).map(normalizeMedia) : [],
      reporters: Array.isArray(reporters) ? reporters.map(normalizeReporter) : [],
      ads: Array.isArray(ads) ? ads.map(normalizeAd) : [],
      aliases: Array.isArray(aliases) ? aliases : [],
      keywords: Array.isArray(keywords) ? keywords.map(normalizeKeyword).filter(Boolean) : [],
      session,
    };
  } catch (error) {
    return { ...base, status: "error", message: error?.message || "운영 데이터 연결 실패" };
  }
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

function normalizeScrap(row) {
  const snapshot = row?.article_snapshot || {};
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
  return {
    id: row.article_hash || row.id || row.link || row.title,
    date: formatArticleDate(dateSource) || String(row.report_date || row.date || "").slice(0, 10),
    time: showTime ? formatTime(publicationSource || row.date || row.report_date) : "",
    pubDate: publicationSource || "",
    slot: row.report_slot || row.slot || row.window_label || row.window || "",
    source: normalizeArticleSource(row.source, row.link, row.title),
    title: row.title,
    link: row.link || "#",
    keyword: row.keyword || "",
    summary: row.summary || "",
    category: normalizeCategory(row.category_label || row.category),
    tone: normalizeTone(row.tone || row.risk_level || row.risk || row.status),
    riskLevel: String(row.risk_level || row.risk || "").toUpperCase(),
    score: Number(row.score || 0),
    status: row.status || "분석 완료",
    clusterSize: Number(row.cluster_size || row.clusterSize || 1),
  };
}

function isStockListingNoise(row = {}) {
  const title = String(row.title || "");
  const text = `${title} ${row.summary || ""} ${row.description || ""} ${row.keyword || ""}`;
  if (!STOCK_LISTING_NOISE_TITLE_RE.test(title)) return false;
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
  return {
    id: row.id || `${row.sent_at}-${row.message_type}`,
    time: formatTime(row.sent_at || row.created_at),
    type: row.title || row.message_type || row.channel || "알림톡",
    status: row.status === "success" || row.status === "sent" || row.status === "성공" ? "성공" : row.status || "확인",
    body: row.body || row.error || "",
    link: row.link_url || "",
  };
}

function normalizeWatchRun(row) {
  return {
    id: row.run_key || row.scanned_at,
    label: "부정기사 감시",
    cadence: "24시간 · 5분",
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
    status: row.status || "중립",
    grade: row.grade || "B",
    owner: row.owner || "",
    contactDate: row.contact_date || "",
    memo: row.memo || "",
  };
}

function normalizeReporter(row) {
  return {
    id: row.id || `${row.media}-${row.name}`,
    name: row.name || "미확인",
    media: row.media || "미확인",
    outlet: row.media || "미확인",
    beat: row.memo || "-",
    recent: "-",
    status: row.status || "중립",
    contactDate: row.contact_date || "",
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
