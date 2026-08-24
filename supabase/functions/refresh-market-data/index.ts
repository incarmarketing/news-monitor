import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const HANTU_APP_KEY = Deno.env.get("HANTU_APP_KEY") || "";
const HANTU_APP_SECRET = Deno.env.get("HANTU_APP_SECRET") || "";
const HANTU_BASE_URL = (Deno.env.get("HANTU_BASE_URL") || "https://openapivts.koreainvestment.com:29443").replace(/\/$/, "");
const MARKET_REFRESH_SECRET = Deno.env.get("MARKET_REFRESH_SECRET") || "";
const PROVIDER = "hantu";
const REQUEST_INTERVAL_MS = 1100;
const RATE_LIMIT_RETRY_MS = 2000;
const PROVIDER_TIMEOUT_MS = 8000;
const PEER_CHUNK_COUNT = 3;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-market-refresh-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WatchRow = {
  code: string;
  name: string;
  group_name: string;
  kind: "company" | "peer" | "index";
  provider_symbol?: string | null;
};

type Quote = {
  code: string;
  name: string;
  group: string;
  kind: string;
  price: number | null;
  change: number | null;
  change_rate: number | null;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  volume: number | null;
  trade_amount: number | null;
  market_status: string;
  source_market: string;
  as_of: string;
  raw: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function kstParts(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

function kstDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date).replace(" ", "T") + "+09:00";
}

function minuteBucket(date = new Date()) {
  const copy = new Date(date);
  copy.setUTCSeconds(0, 0);
  return copy.toISOString();
}

function isMarketWindow(now = new Date()) {
  const parts = kstParts(now);
  if (["Sat", "Sun"].includes(parts.weekday)) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 8 * 60 + 50 && minutes <= 18 * 60 + 10;
}

function selectWatchlist(rows: WatchRow[], now: Date, full: boolean) {
  if (full) return rows;
  const minute = Number(kstParts(now).minute || "0");
  const peerBucket = minute % PEER_CHUNK_COUNT;
  let peerIndex = 0;
  return rows.filter((row) => {
    if (row.kind === "index" || row.kind === "company" || row.group_name === "당사") return true;
    const include = peerIndex % PEER_CHUNK_COUNT === peerBucket;
    peerIndex += 1;
    return include;
  });
}

function isAuthorized(req: Request) {
  return Boolean(MARKET_REFRESH_SECRET) && req.headers.get("x-market-refresh-secret") === MARKET_REFRESH_SECRET;
}

function validateEnv() {
  return [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
    ["HANTU_APP_KEY", HANTU_APP_KEY],
    ["HANTU_APP_SECRET", HANTU_APP_SECRET],
    ["MARKET_REFRESH_SECRET", MARKET_REFRESH_SECRET],
  ].filter(([, value]) => !value).map(([name]) => name);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message
    .replaceAll(HANTU_APP_KEY, "[HANTU_APP_KEY]")
    .replaceAll(HANTU_APP_SECRET, "[HANTU_APP_SECRET]")
    .slice(0, 800);
}

function isRateLimitError(error: unknown) {
  return /EGW00201|초당 거래건수|rate/i.test(safeError(error));
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(supabase: ReturnType<typeof createClient>) {
  const { data: cached } = await supabase
    .from("market_api_tokens")
    .select("access_token,expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (cached?.access_token && new Date(cached.expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
    return cached.access_token as string;
  }

  const { response, body } = await fetchJson(`${HANTU_BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: HANTU_APP_KEY,
      appsecret: HANTU_APP_SECRET,
    }),
  });
  if (!response.ok || !body.access_token) {
    throw new Error(`hantu_token_${response.status}_${body.msg_cd || body.error || ""}_${body.msg1 || body.error_description || "failed"}`);
  }

  const expiresIn = Number(body.expires_in || 86400);
  await supabase.from("market_api_tokens").upsert({
    provider: PROVIDER,
    access_token: body.access_token,
    token_type: body.token_type || "Bearer",
    expires_at: new Date(Date.now() + Math.max(60, expiresIn - 300) * 1000).toISOString(),
    issued_at: new Date().toISOString(),
  }, { onConflict: "provider" });
  return body.access_token as string;
}

async function hantuGet(path: string, trId: string, params: Record<string, string>, token: string) {
  const url = new URL(`${HANTU_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const { response, body } = await fetchJson(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      appkey: HANTU_APP_KEY,
      appsecret: HANTU_APP_SECRET,
      tr_id: trId,
      custtype: "P",
    },
  });
  if (!response.ok || body.rt_cd === "1") {
    throw new Error(`hantu_${trId}_${response.status}_${body.msg_cd || ""}_${body.msg1 || "failed"}`);
  }
  return body.output || body.output1 || body;
}

function indexSymbol(code: string) {
  if (code === "KOSPI") return "0001";
  if (code === "KOSDAQ") return "1001";
  return code;
}

async function fetchQuote(row: WatchRow, token: string): Promise<Quote> {
  const isIndex = row.kind === "index";
  const output = await hantuGet(
    isIndex
      ? "/uapi/domestic-stock/v1/quotations/inquire-index-price"
      : "/uapi/domestic-stock/v1/quotations/inquire-price",
    isIndex ? "FHPUP02100000" : "FHKST01010100",
    {
      FID_COND_MRKT_DIV_CODE: isIndex ? "U" : "J",
      FID_INPUT_ISCD: isIndex ? indexSymbol(row.code) : row.provider_symbol || row.code,
    },
    token,
  );
  return {
    code: row.code,
    name: row.name,
    group: row.group_name,
    kind: row.kind,
    price: numberValue(output.bstp_nmix_prpr || output.stck_prpr),
    change: numberValue(output.bstp_nmix_prdy_vrss || output.prdy_vrss),
    change_rate: numberValue(output.bstp_nmix_prdy_ctrt || output.prdy_ctrt),
    open_price: numberValue(output.bstp_nmix_oprc || output.stck_oprc),
    high_price: numberValue(output.bstp_nmix_hgpr || output.stck_hgpr),
    low_price: numberValue(output.bstp_nmix_lwpr || output.stck_lwpr),
    volume: numberValue(output.acml_vol),
    trade_amount: numberValue(output.acml_tr_pbmn),
    market_status: "minute",
    source_market: isIndex ? "hantu_mock_index" : "hantu_mock_stock",
    as_of: kstDateTime(),
    raw: output,
  };
}

async function fetchQuoteWithRetry(row: WatchRow, token: string) {
  try {
    return await fetchQuote(row, token);
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    await sleep(RATE_LIMIT_RETRY_MS);
    return fetchQuote(row, token);
  }
}

async function closeStaleRuns(supabase: ReturnType<typeof createClient>) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase.from("market_provider_runs").update({
    status: "failed",
    finished_at: new Date().toISOString(),
    message: "stale market refresh closed by next run",
  }).eq("provider", PROVIDER).eq("status", "running").lt("started_at", cutoff);
}

async function claimMinuteRun(
  supabase: ReturnType<typeof createClient>,
  run: Record<string, unknown>,
) {
  const { error } = await supabase.from("market_provider_runs").insert(run);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`market_run_claim_${error.message}`);
}

async function cleanupCompactData(supabase: ReturnType<typeof createClient>) {
  const minuteCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const runCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("market_minute_prices").delete().lt("minute_bucket", minuteCutoff);
  await supabase.from("market_provider_runs").delete().lt("started_at", runCutoff).in("provider", ["hantu", "naver"]);
  await supabase.from("market_snapshots").delete().lt("generated_at", runCutoff).like("source", "%market%");
}

async function saveQuote(supabase: ReturnType<typeof createClient>, quote: Quote, now: Date, bucket: string, tradingDate: string) {
  const writes = await Promise.all([
    supabase.from("market_quotes_latest").upsert({
      code: quote.code,
      payload: quote,
      price: quote.price,
      change: quote.change,
      change_rate: quote.change_rate,
      volume: quote.volume,
      source_market: quote.source_market,
      market_status: quote.market_status,
      traded_at: now.toISOString(),
      provider: PROVIDER,
    }, { onConflict: "code" }),
    supabase.from("market_minute_prices").upsert({
      code: quote.code,
      minute_bucket: bucket,
      trading_date: tradingDate,
      price: quote.price,
      change: quote.change,
      change_rate: quote.change_rate,
      open_price: quote.open_price,
      high_price: quote.high_price,
      low_price: quote.low_price,
      volume: quote.volume,
      trade_amount: quote.trade_amount,
      provider: PROVIDER,
      raw: quote.raw,
    }, { onConflict: "code,minute_bucket" }),
    supabase.from("market_daily_prices").upsert({
      code: quote.code,
      trading_date: tradingDate,
      open_price: quote.open_price,
      high_price: quote.high_price,
      low_price: quote.low_price,
      close_price: quote.price,
      change: quote.change,
      change_rate: quote.change_rate,
      volume: quote.volume,
      trade_amount: quote.trade_amount,
      provider: PROVIDER,
      raw: quote.raw,
    }, { onConflict: "code,trading_date" }),
  ]);
  const failure = writes.find((result) => result.error);
  if (failure?.error) throw new Error(`market_write_${failure.error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "unauthorized_market_refresh" }, 401);

  const missing = validateEnv();
  if (missing.length) return json({ error: "missing_env", missing }, 500);

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const full = body.full === true || force;
  const now = new Date();
  const startedAt = now.toISOString();
  const bucket = minuteBucket(now);
  const runKey = `hantu-${bucket}`;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    await closeStaleRuns(supabase);
    if (!force && !isMarketWindow(now)) {
      await supabase.from("market_provider_runs").upsert({
        run_key: runKey,
        provider: PROVIDER,
        status: "skipped",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        message: "outside_market_window",
      }, { onConflict: "run_key" });
      return json({ ok: true, status: "skipped", reason: "outside_market_window" });
    }

    const runStart = {
      run_key: runKey,
      provider: PROVIDER,
      status: "running",
      started_at: startedAt,
      finished_at: null,
      message: "hantu minute refresh started",
    };
    if (!force && !await claimMinuteRun(supabase, runStart)) {
      return json({ ok: true, status: "skipped", reason: "minute_already_handled", bucket });
    }
    if (force) {
      await supabase.from("market_provider_runs").upsert(runStart, { onConflict: "run_key" });
    }

    const { data: watchlist, error: watchError } = await supabase
      .from("market_watchlist")
      .select("code,name,group_name,kind,provider_symbol")
      .eq("enabled", true)
      .order("display_order", { ascending: true });
    if (watchError) throw new Error(`watchlist_${watchError.message}`);

    const allRows = (watchlist || []) as WatchRow[];
    const selectedRows = selectWatchlist(allRows, now, full);
    const token = await getAccessToken(supabase);
    const tradingDate = kstDate(now);
    const successes: Quote[] = [];
    const errors: string[] = [];

    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index];
      try {
        if (index > 0) await sleep(REQUEST_INTERVAL_MS);
        const quote = await fetchQuoteWithRetry(row, token);
        await saveQuote(supabase, quote, now, bucket, tradingDate);
        successes.push(quote);
      } catch (error) {
        errors.push(`${row.code}:${safeError(error)}`);
      }
    }

    if (Number(kstParts(now).minute || "0") === 0) {
      try {
        await cleanupCompactData(supabase);
      } catch {
        // Retention cleanup must not invalidate a successful market refresh.
      }
    }
    await supabase.from("market_provider_runs").update({
      status: errors.length ? "partial" : "success",
      finished_at: new Date().toISOString(),
      watchlist_count: allRows.length,
      success_count: successes.length,
      error_count: errors.length,
      message: errors[0] || "hantu minute refresh completed",
      metrics: {
        bucket,
        full_refresh: full,
        selected_count: selectedRows.length,
        peer_chunk_count: PEER_CHUNK_COUNT,
        request_interval_ms: REQUEST_INTERVAL_MS,
        provider_timeout_ms: PROVIDER_TIMEOUT_MS,
        trading_date: tradingDate,
        errors: errors.slice(0, 10),
      },
    }).eq("run_key", runKey);

    return json({
      ok: true,
      provider: PROVIDER,
      status: errors.length ? "partial" : "success",
      bucket,
      watchlist: allRows.length,
      selected: selectedRows.length,
      collected: successes.length,
      errors: errors.length,
    });
  } catch (error) {
    const message = safeError(error);
    try {
      await supabase.from("market_provider_runs").upsert({
        run_key: runKey,
        provider: PROVIDER,
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        message,
        error_count: 1,
        metrics: { error: message },
      }, { onConflict: "run_key" });
    } catch {
      // Return the provider error even when the diagnostic write also fails.
    }
    return json({ ok: false, error: "market_refresh_failed", detail: message }, 500);
  }
});
