const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dashboard-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DashboardRequest = {
  action?: string;
  payload?: Record<string, unknown>;
};

type SessionInfo = {
  ok?: boolean;
  employee_no?: string;
  display_name?: string;
  role?: "admin" | "editor" | "viewer" | "reporter";
  session_expires_at?: string;
  message?: string;
};

const tableAccess: Record<string, { read: boolean; writeRoles: string[] }> = {
  news_articles: { read: true, writeRoles: ["admin", "editor"] },
  report_runs: { read: true, writeRoles: ["admin", "editor"] },
  job_runs: { read: true, writeRoles: [] },
  monitor_keywords: { read: true, writeRoles: ["admin", "editor"] },
  monitor_context_rules: { read: true, writeRoles: ["admin", "editor"] },
  article_scraps: { read: true, writeRoles: ["admin", "editor", "reporter"] },
  media_relations: { read: true, writeRoles: ["admin", "editor"] },
  reporters: { read: true, writeRoles: ["admin", "editor"] },
  ad_spends: { read: true, writeRoles: ["admin", "editor"] },
  press_aliases: { read: true, writeRoles: ["admin", "editor"] },
  article_publisher_overrides: { read: true, writeRoles: ["admin", "editor"] },
  notification_sends: { read: true, writeRoles: [] },
  negative_watch_runs: { read: true, writeRoles: [] },
  risk_response_drafts: { read: true, writeRoles: ["admin", "editor", "reporter"] },
  clipping_analysis_reports: { read: true, writeRoles: ["admin", "editor", "reporter"] },
  classification_feedback: { read: true, writeRoles: ["admin", "editor", "reporter"] },
  ga_companies: { read: true, writeRoles: ["admin", "editor"] },
  ga_disclosure_metrics: { read: true, writeRoles: ["admin", "editor"] },
  ga_revenue_metrics: { read: true, writeRoles: ["admin", "editor"] },
  ga_market_metrics: { read: true, writeRoles: ["admin", "editor"] },
  ga_collect_runs: { read: true, writeRoles: ["admin", "editor"] },
  ga_metric_sources: { read: true, writeRoles: ["admin", "editor"] },
};

const githubRequestTimeoutMs = 10000;
const supabaseRequestTimeoutMs = 8000;
const githubDispatchAttempts = 2;

const DASHBOARD_ARTICLE_SELECT = [
  "article_hash",
  "report_date",
  "report_slot",
  "window_label",
  "title",
  "link",
  "source",
  "keyword",
  "summary",
  "pub_date",
  "pub_date_raw",
  "score",
  "category",
  "tone",
  "own_mentioned",
  "negative_target",
  "classification_evidence",
  "classification_reason",
  "classification_confidence",
  "classification_provider",
  "clipping_recommended",
  "clipping_reason",
  "risk_level",
  "status",
  "cluster_size",
].join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }
  if (!isAllowedApiKey(req.headers.get("apikey"))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await safeJson<DashboardRequest>(req);
  const action = String(body.action || "");
  const payload = body.payload || {};
  const sessionToken = req.headers.get("x-dashboard-session") || "";
  const session: SessionInfo = sessionToken
    ? await verifySession(sessionToken)
    : { ok: false, message: "anonymous" };
  const requestOrigin = req.headers.get("origin");
  const publicDashboardRefresh = isPublicDashboardRefreshRequest(action, payload, requestOrigin);
  const publicDashboardSnapshot = isPublicDashboardSnapshotRequest(action, requestOrigin);
  const publicMediaRegistry = action === "media_registry" && isAllowedPublicRefreshOrigin(requestOrigin);
  const publicChanges = action === "changes" && isAllowedPublicRefreshOrigin(requestOrigin);
  const publicRefreshStatus = action === "workflow_health" && payload.workflow === "dashboard-refresh.yml"
    && isAllowedPublicRefreshOrigin(requestOrigin);
  if (!session.ok && !publicDashboardRefresh && !publicDashboardSnapshot && !publicMediaRegistry && !publicChanges && !publicRefreshStatus) {
    return jsonResponse({ error: "invalid_session", detail: session.message || "" }, 401);
  }

  try {
    if (action === "changes") return await handleChanges(payload, session.ok === true);
    if (action === "workflow_health") return await handleWorkflowHealth(payload);
    if (action === "classification_maintenance") {
      if (!session.ok || !["admin", "editor"].includes(session.role || "")) {
        return jsonResponse({ error: "read_not_allowed" }, 403);
      }
      return await handleClassificationMaintenance(payload);
    }
    if (action === "media_registry") {
      const mode = String(payload.mode || "summary");
      if (!["summary", "media", "unknown", "reporter"].includes(mode)) return jsonResponse({ error: "invalid_registry_mode" }, 400);
      const result = await supabaseRpc("get_media_registry", {
        p_mode: mode, p_key: String(payload.key || "").slice(0, 300),
        p_offset: boundedInteger(payload.offset, 0, 0, 1000000),
      });
      if (!session.ok && !result.ok) return jsonResponse({ error: "media_registry_unavailable" }, 502);
      return jsonResponse(result, result.ok ? 200 : 502);
    }
    if (action === "snapshot") {
      return await handleSnapshot(payload, session.ok === true);
    }
    if (action === "rest") {
      return await handleRest(payload, session);
    }
    if (action === "trigger_collection") {
      return await triggerCollection(session, payload, publicDashboardRefresh);
    }
    if (action === "logout") {
      return await revokeSession(sessionToken);
    }
    return jsonResponse({ error: "unknown_action" }, 400);
  } catch (error) {
    return jsonResponse({ error: "dashboard_api_failed", ...(session.ok ? { detail: String(error?.message || error) } : {}) }, 500);
  }
});

function auditObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function auditPick(value: unknown, keys: string[]) {
  const source = auditObject(value);
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]));
}

async function handleClassificationMaintenance(payload: Record<string, unknown>) {
  const runId = String(payload.run_id || "");
  const mode = String(payload.mode || "reviews");
  if ((runId && !/^[A-Za-z0-9_-]{1,160}$/.test(runId)) || !["reviews", "repairs", "candidates"].includes(mode)) {
    return jsonResponse({ error: "invalid_audit_request" }, 400);
  }
  const offset = boundedInteger(payload.offset, 0, 0, 1000000);
  const summaryKeys = ["status", "generated_at", "row_count", "review_count", "applied_count", "block_reason"];
  const summarySelect = ["run_id", "created_at", ...summaryKeys.map((key) => `${key}:report->${key}`)].join(",");
  try {
    const history = await supabaseRest(`classification_maintenance_runs?select=${summarySelect}&order=created_at.desc,run_id.desc&limit=25`, { method: "GET" });
    if (!history.ok || !Array.isArray(history.data)) throw new Error("history_unavailable");
    const runs = history.data.map((row) => auditPick(row, ["run_id", "created_at", ...summaryKeys]));
    const selected = runId || String(runs[0]?.run_id || "");
    if (!selected) return jsonResponse({ ok: true, data: { runs, run: null, items: [], total: 0, offset, page_size: 25 } });
    const detail = await supabaseRest(`classification_maintenance_runs?select=run_id,created_at,report,repairs&run_id=eq.${encodeURIComponent(selected)}&limit=1`, { method: "GET" });
    if (!detail.ok || !Array.isArray(detail.data)) throw new Error("detail_unavailable");
    if (!detail.data.length) return jsonResponse({ error: "audit_not_found" }, 404);
    const record = detail.data[0];
    const report = auditObject(record.report);
    const gate = auditPick(report.gate, ["passed", "failures", "thresholds", "case_count", "category_accuracy", "tone_accuracy", "exact_accuracy", "alert_precision", "alert_recall", "alert_confusion", "minimum_cases", "minimum_positive_cases", "minimum_negative_cases"]);
    const run = { run_id: record.run_id, created_at: record.created_at, ...auditPick(report, [...summaryKeys, "ruleset", "window_start", "window_end", "candidate_count", "protected_count", "evidence_counts"]), gate };
    const rawItems = mode === "repairs" ? record.repairs : mode === "candidates" ? report.repair_candidates : report.reviews;
    if (rawItems != null && !Array.isArray(rawItems)) throw new Error("invalid_audit_items");
    const fields = ["category", "tone", "own_mentioned", "alert_eligible", "negative_target"];
    const items = (rawItems || []).slice(offset, offset + 25).map((entry: unknown) => {
      const item = auditObject(entry);
      if (mode === "repairs") return {
        id: item.id, ...auditPick(item.before, ["title", "link", "source"]),
        before: auditPick(item.before, fields), proposed: auditPick(item.patch, fields),
        reason: String(auditObject(item.patch).classification_reason || "").slice(0, 1000),
      };
      return { ...auditPick(item, ["id", "title", "link", "source", "protected", "manual", "evidence_status", "changed_fields"]),
        before: auditPick(item.before, fields), proposed: auditPick(item.proposed, fields),
        reason: String(item.reason || "").slice(0, 1000), source_excerpt: String(item.source_excerpt || "").slice(0, 240),
      };
    });
    return jsonResponse({ ok: true, data: { runs, run, items, total: (rawItems || []).length, offset, page_size: 25 } });
  } catch {
    return jsonResponse({ error: "classification_audit_unavailable" }, 502);
  }
}

async function handleSnapshot(payload: Record<string, unknown>, authenticated = false) {
  const lookbackDays = boundedInteger(payload.lookback_days, 8, 3, 30);
  const articleLimit = boundedInteger(payload.max_rows, 1000, 100, 1000);
  const startDate = new Date(Date.now() - ((lookbackDays - 1) * 24 * 60 * 60 * 1000))
    .toISOString()
    .slice(0, 10);
  const requests: Record<string, Promise<{ ok: boolean; status: number; data: unknown }>> = {
    articles: supabaseRest(
      `news_articles?select=${DASHBOARD_ARTICLE_SELECT}&report_date=gte.${startDate}&order=report_date.desc,score.desc&limit=${articleLimit}`,
      { method: "GET" },
    ),
    notifications: supabaseRest(
      "notification_sends?select=id,sent_at,channel,message_type,dedupe_key,title,body,link_url,status,error,created_at&order=sent_at.desc&limit=120",
      { method: "GET" },
    ),
    watch_runs: supabaseRest(
      "negative_watch_runs?select=run_key,scanned_at,minutes_back,scanned_count,negative_count,new_negative_count,status,message,created_at&order=scanned_at.desc,created_at.desc&limit=80",
      { method: "GET" },
    ),
    report_runs: supabaseRest(
      "report_runs?select=run_key,report_date,report_slot,timestamp,window_label,risk_level,metrics&order=report_date.desc,report_slot.desc&limit=500",
      { method: "GET" },
    ),
    job_runs: supabaseRest(
      "job_runs?select=run_key,job_type,report_date,report_slot,workflow,status,started_at,finished_at,last_seen_at,error,details,created_at,updated_at&job_type=in.(daily_report,period_report,weekly_report,monthly_report)&order=started_at.desc,created_at.desc&limit=200",
      { method: "GET" },
    ),
  };
  const requestEntries = Object.entries(requests);
  const settledEntries = await Promise.allSettled(
    requestEntries.map(async ([key, request]) => [key, await request] as const),
  );
  const data: Record<string, unknown> = {};
  const warnings: string[] = [];
  settledEntries.forEach((entry, index) => {
    const key = requestEntries[index][0];
    if (entry.status === "rejected") {
      data[key] = [];
      warnings.push(`${key}_request_failed`);
      return;
    }
    const [, result] = entry.value;
    if (result.ok) data[key] = result.data;
    else {
      data[key] = [];
      warnings.push(`${key}_${result.status}`);
    }
  });
  if (!Array.isArray(data.articles) || warnings.some((warning) => warning.startsWith("articles_"))) {
    return jsonResponse({ error: "snapshot_articles_failed", warnings }, 502);
  }
  return jsonResponse({
    ok: true,
    snapshot_at: new Date().toISOString(),
    lookback_days: lookbackDays,
    data: authenticated ? data : publicSnapshotData(data),
    warnings,
  });
}

const statusPaths: Record<string, string> = {
  notification_sends: "notification_sends?select=id,sent_at,channel,message_type,dedupe_key,title,body,link_url,status,error,created_at&order=sent_at.desc&limit=120",
  negative_watch_runs: "negative_watch_runs?select=run_key,scanned_at,minutes_back,scanned_count,negative_count,new_negative_count,status,message,created_at&order=scanned_at.desc,created_at.desc&limit=80",
  report_runs: "report_runs?select=run_key,report_date,report_slot,timestamp,window_label,risk_level,metrics&order=report_date.desc,report_slot.desc&limit=500",
  job_runs: "job_runs?select=run_key,job_type,report_date,report_slot,workflow,status,started_at,finished_at,last_seen_at,error,details,created_at,updated_at&job_type=in.(daily_report,period_report,weekly_report,monthly_report)&order=started_at.desc,created_at.desc&limit=200",
};
const statusKeys: Record<string, string> = { notification_sends: "notifications", negative_watch_runs: "watch_runs", report_runs: "report_runs", job_runs: "job_runs" };
let versionCache: { until: number; value: Record<string, string> } | null = null;
let versionRequest: Promise<Record<string, string>> | null = null;

async function changeVersions() {
  if (versionCache && versionCache.until > Date.now()) return versionCache.value;
  if (versionRequest) return versionRequest;
  versionRequest = (async () => {
    const result = await supabaseRest("dashboard_change_versions?select=topic,revision&limit=5", { method: "GET" });
    if (!result.ok || !Array.isArray(result.data)) throw new Error("changes_unavailable");
    const revisions = Object.fromEntries(result.data.map((row: any) => [row.topic, row.revision]));
    if (!["news_articles", ...Object.keys(statusPaths)].every((key) => typeof revisions[key] === "string" && revisions[key])) {
      throw new Error("changes_incomplete");
    }
    versionCache = { until: Date.now() + 10000, value: revisions };
    return revisions;
  })();
  try { return await versionRequest; }
  finally { versionRequest = null; }
}

async function handleChanges(payload: Record<string, unknown>, authenticated: boolean) {
  try {
    // Read versions BEFORE ledger rows; writes during the read are picked up next time.
    const revisions = await changeVersions();
    const previous = auditObject(payload.revisions);
    const data: Record<string, unknown> = {};
    const warnings: string[] = [];
    await Promise.all(Object.entries(statusPaths).map(async ([topic, path]) => {
      if (previous[topic] === revisions[topic]) return;
      const result = await supabaseRest(path, { method: "GET" });
      const key = statusKeys[topic];
      if (result.ok && Array.isArray(result.data)) data[key] = result.data;
      else warnings.push(key + "_unavailable");
    }));
    if (previous.job_runs !== revisions.job_runs) {
      const result = await supabaseRest("job_runs?select=run_key,status,started_at,finished_at,last_seen_at,workflow,github_run_id&job_type=eq.negative_watch&order=last_seen_at.desc.nullslast&limit=1", { method: "GET" });
      if (result.ok && Array.isArray(result.data)) data.watch_job = result.data[0] || null;
      else warnings.push("watch_job_unavailable");
    }
    const filtered = authenticated ? data : publicSnapshotData(data);
    // Partial responses must not erase unchanged or temporarily unavailable ledgers.
    const visibleData = Object.fromEntries(Object.keys(data).map((key) => [key, key === "watch_job" ? data[key] : filtered[key]]));
    return jsonResponse({ ok: true, revisions, data: visibleData, warnings, snapshot_at: new Date().toISOString() });
  } catch {
    return jsonResponse({ error: "changes_unavailable" }, 503);
  }
}

const workflowLabels: Record<string, string> = {
  "negative-watch.yml": "부정기사 감시", "dashboard-refresh.yml": "기사 수집 갱신",
  "news-briefing.yml": "보고서 생성·발송", "regulator-releases.yml": "금융당국 보도자료",
  "pages-dashboard.yml": "대시보드 배포",
};

async function handleWorkflowHealth(payload: Record<string, unknown>) {
  const id = String(payload.workflow || "");
  if (!Object.hasOwn(workflowLabels, id)) return jsonResponse({ error: "unsupported_workflow" }, 400);
  const unavailable = { id, label: workflowLabels[id], status: "error", latest: null, previousFailures: 0 };
  const claim = await supabaseRpc("claim_dashboard_workflow_read", { p_workflow: id });
  const reserved = auditObject(claim.data);
  if (!claim.ok || typeof reserved.acquired !== "boolean") return jsonResponse({ ok: false, workflow: unavailable }, 503);
  if (!reserved.acquired) return jsonResponse({ ok: true, workflow: reserved.payload || { ...unavailable, status: "loading" }, checkedAt: reserved.checked_at });
  if (!reserved.lease_token) return jsonResponse({ ok: false, workflow: unavailable }, 503);
  let workflow: Record<string, unknown> = unavailable;
  let retryUntil: string | null = null;
  try {
    const token = Deno.env.get("GITHUB_DISPATCH_TOKEN") || Deno.env.get("GITHUB_TOKEN");
    if (!token) throw new Error("github_auth_missing");
    const response = await fetchWithTimeout(`https://api.github.com/repos/incarmarketing/news-monitor/actions/workflows/${id}/runs?branch=main&per_page=5`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    }, githubRequestTimeoutMs);
    if (!response.ok) {
      if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
        const delayMs = Math.max(60000, Number(response.headers.get("retry-after") || 0) * 1000,
          Number(response.headers.get("x-ratelimit-reset") || 0) * 1000 - Date.now());
        retryUntil = new Date(Date.now() + Math.min(delayMs, 24 * 60 * 60 * 1000)).toISOString();
      }
      throw new Error("github_read_failed");
    }
    const body = await response.json();
    if (!Array.isArray(body.workflow_runs)) throw new Error("github_read_malformed");
    const latest = body.workflow_runs[0];
    workflow = { id, label: workflowLabels[id], status: "live", previousFailures: body.workflow_runs.filter((row: any) => ["failure", "timed_out", "action_required"].includes(row.conclusion)).length,
      latest: latest ? { id: latest.id, title: latest.display_title || latest.name, event: latest.event,
        status: latest.status, conclusion: latest.conclusion, createdAt: latest.created_at,
        updatedAt: latest.updated_at, url: latest.html_url } : null };
  } catch { /* Rate limits and provider details are not collection failures or public error text. */ }
  const checkedAt = new Date().toISOString();
  const saved = await supabaseRest(`dashboard_workflow_cache?workflow=eq.${encodeURIComponent(id)}&lease_token=eq.${encodeURIComponent(reserved.lease_token)}`, {
    method: "PATCH", contentType: "application/json", body: JSON.stringify({ payload: workflow, checked_at: checkedAt, lease_until: retryUntil, lease_token: null }),
  });
  if (!saved.ok) return jsonResponse({ ok: false, workflow: unavailable }, 503);
  return jsonResponse({ ok: true, workflow, checkedAt });
}

function pickFields(row: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
}

function publicWatchMessage(message: unknown) {
  const text = String(message || "");
  const token = text.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
  // Preserve the legacy empty-scan signal without returning exception or provider text.
  return token.includes("no_new_negative_article") || token.includes("no_negative_article_found")
    || /신규\s*부정\s*기사\s*(?:가\s*)?없/.test(text) || /새\s*부정\s*기사\s*(?:가\s*)?없/.test(text)
    ? "no_new_negative_articles" : "";
}

function publicReportMetrics(value: unknown) {
  const metrics = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, unknown> = {};
  for (const key of ["total_collected", "total_after_cluster", "own_negative", "own_total"]) {
    if (typeof metrics[key] === "number" && Number.isFinite(metrics[key])) result[key] = metrics[key];
  }
  for (const key of ["by_category", "by_tone", "own_by_tone"]) {
    const group = metrics[key];
    if (group && typeof group === "object" && !Array.isArray(group)) {
      result[key] = Object.fromEntries(Object.entries(group).filter(([, count]) => typeof count === "number" && Number.isFinite(count)));
    }
  }
  if (["LOW", "MEDIUM", "HIGH"].includes(String(metrics.risk_level))) result.risk_level = metrics.risk_level;
  return result;
}

function publicNotificationBody(row: Record<string, unknown>) {
  if (!/daily_report|weekly_report|monthly_report|일일|주간|월간|언론 동향/i.test(`${row.title || ""} ${row.message_type || ""}`)) return "";
  // Older delayed deliveries encode the report slot only in their message body.
  const text = String(row.body || "");
  const date = text.match(/20\d{2}[-.]\d{2}[-.]\d{2}/)?.[0] || "";
  const slot = text.match(/(?:slot|report_slot)[=:\s-]*(0?8|13|18)/i)
    || text.match(/(?:^|[\sT])((?:0?8)|13|18):[0-5]\d/)
    || text.match(/(?:^|[^0-9])((?:0?8)|13|18)\s*시/);
  return [date, slot ? `report_slot=${slot[1].padStart(2, "0")}` : ""].filter(Boolean).join(" ");
}

function publicSnapshotData(data: Record<string, unknown>) {
  const rows = (key: string) => Array.isArray(data[key]) ? data[key] as Record<string, unknown>[] : [];
  return {
    articles: data.articles,
    notifications: rows("notifications").map((row) => ({
      ...pickFields(row, ["id", "sent_at", "channel", "message_type", "dedupe_key", "title", "link_url", "status", "created_at"]),
      body: publicNotificationBody(row),
    })),
    watch_runs: rows("watch_runs").map((row) => ({
      ...pickFields(row, ["run_key", "scanned_at", "minutes_back", "scanned_count", "negative_count", "new_negative_count", "status", "created_at"]),
      message: publicWatchMessage(row.message),
    })),
    report_runs: rows("report_runs").map((row) => ({
      ...pickFields(row, ["run_key", "report_date", "report_slot", "timestamp", "window_label", "risk_level"]),
      metrics: publicReportMetrics(row.metrics),
    })),
    job_runs: rows("job_runs").map((row) => pickFields(row, [
      "run_key", "job_type", "report_date", "report_slot", "workflow", "status", "started_at", "finished_at", "last_seen_at", "created_at", "updated_at",
    ])),
  };
}

async function handleRest(payload: Record<string, unknown>, session: SessionInfo) {
  const path = String(payload.path || "");
  const method = String(payload.method || "GET").toUpperCase();
  const body = payload.body;
  const extraHeaders = (payload.headers && typeof payload.headers === "object")
    ? payload.headers as Record<string, string>
    : {};

  const tableName = sanitizeRestPath(path);
  const access = tableAccess[tableName];
  if (!access) {
    return jsonResponse({ error: "table_not_allowed" }, 403);
  }
  if (method === "GET" || method === "HEAD") {
    if (!access.read) return jsonResponse({ error: "read_not_allowed" }, 403);
  } else if (!access.writeRoles.includes(session.role || "")) {
    return jsonResponse({ error: "write_not_allowed" }, 403);
  }

  const result = await supabaseRest(path, {
    method,
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
    prefer: extraHeaders.Prefer || extraHeaders.prefer || "",
    contentType: body === undefined || body === null ? "" : "application/json",
  });

  return jsonResponse(result, result.ok ? 200 : 502);
}

function sanitizeRestPath(path: string) {
  if (!path || path.includes("/") || path.includes("..") || path.includes("\\")) {
    throw new Error("invalid_rest_path");
  }
  const [tableName] = path.split("?");
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error("invalid_table");
  }
  return tableName;
}

async function verifySession(token: string): Promise<SessionInfo> {
  const response = await supabaseRpc("verify_dashboard_session", { p_session_token: token });
  if (!response.ok) return { ok: false, message: `session_rpc_${response.status}` };
  return response.data as SessionInfo;
}

async function revokeSession(token: string) {
  const result = await supabaseRpc("revoke_dashboard_session", { p_session_token: token });
  return jsonResponse(result, result.ok ? 200 : 502);
}

async function triggerCollection(
  session: SessionInfo,
  payload: Record<string, unknown>,
  publicDashboardRefresh = false,
) {
  const authenticated = session.ok === true;
  if (!publicDashboardRefresh && (!authenticated || !["admin", "editor"].includes(session.role || ""))) {
    return jsonResponse({ error: "write_not_allowed" }, 403);
  }

  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER") || "incarmarketing";
  const repo = Deno.env.get("GITHUB_REPO") || "news-monitor";
  const workflow = publicDashboardRefresh
    ? "dashboard-refresh.yml"
    : sanitizeWorkflow(payload.workflow || Deno.env.get("GITHUB_WORKFLOW_FILE") || "dashboard-refresh.yml");
  const ref = Deno.env.get("GITHUB_REF") || "main";
  const periodReports = publicDashboardRefresh
    ? "none"
    : sanitizeChoice(payload.period_reports, ["none", "weekly", "monthly", "both"], "none");
  const sendSlack = !publicDashboardRefresh && (payload.send_slack === true
    || String(payload.send_slack || "").toLowerCase() === "true");
  const forceSlackSend = !publicDashboardRefresh && (payload.force_slack_send === true
    || String(payload.force_slack_send || "").toLowerCase() === "true");
  const dashboardSend = !publicDashboardRefresh && (payload.dashboard_send === true
    || String(payload.dashboard_send || "").toLowerCase() === "true");
  const reportSlot = publicDashboardRefresh
    ? "auto"
    : sanitizeChoice(payload.report_slot, ["auto", "07", "08", "13", "18"], "auto");
  const reportMonth = publicDashboardRefresh ? "" : sanitizeReportMonth(payload.report_month);

  if (!token) {
    return jsonResponse({ error: "missing_github_dispatch_token" }, 500);
  }

  const manualReportSend = dashboardSend && sendSlack && forceSlackSend;
  const cooldownMinutes = manualReportSend
    ? 0
    : authenticated
    ? numberEnv("DASHBOARD_REFRESH_COOLDOWN_MINUTES", 2)
    : numberEnv("DASHBOARD_PUBLIC_REFRESH_COOLDOWN_MINUTES", 2);
  const runKey = manualReportSend
    ? dashboardReportSendRunKey(workflow, periodReports, reportSlot)
    : dashboardRefreshRunKey(workflow, periodReports, sendSlack, reportSlot, authenticated);
  const atomicRefresh = workflow === "dashboard-refresh.yml";
  let recentDispatch: { active: boolean; retryAfterSeconds: number };
  if (atomicRefresh) {
    const claim = await supabaseRpc("claim_dashboard_refresh", {
      p_cooldown_seconds: Math.max(120, Math.ceil(cooldownMinutes * 60)),
      p_requested_by: session.employee_no || "dashboard_public_refresh",
      p_authenticated: authenticated,
    });
    const result = claim.data as { claimed?: boolean; retry_after_seconds?: number } | null;
    if (!claim.ok || !result || typeof result.claimed !== "boolean") {
      return jsonResponse({ error: "refresh_reservation_unavailable", retry_after_seconds: 30 }, 503);
    }
    recentDispatch = { active: !result.claimed, retryAfterSeconds: Number(result.retry_after_seconds || 120) };
  } else {
    recentDispatch = await hasRecentDashboardDispatch(runKey, cooldownMinutes);
  }
  if (recentDispatch.active) {
    return jsonResponse({
      ok: true,
      throttled: true,
      workflow,
      ref,
      retry_after_seconds: recentDispatch.retryAfterSeconds,
      message: `최근 갱신 요청이 처리 중입니다. ${recentDispatch.retryAfterSeconds}초 후 다시 시도하세요.`,
      requested_at: new Date().toISOString(),
    }, 202);
  }

  if (!atomicRefresh) await recordDashboardDispatch(runKey, {
    workflow,
    status: "dashboard_dispatched",
    source: String(payload.source || "dashboard_manual_refresh"),
    requestedBy: session.employee_no || "dashboard_public_refresh",
    authenticated,
  });

  let dispatchResult: { response: Response; detail: string };
  try {
    dispatchResult = await githubDispatchWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref,
          inputs: workflowInputs(workflow, periodReports, sendSlack, reportSlot, forceSlackSend, dashboardSend, reportMonth),
        }),
      },
    );
  } catch (error) {
    const detail = boundedError(error);
    await recordDashboardDispatch(runKey, {
      workflow,
      status: "failed",
      source: String(payload.source || "dashboard_manual_refresh"),
      requestedBy: session.employee_no || "dashboard_public_refresh",
      authenticated,
      error: detail,
    });
    return jsonResponse({ error: "github_dispatch_failed", ...(authenticated ? { detail } : {}) }, 502);
  }

  if (!dispatchResult.response.ok) {
    const detail = dispatchResult.detail;
    await recordDashboardDispatch(runKey, {
      workflow,
      status: "failed",
      source: String(payload.source || "dashboard_manual_refresh"),
      requestedBy: session.employee_no || "dashboard_public_refresh",
      authenticated,
      error: detail.slice(0, 500),
    });
    return jsonResponse({
      error: "github_dispatch_failed",
      status: dispatchResult.response.status,
      ...(authenticated ? { detail } : {}),
    }, 502);
  }

  return jsonResponse({
    ok: true,
    workflow,
    ref,
    inputs: workflowInputs(workflow, periodReports, sendSlack, reportSlot, forceSlackSend, dashboardSend, reportMonth),
    requested_by: session.employee_no || "dashboard_public_refresh",
    requested_at: new Date().toISOString(),
  });
}

function dashboardRefreshRunKey(
  workflow: string,
  periodReports: string,
  sendSlack: boolean,
  reportSlot: string,
  authenticated: boolean,
) {
  if (workflow === "dashboard-refresh.yml") return "dashboard_refresh:shared:dashboard-refresh.yml:none:nosend:auto";
  const scope = authenticated ? "auth" : "public";
  return `dashboard_refresh:${scope}:${workflow}:${periodReports}:${sendSlack ? "send" : "nosend"}:${reportSlot}`;
}

function dashboardReportSendRunKey(workflow: string, periodReports: string, reportSlot: string) {
  return `dashboard_report_send:${workflow}:${periodReports}:${reportSlot}:${Date.now()}`;
}

async function hasRecentDashboardDispatch(runKey: string, cooldownMinutes: number) {
  if (cooldownMinutes <= 0) return { active: false, retryAfterSeconds: 0 };
  const result = await supabaseRest(
    `job_runs?select=run_key,status,last_seen_at&run_key=eq.${encodeURIComponent(runKey)}&limit=1`,
    { method: "GET" },
  );
  const rows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
  const row = rows[0];
  if (!row?.last_seen_at) return { active: false, retryAfterSeconds: 0 };
  const lastSeen = new Date(String(row.last_seen_at)).getTime();
  if (!Number.isFinite(lastSeen)) return { active: false, retryAfterSeconds: 0 };
  const elapsedSeconds = Math.floor((Date.now() - lastSeen) / 1000);
  const cooldownSeconds = cooldownMinutes * 60;
  if (elapsedSeconds >= cooldownSeconds) return { active: false, retryAfterSeconds: 0 };
  return { active: true, retryAfterSeconds: Math.max(1, cooldownSeconds - elapsedSeconds) };
}

async function recordDashboardDispatch(
  runKey: string,
  details: {
    workflow: string;
    status: string;
    source: string;
    requestedBy: string;
    authenticated: boolean;
    error?: string;
  },
) {
  const now = new Date().toISOString();
  await supabaseRest("job_runs?on_conflict=run_key", {
    method: "POST",
    body: JSON.stringify([{
      run_key: runKey,
      job_type: "dashboard_refresh",
      expected_at: now,
      status: details.status,
      started_at: details.status === "failed" ? undefined : now,
      finished_at: details.status === "failed" ? now : undefined,
      last_seen_at: now,
      triggered_by: "dashboard",
      provider: details.source,
      workflow: details.workflow,
      error: details.error || "",
      details: {
        requested_by: details.requestedBy,
        authenticated: details.authenticated,
        source: details.source,
      },
    }]),
    prefer: "resolution=merge-duplicates,return=minimal",
    contentType: "application/json",
  });
}

function sanitizeWorkflow(value: unknown) {
  const workflow = String(value || "").trim();
  if (workflow === "regulator-releases.yml") return "pages-dashboard.yml";
  return ["dashboard-refresh.yml", "news-briefing.yml", "pages-dashboard.yml"].includes(workflow)
    ? workflow
    : "dashboard-refresh.yml";
}

function isPublicDashboardRefreshRequest(
  action: string,
  payload: Record<string, unknown>,
  origin: string | null,
) {
  if (action !== "trigger_collection" || !isAllowedPublicRefreshOrigin(origin)) return false;
  const workflow = String(payload.workflow || "dashboard-refresh.yml").trim();
  const periodReports = String(payload.period_reports || "none").trim();
  const reportSlot = String(payload.report_slot || "auto").trim();
  return workflow === "dashboard-refresh.yml"
    && periodReports === "none"
    && reportSlot === "auto"
    && !booleanInput(payload.send_slack)
    && !booleanInput(payload.force_slack_send)
    && !booleanInput(payload.dashboard_send);
}

function isPublicDashboardSnapshotRequest(action: string, origin: string | null) {
  return action === "snapshot" && isAllowedPublicRefreshOrigin(origin);
}

function isAllowedPublicRefreshOrigin(origin: string | null) {
  const normalized = String(origin || "").trim().replace(/\/$/, "");
  if (!normalized) return false;
  const configured = String(Deno.env.get("DASHBOARD_PUBLIC_REFRESH_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowed = configured.length ? configured : ["https://incarmarketing.github.io"];
  return allowed.includes(normalized)
    || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(normalized);
}

function booleanInput(value: unknown) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function workflowInputs(
  workflow: string,
  periodReports: string,
  sendSlack: boolean,
  reportSlot: string,
  forceSlackSend = false,
  dashboardSend = false,
  reportMonth = "",
) {
  if (["dashboard-refresh.yml", "pages-dashboard.yml"].includes(workflow)) return {};
  const inputs: Record<string, string> = {
    period_reports: periodReports,
    send_slack: String(sendSlack),
    force_slack_send: String(forceSlackSend),
    dashboard_send: String(dashboardSend),
    report_slot: reportSlot,
  };
  if (reportMonth) inputs.report_month = reportMonth;
  return inputs;
}

function sanitizeChoice(value: unknown, allowed: string[], fallback: string) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(Deno.env.get(name) || "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeReportMonth(value: unknown) {
  const month = String(value || "").trim();
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}

async function supabaseRpc(functionName: string, body: Record<string, unknown>) {
  return supabaseFetch(`rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(body),
    contentType: "application/json",
  });
}

async function supabaseRest(path: string, options: { method: string; body?: string; prefer?: string; contentType?: string }) {
  return supabaseFetch(path, options);
}

async function supabaseFetch(path: string, options: { method: string; body?: string; prefer?: string; contentType?: string }) {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return { ok: false, status: 500, data: { error: "missing_supabase_service_config" } };
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  if (options.contentType) headers["Content-Type"] = options.contentType;
  if (options.prefer) headers.Prefer = options.prefer;

  const response = await fetchWithTimeout(`${url}/rest/v1/${path}`, {
    method: options.method,
    cache: "no-store",
    headers,
    body: options.body,
  }, supabaseRequestTimeoutMs);
  const text = await response.text();
  let data: unknown = true;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: response.ok, status: response.status, data };
}

async function githubDispatchWithRetry(url: string, init: RequestInit) {
  let lastError: unknown = new Error("github_dispatch_failed");
  for (let attempt = 1; attempt <= githubDispatchAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, githubRequestTimeoutMs);
      const detail = response.ok ? "" : (await response.text()).slice(0, 500);
      if (response.ok || !isTransientStatus(response.status) || attempt === githubDispatchAttempts) {
        return { response, detail };
      }
      lastError = new Error(`github_dispatch_failed_${response.status}: ${detail}`);
    } catch (error) {
      lastError = error;
      if (attempt === githubDispatchAttempts) throw error;
    }
    await delay(1500);
  }
  throw lastError;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`request_timeout_${timeoutMs}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

function boundedError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 500);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function safeJson<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    return {} as T;
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = new Set([
    Deno.env.get("PUBLIC_SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    Deno.env.get("PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    ...jsonSecretValues(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
  ].filter((value): value is string => Boolean(value)));
  return allowed.has(apiKey);
}

function jsonSecretValues(raw: string | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((value) => typeof value === "string");
    if (parsed && typeof parsed === "object") {
      return Object.values(parsed).filter((value) => typeof value === "string") as string[];
    }
  } catch {
    // Keep legacy single-key environments working when the managed JSON secret is absent.
  }
  return [];
}
