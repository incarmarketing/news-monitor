import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/monitor-scope");
const now = new Date().toISOString();
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const articles = [
  { title: "인카금융서비스, 보험설계사 교육센터 신규 개소", own_mentioned: true, category: "own", tone: "positive" },
  { title: "삼성화재, 자동차보험 보장 확대", category: "industry", tone: "neutral" },
  { title: "금융위원회, 보험소비자 보호 제도 개선", category: "policy", tone: "caution" },
  { title: "보험 수수료 제도 개편, 인카금융서비스 교육 강화", own_mentioned: true, category: "policy", tone: "caution" },
].map((row, index) => ({ ...row, article_hash: `scope-qa-${index}`, source: "보험저널", summary: row.title, report_date: today, pub_date: now, link: `https://example.com/scope/${index}` }));
const result = { rounds: [], errors: [], writes: [] };
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
let currentPage;
try {
  for (const [width, height] of [[1864, 900], [1381, 900], [1201, 768], [390, 844], [320, 740]]) {
    let warnings = [], changesFail = false, snapshotFails = false, snapshotDelay = 0;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      window.__headerSignals = [];
      let previous = '';
      new MutationObserver(() => {
        const state = document.querySelector('.newsroom-connection-status')?.dataset.state;
        if (state && state !== previous) { previous = state; window.__headerSignals.push(state); }
      }).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await context.route(/\/(?:operations|articles)\.json(?:\?.*)?$/, route => route.fulfill({ json: { generated_at: now, articles_generated_at: now, articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } }));
    await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-scope.invalid", anon_key: "fixture-not-a-key" } }));
    await context.route("https://qa-scope.invalid/**", async route => {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const { action, payload = {} } = route.request().postDataJSON() || {};
      if (action === "snapshot") {
        if (snapshotDelay) await new Promise(resolve => setTimeout(resolve, snapshotDelay));
        return route.fulfill({ headers, status: snapshotFails ? 503 : 200, json: snapshotFails ? { ok: false, error: 'fixture_snapshot_offline' } : { ok: true, snapshot_at: now, data: { articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } } });
      }
      if (action === "changes") return route.fulfill({ headers, status: changesFail ? 503 : 200, json: changesFail ? { ok: false, error: 'fixture_changes_offline' } : { ok: true, revisions: { news_articles: "scope-r1" }, data: {}, warnings } });
      if (action === "article_range") return route.fulfill({ headers, json: { ok: true, articles, next_offset: null } });
      if (action === "workflow_health") return route.fulfill({ headers, json: { ok: true, workflow: { id: payload.workflow, status: "live", latest: null } } });
      if (action === "rest" && payload.method === "GET") return route.fulfill({ headers, json: { ok: true, data: [] } });
      if (route.request().method() === "GET") return route.fulfill({ headers, json: [] });
      result.writes.push(action); return route.abort();
    });
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", error => result.errors.push(error.message));
    const url = new URL(base); url.searchParams.set("section", "overview");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.locator('.desk-priority[aria-busy="false"]').waitFor({ timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    const state = page.locator('.newsroom-data-status > span'), time = page.locator('.newsroom-data-status time');
    await page.locator('.newsroom-connection-status[data-state="ok"]').waitFor();
    assert.equal((await state.innerText()).trim(), '', 'status wording must be tooltip-only');
    assert.equal(await state.locator('svg').count(), 2, 'status must use a server icon and an explicit state symbol');
    assert.equal(await state.locator('i').count(), 0, 'status still uses a dot');
    const blue = await state.evaluate(node => getComputedStyle(node).color);
    const blueBackground = await state.evaluate(node => getComputedStyle(node).backgroundColor);
    const blueRgb = blue.match(/\d+/g).map(Number);
    assert.ok(blueRgb[2] > blueRgb[0], 'healthy indicator must be blue, not red');
    const headerBounds = async () => ({ state: await state.boundingBox(), time: await time.boundingBox(), button: await page.getByRole('button', { name: '새 기사 수집', exact: true }).boundingBox() });
    const header = await headerBounds();
    assert.ok(header.time.width > header.state.width);
    assert.equal(header.state.height, 44); assert.equal(header.time.height, 44); assert.equal(header.button.height, 44);
    assert.equal(header.state.y, header.time.y);
    assert.ok(header.state.x >= header.time.x + header.time.width + 7, 'clock is not the leftmost status control');
    if (width > 760) assert.ok(header.button.x >= header.state.x + header.state.width + 7 && header.button.y === header.time.y);
    assert.equal(await page.locator('.newsroom-data-status button').count(), 0, "read-only status displays became fake actions");
    assert.match(await time.locator('.newsroom-clock-date').innerText(), /^\d{2}\.\d{2}$/);
    assert.match(await time.locator('.newsroom-clock-digits').innerText(), /^\d{2}:\d{2}$/);
    const clockDate = await time.locator('.newsroom-clock-date').boundingBox(), clockDigits = await time.locator('.newsroom-clock-digits').boundingBox();
    assert.ok(Math.abs(clockDate.y + clockDate.height / 2 - clockDigits.y - clockDigits.height / 2) <= 1, 'digital date and time wrapped onto different lines');
    assert.ok(await time.evaluate(node => getComputedStyle(node).backgroundColor.match(/\d+/g).map(Number).slice(0, 3).every(value => value < 50)), 'clock face must be dark');
    assert.equal(await time.locator('.newsroom-clock-digit').count(), 4);
    assert.equal(await time.locator('[data-segment]').count(), 28);
    assert.equal(await time.locator('.newsroom-clock-colon').count(), 1);
    const digit = await time.locator('.newsroom-clock-digit').first().boundingBox();
    assert.equal(digit.width, 16); assert.equal(digit.height, 28);
    warnings = ["notifications_unavailable"];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.newsroom-connection-status[data-state="error"]').waitFor();
    assert.equal((await state.innerText()).trim(), '');
    const red = await state.evaluate(node => getComputedStyle(node).color);
    assert.notEqual(await state.evaluate(node => getComputedStyle(node).backgroundColor), blueBackground, 'state must change the server tile background as well as icon color');
    const redRgb = red.match(/\d+/g).map(Number);
    assert.ok(redRgb[0] > redRgb[2] && red !== blue, 'attention indicator must turn red');
    assert.deepEqual(await headerBounds(), header, "a longer status label moved header controls");
    assert.ok(await state.evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight));
    assert.ok(await time.evaluate(node => node.scrollWidth <= node.clientWidth));
    warnings = [];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.newsroom-connection-status[data-state="ok"]').waitFor();

    await page.waitForFunction(() => Boolean(localStorage.getItem('incar_core_snapshot_v3')));
    changesFail = true; snapshotDelay = 1100;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.newsroom-connection-status[data-state="pending"]').waitFor();
    await page.locator('.newsroom-connection-status[data-state="ok"]').waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__headerSignals.includes('error')), false, 'a warm reload flashed a false red signal before the healthy snapshot');

    snapshotFails = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.newsroom-connection-status[data-state="pending"]').waitFor();
    await page.locator('.newsroom-connection-status[data-state="error"]').waitFor({ timeout: 60000 });
    await page.screenshot({ path: path.join(out, `${width}-connection-failed.png`), animations: 'disabled' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    changesFail = false; snapshotFails = false; snapshotDelay = 0;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.newsroom-connection-status[data-state="ok"]').waitFor({ timeout: 60000 });
    assert.deepEqual(await headerBounds(), header, 'recovered snapshot changed the status control geometry');

    const openOwn = async () => {
      await page.locator('[data-section="overview"]').click();
      await page.locator('.editorial-kpi-strip button.own').click();
      await page.locator('.app-shell[data-active-section="monitoring"]').waitFor();
      await page.locator('.monitor-results[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.monitor-scope-chip').count(), 0, 'own entry still shows a redundant scope label');
      assert.equal(await page.locator('.monitor-article-row').count(), 2, 'own mentions in another stored category were lost');
      assert.deepEqual((await page.locator('.monitor-headline').allTextContents()).sort(), [articles[0].title, articles[3].title].sort());
    };
    const tableTop = () => page.locator('.monitor-table').evaluate(node => node.getBoundingClientRect().y + window.scrollY);
    const chip = page.locator('.monitor-scope-chip');
    const checkChip = async () => {
      const text = await chip.locator('span').boundingBox(), icon = await chip.locator('svg').boundingBox(), box = await chip.boundingBox();
      assert.ok(icon.x - (text.x + text.width) >= 5 && icon.x - (text.x + text.width) <= 7, "clear icon is detached from its label");
      assert.ok(Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2) < 1, "clear icon is not centered with its label");
      assert.ok(icon.x + icon.width <= box.x + box.width + 1 && box.width <= width - 32, JSON.stringify({ width, text, icon, box }));
      assert.equal(box.height, 28);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    const cleared = async () => {
      await chip.waitFor({ state: 'detached' });
      await page.locator('.monitor-results[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.monitor-article-row').count(), articles.length);
      assert.equal(await page.locator('.monitor-category-tabs > button').first().getAttribute('aria-selected'), 'true');
      await page.evaluate(() => new Promise(requestAnimationFrame));
    };
    await openOwn();
    const before = await tableTop();
    await page.screenshot({ path: path.join(out, `${width}-own-filter.png`), animations: 'disabled' });
    await page.locator('.monitor-category-tabs > button').first().click(); await cleared();
    assert.equal(await tableTop(), before, "changing the own scope moved the article table");
    await openOwn();
    await page.getByRole('button', { name: '검색 초기화', exact: true }).click(); await cleared();
    await openOwn();
    await page.getByRole('tab', { name: /^정책 / }).click();
    await page.locator('.monitor-results[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('.monitor-article-row').count(), 2, 'switching categories retained a hidden own-only constraint');
    await page.locator('.monitor-category-tabs > button').first().click(); await cleared();

    const longQuery = '장기보험 소비자보호 '.repeat(18).trim();
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill(longQuery);
    await page.getByRole('button', { name: '조회/검색', exact: true }).click();
    await chip.waitFor();
    await page.locator('.monitor-results[aria-busy="false"]').waitFor();
    assert.equal(await page.locator('.monitor-article-row').count(), 0);
    await checkChip();
    await page.screenshot({ path: path.join(out, `${width}-long-query.png`), animations: 'disabled' });
    await chip.click(); await cleared();
    assert.equal(await page.getByRole('textbox', { name: '검색어', exact: true }).inputValue(), '');
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('교육센터');
    await page.getByRole('button', { name: '조회/검색', exact: true }).click();
    await chip.waitFor();
    await chip.focus(); await chip.press('Enter'); await cleared();
    assert.equal(await page.locator('.monitor-category-tabs > button').first().evaluate(node => node === document.activeElement), true, 'clear action stranded keyboard focus');
    result.rounds.push({ width, height, header, scopeActions: ['own-no-chip', 'own-all', 'own-reset', 'own-category', 'empty-long-query', 'query-keyboard'] });
    await context.close();
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.writes, []);
  console.log(JSON.stringify({ widths: result.rounds.map(row => row.width), errors: result.errors, writes: result.writes }));
} catch (error) {
  result.failure = error.message;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(out, 'failure.png') });
  throw error;
} finally { await browser.close(); await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(result, null, 2)); }
