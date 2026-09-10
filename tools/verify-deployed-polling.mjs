import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = new URL('../out/deployed-polling/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'api.github.com') requests.push({ type: 'github' });
    if (url.pathname.endsWith('/functions/v1/dashboard-api')) {
      try { requests.push({ type: request.postDataJSON().action }); } catch { /* Not a JSON API request. */ }
    }
  });
  await page.goto('https://incarmarketing.github.io/news-monitor/dashboard.html', { waitUntil: 'networkidle' });
  await page.locator('.dashboard-workspace').waitFor();
  await page.waitForFunction(() => document.querySelector('.editorial-data-status')?.textContent.includes('데이터 정상'), undefined, { timeout: 30000 });
  // Real elapsed time: prove the deployed timer uses the lightweight API, not mocks.
  await page.waitForTimeout(65000);
  assert.equal(requests.filter(row => row.type === 'github').length, 0);
  assert.ok(requests.filter(row => row.type === 'changes').length >= 2);
  assert.equal(requests.some(row => row.type === 'trigger_collection'), false);
  assert.equal(requests.some(row => row.type === 'workflow_health'), false);
  assert.deepEqual(errors, []);
  const result = { passed: true, requests, errors,
    header: await page.locator('.editorial-data-status').innerText(),
    operations: await page.locator('.signal-operations-panel').innerText() };
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', out)), fullPage: false });
  await writeFile(new URL('summary.json', out), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
