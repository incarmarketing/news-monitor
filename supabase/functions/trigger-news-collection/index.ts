const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  action?: "dispatch" | "watchdog";
  workflow?: string;
  inputs?: Record<string, string | boolean>;
  source?: string;
};

const owner = Deno.env.get("GITHUB_OWNER") || "incarmarketing";
const repo = Deno.env.get("GITHUB_REPO") || "news-monitor";
const ref = Deno.env.get("GITHUB_REF") || "main";
const githubApiVersion = "2022-11-28";
const kstOffsetMs = 9 * 60 * 60 * 1000;
const periodReports = {
  weekly: {
    messageType: "weekly_report",
    title: "\uC8FC\uAC04 \uC5B8\uB860 \uBAA8\uB2C8\uD130\uB9C1 \uBCF4\uACE0\uC11C",
  },
  monthly: {
    messageType: "monthly_report",
    title: "\uC6D4\uAC04 \uC5B8\uB860 \uBAA8\uB2C8\uD130\uB9C1 \uBCF4\uACE0\uC11C",
  },
} as const;
type PeriodReportKind = keyof typeof periodReports;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const body = await safeJson<RequestBody>(req);
  const action = body.action || "dispatch";
  if (!isAllowedRequest(req, action)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    if (action === "watchdog") {
      return jsonResponse(await runWatchdog(body.source || "supabase_watchdog"));
    }
    const workflow = sanitizeWorkflow(body.workflow || Deno.env.get("GITHUB_WORKFLOW_FILE") || "news-briefing.yml");
    const inputs = sanitizeWorkflowInputs(workflow, body.inputs);
    const result = await dispatchWorkflow(workflow, inputs);
    return jsonResponse({
      ok: true,
      message: "news workflow dispatched",
      workflow,
      ref,
      inputs,
      requested_at: new Date().toISOString(),
      dispatch: result,
    });
  } catch (error) {
    return jsonResponse({ error: "trigger_failed", detail: String(error?.message || error) }, 500);
  }
});

async function runWatchdog(source: string) {
  const dispatched: unknown[] = [];
  const skipped: unknown[] = [];
  const errors: unknown[] = [];

  for (const period of duePeriodReports()) {
    try {
      const result = await ensurePeriodReport(period, source);
      (result.dispatched ? dispatched : skipped).push(result);
    } catch (error) {
      errors.push({ job: "period_report", period, error: String(error?.message || error) });
    }
  }

  for (const slot of dueDailySlots()) {
    try {
      const result = await ensureDailyReport(slot, source);
      (result.dispatched ? dispatched : skipped).push(result);
    } catch (error) {
      errors.push({ job: "daily_report", slot, error: String(error?.message || error) });
    }
  }

  try {
    const result = await ensureNegativeWatch(source);
    (result.dispatched ? dispatched : skipped).push(result);
  } catch (error) {
    errors.push({ job: "negative_watch", error: String(error?.message || error) });
  }

  return {
    ok: errors.length === 0,
    source,
    checked_at: new Date().toISOString(),
    dispatched,
    skipped,
    errors,
  };
}

async function ensureDailyReport(slot: string, source: string) {
  const date = kstDate();
  const runKey = `daily_report:${date}:${slot}`;
  const dispatchKey = `watchdog:daily_report:${date}:${slot}`;
  if (await dailyReportSucceeded(date, slot)) {
    return { job: "daily_report", slot, date, dispatched: false, reason: "already_success" };
  }
  if (await hasFreshDispatch(runKey)) {
    return { job: "daily_report", slot, date, dispatched: false, reason: "report_run_in_flight" };
  }
  if (await hasFreshWatchdogDispatch(dispatchKey)) {
    return { job: "daily_report", slot, date, dispatched: false, reason: "watchdog_dispatch_in_flight" };
  }

  await recordJobRun({
    run_key: dispatchKey,
    job_type: "watchdog",
    report_date: date,
    report_slot: slot,
    expected_at: expectedAtIso(slot),
    status: "started",
    started_at: new Date().toISOString(),
    finished_at: null,
    last_seen_at: new Date().toISOString(),
    triggered_by: "supabase_watchdog",
    provider: source,
    workflow: "news-briefing.yml",
    details: { reason: "missing_daily_report_or_send", target_run_key: runKey, source },
  });
  try {
    const dispatch = await dispatchWorkflow("news-briefing.yml", {
      period_reports: "none",
      send_slack: "true",
      send_kakao: "true",
      report_slot: slot,
      backfill_only: "false",
    });
    await recordJobRun({
      run_key: dispatchKey,
      job_type: "watchdog",
      report_date: date,
      report_slot: slot,
      expected_at: expectedAtIso(slot),
      status: "success",
      finished_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      triggered_by: "supabase_watchdog",
      provider: source,
      workflow: "news-briefing.yml",
      error: "",
      details: { reason: "missing_daily_report_or_send", target_run_key: runKey, source, dispatch },
    });
  } catch (error) {
    await recordJobRun({
      run_key: dispatchKey,
      job_type: "watchdog",
      report_date: date,
      report_slot: slot,
      expected_at: expectedAtIso(slot),
      status: "failed",
      finished_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      triggered_by: "supabase_watchdog",
      provider: source,
      workflow: "news-briefing.yml",
      error: String(error?.message || error),
      details: { reason: "missing_daily_report_or_send", target_run_key: runKey, source },
    });
    throw error;
  }
  return { job: "daily_report", slot, date, dispatched: true, reason: "missing_daily_report_or_send" };
}

async function ensurePeriodReport(period: PeriodReportKind, source: string) {
  const date = kstDate();
  const runKey = `period_report:${date}:07`;
  const dispatchKey = `watchdog:period_report:${date}:07`;
  if (await periodReportSucceeded(period)) {
    return { job: "period_report", period, date, dispatched: false, reason: "already_success" };
  }
  if (await hasFreshDispatch(runKey)) {
    return { job: "period_report", period, date, dispatched: false, reason: "report_run_in_flight" };
  }
  if (await hasFreshWatchdogDispatch(dispatchKey)) {
    return { job: "period_report", period, date, dispatched: false, reason: "watchdog_dispatch_in_flight" };
  }

  await recordJobRun({
    run_key: dispatchKey,
    job_type: "watchdog",
    report_date: date,
    report_slot: "07",
    expected_at: expectedAtIso("07"),
    status: "started",
    started_at: new Date().toISOString(),
    finished_at: null,
    last_seen_at: new Date().toISOString(),
    triggered_by: "supabase_watchdog",
    provider: source,
    workflow: "news-briefing.yml",
    details: { reason: "missing_period_report_or_send", period, target_run_key: runKey, source },
  });
  try {
    const dispatch = await dispatchWorkflow("news-briefing.yml", {
      period_reports: "both",
      send_slack: "true",
      send_kakao: "true",
      report_slot: "07",
      backfill_only: "false",
    });
    await recordJobRun({
      run_key: dispatchKey,
      job_type: "watchdog",
      report_date: date,
      report_slot: "07",
      expected_at: expectedAtIso("07"),
      status: "success",
      finished_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      triggered_by: "supabase_watchdog",
      provider: source,
      workflow: "news-briefing.yml",
      error: "",
      details: { reason: "missing_period_report_or_send", period, target_run_key: runKey, source, dispatch },
    });
  } catch (error) {
    await recordJobRun({
      run_key: dispatchKey,
      job_type: "watchdog",
      report_date: date,
      report_slot: "07",
      expected_at: expectedAtIso("07"),
      status: "failed",
      finished_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      triggered_by: "supabase_watchdog",
      provider: source,
      workflow: "news-briefing.yml",
      error: String(error?.message || error),
      details: { reason: "missing_period_report_or_send", period, target_run_key: runKey, source },
    });
    throw error;
  }
  return { job: "period_report", period, date, dispatched: true, reason: "missing_period_report_or_send" };
}

async function ensureNegativeWatch(source: string) {
  const latest = await selectRows(
    "negative_watch_runs",
    "select=scanned_at,status&order=scanned_at.desc,created_at.desc&limit=1",
  );
  const latestAt = latest[0]?.scanned_at ? new Date(String(latest[0].scanned_at)) : null;
  const threshold = Number(Deno.env.get("WATCHDOG_NEGATIVE_MAX_AGE_MINUTES") || "7");
  const stale = !latestAt || Date.now() - latestAt.getTime() > threshold * 60 * 1000;
  if (!stale) {
    return { job: "negative_watch", dispatched: false, reason: "recent_success", latest_at: latestAt?.toISOString() || "" };
  }

  const runKey = `negative_watch:watchdog:${fiveMinuteBucketKey()}`;
  if (await hasFreshDispatch(runKey)) {
    return { job: "negative_watch", dispatched: false, reason: "dispatch_in_flight", run_key: runKey };
  }
  await recordJobRun({
    run_key: runKey,
    job_type: "negative_watch",
    expected_at: new Date().toISOString(),
    status: "watchdog_dispatched",
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    triggered_by: "supabase_watchdog",
    provider: source,
    workflow: "negative-watch.yml",
    details: { reason: "negative_watch_stale", latest_at: latestAt?.toISOString() || "", source },
  });
  await dispatchWorkflow("negative-watch.yml");
  return { job: "negative_watch", dispatched: true, reason: "negative_watch_stale", latest_at: latestAt?.toISOString() || "" };
}

function dueDailySlots() {
  const now = kstNowParts();
  const grace = Number(Deno.env.get("WATCHDOG_REPORT_GRACE_MINUTES") || "7");
  return ["08", "13", "18"].filter((slot) => {
    const due = new Date(Date.UTC(now.year, now.month - 1, now.day, Number(slot) - 9, grace, 0));
    return Date.now() >= due.getTime();
  });
}

function duePeriodReports(): PeriodReportKind[] {
  const now = kstNowParts();
  const grace = Number(Deno.env.get("WATCHDOG_REPORT_GRACE_MINUTES") || "7");
  const due = new Date(Date.UTC(now.year, now.month - 1, now.day, 7 - 9, grace, 0));
  if (Date.now() < due.getTime()) return [];

  const result: PeriodReportKind[] = [];
  if (now.weekday === 1) result.push("weekly");
  if (now.day === 1) result.push("monthly");
  return result;
}

async function dailyReportSucceeded(date: string, slot: string) {
  const reportRows = await selectRows(
    "report_runs",
    `select=run_key&report_date=eq.${encodeURIComponent(date)}&report_slot=eq.${encodeURIComponent(slot)}&limit=1`,
  );
  const title = `\uC77C\uC77C \uC5B8\uB860 \uB3D9\uD5A5 ${date} ${slot}`;
  const sendRows = await selectRows(
    "notification_sends",
    `select=id&message_type=eq.daily_report&title=eq.${encodeURIComponent(title)}&status=eq.success&limit=1`,
  );
  const jobRows = await selectRows(
    "job_runs",
    `select=run_key&run_key=eq.${encodeURIComponent(`daily_report:${date}:${slot}`)}&status=eq.success&limit=1`,
  );
  return reportRows.length > 0 && (sendRows.length > 0 || jobRows.length > 0);
}

async function periodReportSucceeded(period: PeriodReportKind) {
  const config = periodReports[period];
  const bounds = kstDayBoundsIso();
  const rows = await selectRows(
    "notification_sends",
    `select=id&message_type=eq.${encodeURIComponent(config.messageType)}&title=eq.${encodeURIComponent(config.title)}&status=eq.success&sent_at=gte.${encodeURIComponent(bounds.start)}&sent_at=lt.${encodeURIComponent(bounds.end)}&limit=1`,
  );
  return rows.length > 0;
}

async function hasFreshDispatch(runKey: string) {
  const rows = await selectRows(
    "job_runs",
    `select=run_key,status,last_seen_at&run_key=eq.${encodeURIComponent(runKey)}&limit=1`,
  );
  const row = rows[0];
  if (!row) return false;
  if (row.status === "success") return true;
  if (!["started", "dispatched", "watchdog_dispatched"].includes(String(row.status))) return false;
  const seenAt = row.last_seen_at ? new Date(String(row.last_seen_at)) : null;
  const maxAge = Number(Deno.env.get("WATCHDOG_INFLIGHT_MINUTES") || "8");
  return Boolean(seenAt && Date.now() - seenAt.getTime() < maxAge * 60 * 1000);
}

async function hasFreshWatchdogDispatch(runKey: string) {
  const rows = await selectRows(
    "job_runs",
    `select=run_key,status,last_seen_at&run_key=eq.${encodeURIComponent(runKey)}&limit=1`,
  );
  const row = rows[0];
  if (!row) return false;
  if (row.status === "failed" || row.status === "cancelled") return false;
  const seenAt = row.last_seen_at ? new Date(String(row.last_seen_at)) : null;
  const maxAge = Number(Deno.env.get("WATCHDOG_INFLIGHT_MINUTES") || "8");
  return Boolean(seenAt && Date.now() - seenAt.getTime() < maxAge * 60 * 1000);
}

async function dispatchWorkflow(workflow: string, inputs?: Record<string, string>) {
  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  if (!token) {
    throw new Error("missing_github_dispatch_token");
  }
  const payload: Record<string, unknown> = { ref };
  if (inputs && Object.keys(inputs).length) payload.inputs = inputs;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": githubApiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`github_dispatch_failed_${response.status}: ${await response.text()}`);
  }
  return { status: response.status, workflow };
}

async function selectRows(table: string, query: string) {
  const result = await supabaseFetch(`${table}?${query}`, { method: "GET" });
  return Array.isArray(result) ? result : [];
}

async function recordJobRun(row: Record<string, unknown>) {
  await supabaseFetch("job_runs?on_conflict=run_key", {
    method: "POST",
    body: JSON.stringify([row]),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function supabaseFetch(path: string, options: { method: string; body?: string; prefer?: string }) {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("missing_supabase_service_config");
  }
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method,
    cache: "no-store",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "",
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase_rest_${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : true;
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

function isAllowedRequest(req: Request, action: string) {
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET");
  if (schedulerSecret && req.headers.get("x-scheduler-secret") === schedulerSecret) return true;
  if (isAllowedApiKey(req.headers.get("apikey"))) return true;
  const authorization = req.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ") && isAllowedApiKey(authorization.slice(7))) return true;
  return false;
}

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = new Set<string>();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey) allowed.add(anonKey);
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys);
      if (typeof parsed === "string") allowed.add(parsed);
      else if (parsed && typeof parsed === "object") {
        Object.values(parsed).forEach((value) => {
          if (typeof value === "string") allowed.add(value);
        });
      }
    } catch {
      allowed.add(publishableKeys);
    }
  }
  return allowed.has(apiKey);
}

function sanitizeWorkflow(value: string) {
  return ["news-briefing.yml", "negative-watch.yml", "regulator-releases.yml"].includes(value) ? value : "news-briefing.yml";
}

function sanitizeWorkflowInputs(workflow: string, inputs?: Record<string, string | boolean>) {
  if (workflow === "negative-watch.yml" || workflow === "regulator-releases.yml") return {};
  return sanitizeInputs(inputs || {
    period_reports: "none",
    send_slack: "false",
    send_kakao: "false",
    report_slot: "auto",
    backfill_only: "false",
  });
}

function sanitizeInputs(inputs: Record<string, string | boolean>) {
  const result: Record<string, string> = {};
  const period = String(inputs.period_reports || "none");
  result.period_reports = ["none", "weekly", "monthly", "both"].includes(period) ? period : "none";
  const sendSlack = String(inputs.send_slack || inputs.send_kakao || "false") === "true";
  result.send_slack = sendSlack ? "true" : "false";
  result.send_kakao = sendSlack ? "true" : "false";
  const slot = String(inputs.report_slot || "auto");
  result.report_slot = ["auto", "07", "08", "13", "18"].includes(slot) ? slot : "auto";
  result.backfill_only = String(inputs.backfill_only || "false") === "true" ? "true" : "false";
  return result;
}

function kstNowParts() {
  const shifted = new Date(Date.now() + kstOffsetMs);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function kstDate() {
  const p = kstNowParts();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function kstDayBoundsIso() {
  const p = kstNowParts();
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, -9, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function expectedAtIso(slot: string) {
  const p = kstNowParts();
  return new Date(Date.UTC(p.year, p.month - 1, p.day, Number(slot) - 9, 0, 0)).toISOString();
}

function fiveMinuteBucketKey() {
  const p = kstNowParts();
  const minute = Math.floor(p.minute / 5) * 5;
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}${String(p.hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`;
}
