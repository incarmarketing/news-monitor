const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/dashboard-api/index.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const origin = 'https://incarmarketing.github.io';
const fixture = {
  articles: [{ article_hash: 'a1', title: 'Insurance news', category: 'industry', tone: 'neutral', summary: 'Public summary' }],
  notifications: [{ id: 1, title: 'daily_report', sent_at: '2026-09-09T01:12:00Z', message_type: 'daily_report', dedupe_key: 'daily:2026-09-09:08', link_url: 'https://example.com/report', status: 'success', body: '2026-09-09 report_slot=08 PRIVATE_MESSAGE', error: 'PRIVATE_ERROR' }],
  watch_runs: [{ run_key: 'watch', status: 'failed', scanned_at: '2026-09-09T00:20:00Z', scanned_count: 12, new_negative_count: 0, message: 'no_new_negative_articles PRIVATE_PROVIDER' }],
  report_runs: [{ run_key: 'daily:2026-09-09:08', report_date: '2026-09-09', report_slot: '08', timestamp: '2026-09-09T00:12:00Z', risk_level: 'LOW', metrics: { total_collected: 12, total_after_cluster: 10, own_total: 2, own_negative: 0, by_category: { own: 2, industry: 10 }, by_tone: { neutral: 10, caution: 2 }, own_by_tone: { positive: 2 }, risk_level: 'LOW', private_summary: 'PRIVATE_SUMMARY' } }],
  job_runs: [{ run_key: 'daily_report:2026-09-09:08', status: 'success', job_type: 'daily_report', report_slot: '08', report_date: '2026-09-09', error: 'PRIVATE_JOB_ERROR', details: { secret: 'PRIVATE_DETAILS' } }],
};

function runtime(options = {}) {
  const calls = [];
  let handler;
  let claimed = false;
  const env = { PUBLIC_SUPABASE_ANON_KEY: 'public-test-key', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key', GITHUB_DISPATCH_TOKEN: 'dispatch-test-key' };
  const context = vm.createContext({
    console, Response, Request, URL, AbortController, DOMException, setTimeout, clearTimeout,
    Deno: { env: { get: (key) => env[key] }, serve: (value) => { handler = value; } },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.includes('/rpc/verify_dashboard_session')) return reply({ ok: true, role: options.role || 'viewer', employee_no: 'test-user' });
      if (url.includes('/rpc/get_media_registry')) return reply(options.registryError ? { message: 'PRIVATE_SQL_ERROR' } : { media: [{ name: 'Publisher', article_count: 1 }] }, options.registryError ? 400 : 200);
      if (url.includes('/rpc/claim_dashboard_refresh')) {
        if (options.claimError) return reply({ message: 'PRIVATE_DB_ERROR' }, 500);
        if (options.claimMalformed) return reply({});
        const acquired = !claimed;
        claimed = true;
        return reply({ claimed: acquired, retry_after_seconds: acquired ? 0 : 120 });
      }
      if (url.includes('api.github.com')) return options.githubError ? reply({ message: 'PRIVATE_GITHUB_ERROR' }, 403) : new Response(null, { status: 204 });
      if (init.method === 'POST') return reply([]);
      const table = url.split('/rest/v1/')[1]?.split('?')[0];
      const key = { news_articles: 'articles', notification_sends: 'notifications', negative_watch_runs: 'watch_runs' }[table] || table;
      if (options.failedTable === table) return reply({ message: 'PRIVATE_QUERY_ERROR' }, 503);
      return reply(fixture[key] || []);
    },
  });
  vm.runInContext(compiled, context);
  return {
    context, calls,
    async request(action, payload = {}, extraHeaders = {}) {
      const result = await handler(new Request('https://db.example/functions/v1/dashboard-api', { method: 'POST', headers: { apikey: 'public-test-key', origin, 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify({ action, payload }) }));
      return { status: result.status, headers: result.headers, body: await result.json() };
    },
  };
}

test('anonymous snapshot keeps articles, counts, report slots and ledger states without internal text', async () => {
  const r = runtime();
  const { status, headers, body } = await r.request('snapshot');
  assert.equal(status, 200);
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.deepEqual(body.data.articles, fixture.articles);
  assert.equal(body.data.notifications[0].body, '2026-09-09 report_slot=08');
  assert.equal(body.data.notifications[0].dedupe_key, fixture.notifications[0].dedupe_key);
  assert.equal(body.data.watch_runs[0].message, 'no_new_negative_articles');
  assert.equal(body.data.watch_runs[0].status, 'failed');
  assert.deepEqual(body.data.report_runs[0].metrics.by_category, fixture.report_runs[0].metrics.by_category);
  assert.equal(body.data.job_runs[0].status, 'success');
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_/);
});

test('authenticated snapshot retains authorized operational details', async () => {
  const { body } = await runtime().request('snapshot', {}, { 'x-dashboard-session': 'test-session' });
  assert.deepEqual(body.data, fixture);
});

test('read-only media registry stays public, but database errors are not exposed', async () => {
  assert.equal((await runtime().request('media_registry')).body.data.media[0].name, 'Publisher');
  const result = await runtime({ registryError: true }).request('media_registry');
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_/);
});

test('anonymous REST writes and report/Slack dispatch stay forbidden', async () => {
  for (const [action, payload] of [ ['rest', { path: 'news_articles', method: 'DELETE' }], ['trigger_collection', { workflow: 'news-briefing.yml' }], ['trigger_collection', { send_slack: true }], ['trigger_collection', { force_slack_send: true }], ['trigger_collection', { period_reports: 'both' }] ]) {
    const r = runtime();
    assert.equal((await r.request(action, payload)).status, 401);
    assert.equal(r.calls.length, 0);
  }
});

test('ten simultaneous anonymous refreshes reserve one GitHub dispatch', async () => {
  const r = runtime();
  const results = await Promise.all(Array.from({ length: 10 }, () => r.request('trigger_collection')));
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(results.filter((result) => result.status === 202 && result.body.throttled).length, 9);
  assert.equal(r.calls.filter((call) => call.url.includes('api.github.com')).length, 1);
  assert.equal(r.calls.filter((call) => call.url.includes('/rpc/claim_dashboard_refresh')).length, 10);
});

test('anonymous and signed-in refresh share the same reservation', async () => {
  const r = runtime({ role: 'admin' });
  assert.equal((await r.request('trigger_collection')).status, 200);
  assert.equal((await r.request('trigger_collection', {}, { 'x-dashboard-session': 'test' })).status, 202);
});

test('unavailable or malformed reservation fails closed without blocking reads', async () => {
  for (const option of ['claimError', 'claimMalformed']) {
    const r = runtime({ [option]: true });
    const result = await r.request('trigger_collection');
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'refresh_reservation_unavailable');
    assert.equal(r.calls.filter((call) => call.url.includes('api.github.com')).length, 0);
    assert.equal((await r.request('snapshot')).status, 200);
  }
});

test('public dispatch failures keep provider details private', async () => {
  const result = await runtime({ githubError: true }).request('trigger_collection');
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_/);
});

test('article outage remains an error, optional ledger outage leaves articles available', async () => {
  assert.equal((await runtime({ failedTable: 'news_articles' }).request('snapshot')).status, 502);
  const result = await runtime({ failedTable: 'job_runs' }).request('snapshot');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data.articles, fixture.articles);
  assert.deepEqual(result.body.data.job_runs, []);
  assert.deepEqual(result.body.warnings, ['job_runs_503']);
});

test('watch success, failures and empty-scan state survive redaction', async () => {
  const { watchRunDisplayState } = await import('../frontend/src/watchHealth.js');
  const r = runtime();
  for (const status of ['failed', 'success', 'pending', 'empty', 'no_change', 'unknown']) {
    for (const message of ['PRIVATE_PROVIDER', 'no_new_negative_articles: PRIVATE_PROVIDER', '신규 부정 기사가 없습니다. PRIVATE_PROVIDER', '']) {
      r.context.sample = message;
      const cleaned = vm.runInContext('publicWatchMessage(sample)', r.context);
      assert.equal(watchRunDisplayState(status, cleaned), watchRunDisplayState(status, message));
    }
  }
});

test('frontend normalization keeps public article and historical chart inputs', async () => {
  const { normalizeOperationalStatusPayload } = await import('../frontend/src/liveData.js');
  const result = await runtime().request('snapshot');
  const before = normalizeOperationalStatusPayload({ generated_at: '2026-09-09', ...fixture });
  const after = normalizeOperationalStatusPayload({ generated_at: '2026-09-09', ...result.body.data });
  assert.equal(after.notifications[0].sentAt, before.notifications[0].sentAt);
  assert.equal(after.notifications[0].status, before.notifications[0].status);
  assert.equal(after.watchRuns[0].state, before.watchRuns[0].state);
  assert.equal(after.reportRuns[0].slot, before.reportRuns[0].slot);
  assert.deepEqual(after.reportRuns[0].metrics.by_category, before.reportRuns[0].metrics.by_category);
});
