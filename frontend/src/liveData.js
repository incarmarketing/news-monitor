const DASHBOARD_SESSION_KEY = "marketing_pr_session_v1";
const LOCAL_SCRAPS_KEY = "marketing_pr_local_scraps_v1";

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

function getLocalScraps() {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_SCRAPS_KEY) || "[]");
    return Array.isArray(rows) ? rows.map(normalizeArticle).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveLocalScrap(article = {}) {
  const articleHash = String(article.id || article.article_hash || article.link || article.title || "").trim();
  if (!articleHash) throw new Error("article_hash_required");
  const next = [
    { ...article, id: articleHash, article_hash: articleHash, scrapedAt: formatDate(new Date().toISOString()) },
    ...getLocalScraps().filter((item) => item.id !== articleHash && item.link !== article.link),
  ].slice(0, 200);
  localStorage.setItem(LOCAL_SCRAPS_KEY, JSON.stringify(next));
  return next;
}

function deleteLocalScrap(articleHash) {
  const cleanHash = String(articleHash || "").trim();
  const next = getLocalScraps().filter((item) => item.id !== cleanHash && item.article_hash !== cleanHash && item.link !== cleanHash);
  localStorage.setItem(LOCAL_SCRAPS_KEY, JSON.stringify(next));
  return next;
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

async function dashboardApi(config, session, action, payload = {}) {
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  if (!session?.session_token) throw new Error("missing_dashboard_session");
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/dashboard-api`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
      "Content-Type": "application/json",
      "X-Dashboard-Session": session.session_token,
    },
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

async function writeRest(path, method, body, headers = {}) {
  const config = await loadSupabaseConfig();
  const session = getStoredSession();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  if (!session?.session_token) throw new Error("missing_dashboard_session");
  const result = await dashboardApi(config, session, "rest", { path, method, body, headers });
  return result && Object.prototype.hasOwnProperty.call(result, "data") ? result.data : result;
}

export async function triggerDashboardRefresh() {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = getStoredSession();
  const payload = { workflow: "negative-watch.yml", source: "dashboard_manual_refresh" };

  try {
    return await triggerCollectionFunction(config, payload);
  } catch (functionError) {
    if (!session?.session_token) throw functionError;
    return dashboardApi(config, session, "trigger_collection", payload);
  }
}

export async function triggerRegulatorRefresh() {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const session = getStoredSession();
  const payload = { workflow: "regulator-releases.yml", source: "regulator_manual_refresh" };

  try {
    return await triggerCollectionFunction(config, payload);
  } catch (functionError) {
    if (!session?.session_token) throw functionError;
    return dashboardApi(config, session, "trigger_collection", payload);
  }
}

async function triggerCollectionFunction(config, payload) {
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/trigger-news-collection`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "dispatch",
      workflow: payload.workflow,
      source: payload.source,
    }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.error || `trigger_collection_${response.status}`);
  return data;
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

export async function saveArticleScrap(article = {}) {
  const articleHash = String(article.id || article.article_hash || article.link || article.title || "").trim();
  if (!articleHash) throw new Error("article_hash_required");
  const session = getStoredSession();
  try {
    return await writeRest(
      "article_scraps?on_conflict=article_hash",
      "POST",
      [{
        article_hash: articleHash,
        article_snapshot: {
          ...article,
          article_hash: articleHash,
        },
        created_by: session?.employee_no || session?.display_name || "dashboard",
      }],
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
  } catch (error) {
    if (!canFallbackToLocal(error)) throw error;
    return saveLocalScrap(article);
  }
}

export async function deleteArticleScrap(articleHash) {
  const cleanHash = String(articleHash || "").trim();
  if (!cleanHash) throw new Error("article_hash_required");
  try {
    const result = await writeRest(
      `article_scraps?article_hash=eq.${encodeURIComponent(cleanHash)}`,
      "DELETE",
      null,
      { Prefer: "return=minimal" },
    );
    deleteLocalScrap(cleanHash);
    return result;
  } catch (error) {
    if (!canFallbackToLocal(error)) throw error;
    return deleteLocalScrap(cleanHash);
  }
}

export async function analyzeRegulatorReleases(prompt, articles = []) {
  const config = await loadSupabaseConfig();
  if (!config?.url || !config?.anon_key) throw new Error("missing_supabase_config");
  const prepared = articles.slice(0, 20).map((article, index) => {
    const summary = String(article.summary || article.description || "").trim();
    const department = extractDepartment(summary);
    return {
      no: index + 1,
      title: article.title || "",
      summary,
      press: article.source || "금융당국",
      date: article.publishedDate || article.date || article.periodDate || "",
      published_label: article.publishedDate || article.date || "",
      link: article.link || "",
      keyword: article.keyword || "금융당국 보도자료",
      category_label: article.category || "정책/규제",
      tone_label: article.tone || "중립",
      risk: article.riskLevel || "",
      department,
      relevance: regulatorRelevanceText(article),
    };
  });
  const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/analyze-scraps`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: config.anon_key,
      Authorization: `Bearer ${config.anon_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: buildRegulatorPrompt(prompt, prepared),
      articles: prepared,
    }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.error || `analyze_regulator_${response.status}`);
  return data;
}

function buildRegulatorPrompt(prompt, articles) {
  return [
    "금융감독원/금융위원회 공식 보도자료만 대상으로 분석합니다.",
    `사용자 요청: ${String(prompt || "").trim() || "임원 보고용으로 당사 영향과 영업현장 영향을 분석해줘."}`,
    "",
    "중요: 일반 뉴스 분석이 아니라 공식 보도자료 해석입니다. 아래 고정 양식을 반드시 채우세요.",
    "1. 핵심 판단: 선택 자료를 관통하는 결론 2~3개",
    "2. 당사 영향: 인카금융서비스/GA/보험대리점 관점의 직접·간접 영향",
    "3. 영업현장 영향: 설계사, 모집, 수수료, 내부통제, 소비자보호 관점",
    "4. 리스크 수준: LOW/MEDIUM/HIGH 중 하나와 이유",
    "5. 후속 확인사항: 실제 업무에서 확인할 항목 3~5개",
    "6. 보고용 5줄 요약: 임원에게 그대로 보여줄 수 있는 다섯 문장",
    "7. 근거 보도자료 번호: 모든 판단에는 [1], [2]처럼 번호를 붙임",
    "",
    "AI 입력 전 정리된 자료:",
    ...articles.map((article) => [
      `[${article.no}] ${article.press} / ${article.date}`,
      `제목: ${article.title}`,
      `담당부서: ${article.department || "확인 필요"}`,
      `핵심 문장: ${article.summary || "요약 없음"}`,
      `관련성: ${article.relevance}`,
      `링크: ${article.link || "-"}`,
    ].join("\n")),
    "",
    "금지:",
    "- 링크 URL을 본문 판단 문장에 길게 쓰지 말 것",
    "- '모니터링 필요' 같은 빈말만 쓰지 말 것",
    "- 자료에 없는 제재나 확정 사실을 만들지 말 것",
    "- 근거 번호 없는 판단을 쓰지 말 것",
  ].join("\n\n");
}

function extractDepartment(summary = "") {
  const match = String(summary).match(/담당부서\s*:\s*([^。.]+?)(?:\.|。|보험\/GA|$)/);
  return match ? match[1].trim() : "";
}

function regulatorRelevanceText(article = {}) {
  const text = `${article.title || ""} ${article.summary || ""} ${article.keyword || ""}`;
  const tags = [];
  if (/보험대리점|법인보험대리점|GA|모집|설계사/.test(text)) tags.push("GA/설계사");
  if (/수수료|정착지원금|1200/.test(text)) tags.push("수수료/모집질서");
  if (/내부통제|금융소비자보호|불완전판매|민원/.test(text)) tags.push("내부통제/소비자보호");
  if (/검사|제재|감독|승인|경영개선/.test(text)) tags.push("감독/제재");
  if (/보험사|손해보험|생명보험|손보|생보/.test(text)) tags.push("보험업권");
  return tags.length ? tags.join(", ") : "보험/GA 관련성 확인 필요";
}

function canFallbackToLocal(error) {
  const message = String(error?.message || error || "");
  return /missing_dashboard_session|invalid_session|missing_supabase_config|dashboard_api_401|unauthorized/.test(message);
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
    const session = getStoredSession();
    if (session?.session_token) {
      const liveData = await loadOperationalDataFromSupabaseSession();
      if (liveData?.status === "live") return liveData;
    }
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
      const articles = Array.isArray(payload?.articles) ? payload.articles.map(normalizeArticle).filter(Boolean) : [];
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
        scraps: mergeScraps(Array.isArray(payload?.scraps) ? payload.scraps.map(normalizeScrap).filter(Boolean) : []),
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
          "select=article_hash,report_date,report_slot,window_label,title,link,source,keyword,summary,pub_date,pub_date_raw,score,category,tone,risk_level,status,cluster_size,raw",
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
      articles: Array.isArray(articles) ? articles.map(normalizeArticle).filter(Boolean) : [],
      notifications: Array.isArray(notifications) ? notifications.map(normalizeNotification) : [],
      watchRuns: Array.isArray(watchRuns) ? watchRuns.map(normalizeWatchRun) : [],
      reportRuns: Array.isArray(reportRuns) ? reportRuns.map(normalizeReportRun) : [],
      scraps: mergeScraps(Array.isArray(scraps) ? scraps.map(normalizeScrap).filter(Boolean) : []),
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
  if (isOutOfDomainArticle(row)) return null;
  const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
  const dateSource = row.report_date || row.date || row.pub_date || row.pub_date_raw || "";
  const knownOriginal = inferKnownOriginalPublication(row);
  const originalPublished = knownOriginal || row.original_pub_date || raw._original_pub_date || raw.original_pub_date || raw.pub_date_original || "";
  const published = originalPublished || row.pub_date || row.pub_date_raw || row.published_at || row.created_at || "";
  const reportDate = String(row.report_date || row.date || dateSource || "").slice(0, 10);
  const publishedDate = formatDate(published) || String(row.pub_date_raw || row.published_at || "").slice(0, 10);
  const periodDate = publishedDate || reportDate;
  const category = normalizeCategory(row.category_label || row.category);
  let tone = normalizeTone(row.tone || row.risk_level || row.risk || row.status);
  if (isOwnMarketCautionRow(row)) {
    tone = "주의";
  }
  if (tone === "긍정" && category !== "당사" && !hasOwnMention(row)) {
    tone = "중립";
  }
  return {
    id: row.article_hash || row.id || row.link || row.title,
    date: reportDate,
    reportDate,
    publishedDate,
    periodDate,
    time: formatTime(published || row.report_date || row.date),
    pubDate: published,
    slot: row.report_slot || row.slot || row.window_label || row.window || "",
    source: row.source || "미확인",
    title: row.title,
    link: row.link || "#",
    keyword: row.keyword || "",
    summary: row.summary || "",
    category,
    tone,
    riskLevel: String(row.risk_level || row.risk || "").toUpperCase(),
    score: Number(row.score || 0),
    status: row.status || "분석 완료",
    clusterSize: Number(row.cluster_size || row.clusterSize || 1),
    scrapedAt: row.scrapedAt || row.scraped_at || "",
  };
}

function normalizeNotification(row) {
  const messageType = row.message_type || row.messageType || "";
  return {
    id: row.id || `${row.sent_at}-${row.message_type}`,
    sentAt: row.sent_at || row.created_at || "",
    messageType,
    time: formatTime(row.sent_at || row.created_at),
    type: row.title || notificationTypeLabel(messageType) || row.channel || "알림톡",
    status: row.status === "success" || row.status === "sent" || row.status === "성공" ? "성공" : row.status || "확인",
    body: row.body || row.error || "",
    link: row.link_url || "",
  };
}

function mergeScraps(remoteScraps = []) {
  const map = new Map();
  [...getLocalScraps(), ...remoteScraps].forEach((item) => {
    const key = item?.id || item?.article_hash || item?.link || item?.title;
    if (key) map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.scrapedAt || b.date || 0) - new Date(a.scrapedAt || a.date || 0));
}

function inferKnownOriginalPublication(row) {
  const text = `${row?.title || ""} ${row?.summary || ""} ${row?.source || ""} ${row?.link || ""}`;
  if (/인카금융스캔들/i.test(text) && /불법\s*사채놀이|약탈\s*영업/i.test(text) && /위즈경제|wikyung/i.test(text)) {
    return "2026-04-20T11:29:00+09:00";
  }
  return "";
}

function hasOwnMention(row) {
  const text = `${row?.title || ""} ${row?.summary || ""} ${row?.keyword || ""}`;
  return /인카금융서비스|인카금융|에인|Incar|INCAR/i.test(text);
}

function isOwnMarketCautionRow(row) {
  const text = `${row?.title || ""} ${row?.summary || ""} ${row?.description || ""} ${row?.keyword || ""}`;
  return hasOwnMention(row)
    && /주가|증시|코스피|코스닥|상장|시총|거래|52주|최고가|최저가|투자의견|목표가|목표주가|증권가|리포트|애널리스트/i.test(text)
    && /하락|급락|약세|낙폭|신저가|최저가|부진|조정|매도|▼|↓|목표가\s*하향|목표주가\s*하향|투자의견.*(하향|낮|중립|매도)|매수.*(접|철회)|너무\s*올랐다/i.test(text);
}

function isOutOfDomainArticle(row) {
  const text = `${row?.title || ""} ${row?.summary || ""} ${row?.description || ""} ${row?.keyword || ""} ${row?.source || ""}`;
  if (!text.trim()) return true;
  if (hasOwnMention(row)) return false;
  if (hasInsuranceDomainContext(text)) return false;
  if (/수수료|정책|규제|당국|제도|법안|공시|감독/i.test(text)) return true;
  if (/소상공인|포항시장|시장 후보|지역업체|하도급|입찰제도|수수료 제로 플랫폼/i.test(text)) return true;
  return false;
}

function hasInsuranceDomainContext(text) {
  return /보험|손보|생보|생명보험|손해보험|보험사|보험대리점|법인보험대리점|GA|설계사|전속설계사|보험모집인|모집인|보험업법|1200%|정착지원금|불완전판매|내부통제|인카금융|글로벌금융판매|메가금융서비스|한화생명금융서비스|에이플러스에셋|리치앤코|굿리치|지에이코리아|프라임에셋|피플라이프|보험저널|보험매일|보험신보/i.test(text);
}

function notificationTypeLabel(value) {
  return {
    weekly_report: "주간 언론 모니터링 보고서",
    monthly_report: "월간 언론 모니터링 보고서",
    daily_report: "일일 언론 동향",
    negative_alert: "부정기사 알림",
  }[value] || "";
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

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const raw = String(value);
    const match = raw.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
