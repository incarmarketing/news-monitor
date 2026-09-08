import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeOperationalStatusPayload } from '../frontend/src/liveData.js';

const baselinePath = new URL('../out/dashboard-public-api-baseline.json', import.meta.url);
const baselineMode = process.argv.includes('--baseline');
const config = await fetch('https://incarmarketing.github.io/news-monitor/data/supabase.json', { signal: AbortSignal.timeout(20000) }).then((r) => {
  assert.equal(r.status, 200);
  return r.json();
});
const headers = { apikey: config.anon_key, origin: 'https://incarmarketing.github.io', 'content-type': 'application/json' };
if (config.anon_key.split('.').length === 3) headers.Authorization = `Bearer ${config.anon_key}`;
async function call(action, payload = {}, override = {}) {
  const response = await fetch(`${config.url}/functions/v1/dashboard-api`, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.json() };
}

const result = await call('snapshot');
assert.equal(result.status, 200);
assert.equal(result.body.ok, true);
assert.deepEqual(result.body.warnings, []);
const data = result.body.data;
assert.ok(data.articles.length > 0, 'article feed must not be empty');
const normalized = normalizeOperationalStatusPayload(data);
const contract = {
  articles: data.articles.map((r) => ({ article_hash: r.article_hash, report_date: r.report_date, title: r.title, link: r.link, source: r.source, category: r.category, tone: r.tone })),
  notifications: normalized.notifications.map(({ id, sentAt, status, dedupeKey, link, messageType }) => ({ id, sentAt, status, dedupeKey, link, messageType })),
  watch: normalized.watchRuns.map(({ id, state, scanned, negative, fresh }) => ({ id, state, scanned, negative, fresh })),
  reports: normalized.reportRuns.map(({ id, date, slot, riskLevel, metrics }) => ({ id, date, slot, riskLevel, counts: Object.fromEntries(['total_collected', 'total_after_cluster', 'own_total', 'own_negative', 'by_category', 'by_tone', 'own_by_tone'].map((key) => [key, metrics[key] ?? null])) })),
  jobs: normalized.jobRuns.map(({ id, date, slot, status }) => ({ id, date, slot, status })),
};
if (baselineMode) {
  fs.mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(contract));
} else {
  for (const r of data.notifications) {
    assert.ok(!('error' in r));
    assert.match(r.body || '', /^(?:20\d{2}[-.]\d{2}[-.]\d{2})?(?:\s?report_slot=(?:08|13|18))?$/);
  }
  for (const r of data.job_runs) assert.ok(!('error' in r) && !('details' in r));
  for (const r of data.watch_runs) assert.ok(['', 'no_new_negative_articles'].includes(r.message));
  for (const r of data.report_runs) assert.ok(Object.keys(r.metrics).every((key) => ['total_collected', 'total_after_cluster', 'own_total', 'own_negative', 'by_category', 'by_tone', 'own_by_tone', 'risk_level'].includes(key)));
  const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  for (const key of Object.keys(contract)) {
    const idKey = key === 'articles' ? 'article_hash' : 'id';
    const oldRows = new Map(before[key].map((r) => [r[idKey], r]));
    const shared = contract[key].filter((r) => oldRows.has(r[idKey]));
    assert.ok(shared.length > 0 || before[key].length === 0, `${key}: no shared records`);
    for (const r of shared) assert.deepEqual(r, oldRows.get(r[idKey]), `${key}: existing contract changed`);
  }
  const forbidden = await call('rest', { path: 'news_articles', method: 'GET' });
  assert.equal(forbidden.status, 401);
}
const registry = await call('media_registry', { mode: 'summary' });
assert.equal(registry.status, 200);
assert.equal(registry.body.ok, true);
console.log(JSON.stringify({ mode: baselineMode ? 'baseline' : 'verified', counts: Object.fromEntries(Object.entries(contract).map(([k, v]) => [k, v.length])), media: registry.body.data.media?.length, warnings: result.body.warnings }));

if (process.argv.includes('--refresh')) {
  const responses = await Promise.all(Array.from({ length: 5 }, () => call('trigger_collection')));
  const accepted = responses.filter((r) => r.status === 200);
  const throttled = responses.filter((r) => r.status === 202 && r.body.throttled);
  assert.ok(accepted.length <= 1);
  assert.equal(accepted.length + throttled.length, 5);
  console.log(JSON.stringify({ refreshAccepted: accepted.length, refreshThrottled: throttled.length }));
}
