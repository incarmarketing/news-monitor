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
  monitor_keywords: { read: true, writeRoles: ["admin", "editor"] },
  monitor_profiles: { read: true, writeRoles: ["admin", "editor"] },
  article_scraps: { read: true, writeRoles: ["admin", "editor", "reporter"] },
  media_relations: { read: true, writeRoles: ["admin", "editor"] },
  reporters: { read: true, writeRoles: ["admin", "editor"] },
  ad_spends: { read: true, writeRoles: ["admin", "editor"] },
  press_aliases: { read: true, writeRoles: ["admin", "editor"] },
  notification_sends: { read: true, writeRoles: [] },
  negative_watch_runs: { read: true, writeRoles: [] },
};

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

  const sessionToken = req.headers.get("x-dashboard-session") || "";
  const session = await verifySession(sessionToken);
  if (!session.ok) {
    return jsonResponse({ error: "invalid_session", detail: session.message || "" }, 401);
  }

  const body = await safeJson<DashboardRequest>(req);
  const action = String(body.action || "");
  const payload = body.payload || {};

  try {
    if (action === "rest") {
      return await handleRest(payload, session);
    }
    if (action === "trigger_collection") {
      return await triggerCollection(session, payload);
    }
    if (action === "logout") {
      return await revokeSession(sessionToken);
    }
    return jsonResponse({ error: "unknown_action" }, 400);
  } catch (error) {
    return jsonResponse({ error: "dashboard_api_failed", detail: String(error?.message || error) }, 500);
  }
});

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

async function triggerCollection(session: SessionInfo, payload: Record<string, unknown>) {
  if (!["admin", "editor"].includes(session.role || "")) {
    return jsonResponse({ error: "write_not_allowed" }, 403);
  }

  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN") || Deno.env.get("CRON_DISPATCH_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER") || "incarmarketing";
  const repo = Deno.env.get("GITHUB_REPO") || "news-monitor";
  const workflow = sanitizeWorkflow(String(payload.workflow || Deno.env.get("GITHUB_WORKFLOW_FILE") || "news-briefing.yml"));
  const ref = Deno.env.get("GITHUB_REF") || "main";
  const periodReports = sanitizeChoice(payload.period_reports, ["none", "weekly", "monthly", "both"], "none");
  const sendKakao = payload.send_kakao === true || String(payload.send_kakao || "").toLowerCase() === "true";
  const reportSlot = sanitizeChoice(payload.report_slot, ["auto", "07", "08", "13", "18"], "auto");

  if (!token) {
    return jsonResponse({ error: "missing_github_dispatch_token" }, 500);
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildWorkflowDispatchBody(workflow, ref, {
        period_reports: periodReports,
        send_kakao: String(sendKakao),
        report_slot: reportSlot,
      })),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: "github_dispatch_failed", status: response.status, detail }, 502);
  }

  return jsonResponse({
    ok: true,
    workflow,
    ref,
    inputs: {
      period_reports: periodReports,
      send_kakao: sendKakao,
      report_slot: reportSlot,
    },
    requested_by: session.employee_no,
    requested_at: new Date().toISOString(),
  });
}

function sanitizeWorkflow(value: string) {
  return ["news-briefing.yml", "negative-watch.yml", "regulator-releases.yml"].includes(value) ? value : "news-briefing.yml";
}

function buildWorkflowDispatchBody(workflow: string, ref: string, inputs: Record<string, string>) {
  if (workflow === "negative-watch.yml" || workflow === "regulator-releases.yml") {
    return { ref };
  }
  return { ref, inputs };
}

function sanitizeChoice(value: unknown, allowed: string[], fallback: string) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
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

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method,
    cache: "no-store",
    headers,
    body: options.body,
  });
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
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = [
    Deno.env.get("PUBLIC_SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ].filter(Boolean);
  return allowed.includes(apiKey);
}
