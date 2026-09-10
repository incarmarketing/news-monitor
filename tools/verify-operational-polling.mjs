import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'frontend/dist');
const output = path.join(root, 'out/operational-polling');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const content = await readFile(file);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const iso = `${date}T09:00:00+09:00`;
const revisions = { news_articles: 'a1', notification_sends: 'n1', negative_watch_runs: 'w1', report_runs: 'r1', job_runs: 'j1' };
const data = {
  articles: [{ article_hash: 'positive', report_date: date, pub_date: `${date}T08:00:00+09:00`, source: '보험매일',
    title: '인카금융서비스 소비자보호 교육 강화', tone: '긍정', category: '당사', own_mentioned: true, link: 'https://example.com/positive' }],
  notifications: [], report_runs: [], job_runs: [],
  watch_runs: [{ run_key: 'watch', scanned_at: iso, status: 'success', scanned_count: 1, new_negative_count: 0 }],
};
const calls = { snapshot: 0, changes: 0, trigger_collection: 0, workflow_health: [], github: 0 };
const errors = [];
let fail = false;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.install({ time: new Date(iso) });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'api.github.com') { calls.github++; await route.fulfill({ json: {} }); return; }
    if (url.pathname.endsWith('supabase.json')) { await route.fulfill({ json: { url: 'https://db.example', anon_key: 'test-key' } }); return; }
    if (url.pathname.endsWith('/functions/v1/dashboard-api')) {
      const request = route.request().postDataJSON();
      const { action, payload } = request;
      if (action === 'changes') {
        calls.changes++;
        if (fail) { await route.fulfill({ status: 503, json: { error: 'changes_unavailable' } }); return; }
        const keys = { notification_sends: 'notifications', negative_watch_runs: 'watch_runs', report_runs: 'report_runs', job_runs: 'job_runs' };
        const delta = {};
        for (const [topic, key] of Object.entries(keys)) if (payload.revisions?.[topic] !== revisions[topic]) delta[key] = data[key];
        await route.fulfill({ json: { ok: true, revisions, data: delta, warnings: [] } }); return;
      }
      if (action === 'snapshot') { calls.snapshot++; await route.fulfill({ json: { ok: true, data, snapshot_at: iso, warnings: [] } }); return; }
      if (action === 'trigger_collection') { calls.trigger_collection++; revisions.news_articles = 'manual'; await route.fulfill({ json: { ok: true } }); return; }
      if (action === 'workflow_health') {
        calls.workflow_health.push(payload.workflow);
        await route.fulfill({ json: { ok: true, workflow: { id: payload.workflow, status: 'live', latest: { status: 'completed', conclusion: 'success', updatedAt: `${date}T10:00:00+09:00` } } } }); return;
      }
      await route.fulfill({ json: { ok: true, data: [] } }); return;
    }
    if (url.origin !== base || url.pathname.includes('/data/')) { await route.fulfill({ json: {} }); return; }
    await route.continue();
  });
  const advance = async (duration) => {
    // Let intercepted network promises settle between timer steps. Jumping a full
    // minute across active fetches would manufacture 12-second network timeouts.
    for (let left = duration; left > 0; left -= 1000) {
      await page.clock.runFor(Math.min(left, 1000));
      await page.waitForTimeout(25);
    }
  };
  const settle = async () => {
    await advance(1600);
    await page.waitForTimeout(150);
  };
  await page.goto(base, { waitUntil: 'networkidle' }); await settle();
  await page.getByText('인카금융서비스 소비자보호 교육 강화', { exact: true }).first().waitFor();
  const initialSnapshots = calls.snapshot;
  assert.equal(initialSnapshots, 1);
  for (let i = 0; i < 6; i++) { await advance(61000); await settle(); }
  assert.equal(calls.snapshot, initialSnapshots, 'unchanged state must not reload articles');
  assert.equal(calls.github, 0);
  data.notifications.push({ id: 1, sent_at: `${date}T08:12:00+09:00`, channel: 'slack', message_type: 'daily_report',
    title: `일일 언론 동향 ${date}`, body: `${date} report_slot=08`, status: 'success' });
  revisions.notification_sends = 'n2';
  await advance(61000); await settle();
  assert.match(await page.locator('.desk-slack').innerText(), /08:12/);
  assert.equal(calls.snapshot, initialSnapshots);
  const negative = { ...data.articles[0], article_hash: 'negative', title: '인카금융서비스 보험 모집질서 위반 제재', tone: '부정', negative_target: 'own', score: 95, link: 'https://example.com/negative' };
  data.articles.unshift(negative); revisions.news_articles = 'a2';
  await advance(61000); await settle();
  assert.equal(calls.snapshot, initialSnapshots + 1);
  await page.getByText(negative.title, { exact: true }).first().waitFor();
  await page.evaluate(() => { window.__hidden = true; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const beforeHidden = calls.changes;
  await advance(5 * 61000);
  assert.equal(calls.changes, beforeHidden);
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); }); await settle();
  assert.ok(calls.changes > beforeHidden);
  fail = true; await advance(61000); await settle();
  await page.getByText(negative.title, { exact: true }).first().waitFor();
  assert.match(await page.locator('.desk-watch').innerText(), /확인 불가/);
  fail = false; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await settle();
  assert.doesNotMatch(await page.locator('.desk-watch').innerText(), /확인 불가/);
  await page.locator('.editorial-dashboard-header').getByRole('button', { name: '새로고침', exact: true }).click();
  await page.waitForTimeout(100); await advance(65000); await settle();
  const refreshButton = page.locator('.editorial-header-actions button').first();
  for (let i = 0; i < 20 && !(await refreshButton.isEnabled()); i++) { await advance(10000); await settle(); }
  assert.equal(await refreshButton.isEnabled(), true, 'manual collection must finish, not remain busy');
  assert.equal(calls.trigger_collection, 1);
  assert.ok(calls.workflow_health.every(id => id === 'dashboard-refresh.yml'));
  assert.equal(calls.github, 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: false });
  data.articles = []; revisions.news_articles = 'removed';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await advance(61000); await settle();
  for (let i = 0; i < 5 && await page.getByText(negative.title, { exact: true }).count(); i++) await settle();
  assert.equal(await page.getByText(negative.title, { exact: true }).count(), 0, 'valid empty DB result must not revive cached articles');
  await page.setViewportSize({ width: 390, height: 844 }); await settle();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 2);
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: false });
  const result = { passed: true, calls, errors, scenarios: ['unchanged', 'delayed Slack', 'new article', 'hidden/resume', 'outage/recovery', 'manual collection', 'valid empty result', 'mobile'] };
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
