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
].map((row, index) => ({ ...row, article_hash: `scope-qa-${index}`, source: "보험저널", summary: row.title, report_date: today, pub_date: now, link: `https://example.com/scope/${index}` }));
const result = { rounds: [], errors: [], writes: [] };
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
let currentPage;
try {
  for (const [width, height] of [[1864, 900], [1381, 900], [1201, 768], [390, 844], [320, 740]]) {
    let warnings = [];
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-scope.invalid", anon_key: "fixture-not-a-key" } }));
    await context.route("https://qa-scope.invalid/**", route => {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const { action, payload = {} } = route.request().postDataJSON() || {};
      if (action === "snapshot") return route.fulfill({ headers, json: { ok: true, snapshot_at: now, data: { articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } } });
      if (action === "changes") return route.fulfill({ headers, json: { ok: true, revisions: { news_articles: "scope-r1" }, data: {}, warnings } });
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
    await state.filter({ hasText: "데이터 정상" }).waitFor();
    const headerBounds = async () => ({ state: await state.boundingBox(), time: await time.boundingBox(), button: await page.getByRole('button', { name: '새 기사 수집', exact: true }).boundingBox() });
    const header = await headerBounds();
    assert.ok(header.time.width > header.state.width);
    assert.equal(header.state.height, 44); assert.equal(header.time.height, 44); assert.equal(header.button.height, 44);
    assert.equal(header.state.y, header.time.y);
    assert.ok(header.time.x >= header.state.x + header.state.width + 7);
    if (width > 760) assert.ok(header.button.x >= header.time.x + header.time.width + 7 && header.button.y === header.time.y);
    assert.equal(await page.locator('.newsroom-data-status button').count(), 0, "read-only status displays became fake actions");
    warnings = ["notifications_unavailable"];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await state.filter({ hasText: "연결 확인 필요" }).waitFor();
    assert.deepEqual(await headerBounds(), header, "a longer status label moved header controls");
    assert.ok(await state.evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight));
    assert.ok(await time.evaluate(node => node.scrollWidth <= node.clientWidth));
    warnings = [];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await state.filter({ hasText: "데이터 정상" }).waitFor();

    const openOwn = async () => {
      await page.locator('[data-section="overview"]').click();
      await page.locator('.editorial-kpi-strip button.own').click();
      await page.locator('.app-shell[data-active-section="monitoring"]').waitFor();
      await page.locator('.monitor-scope-chip').filter({ hasText: '당사 직접 언급' }).waitFor();
      await page.locator('.monitor-results[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.monitor-article-row').count(), 1);
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
    await openOwn(); await checkChip();
    const before = await tableTop();
    await page.screenshot({ path: path.join(out, `${width}-own-filter.png`), animations: 'disabled' });
    await chip.locator('svg').click(); await cleared();
    assert.equal(await tableTop(), before, "clearing the filter moved the article table");
    assert.equal(await page.locator('.monitor-category-tabs > button').first().evaluate(node => node === document.activeElement), true, "clear action stranded keyboard focus");
    await openOwn(); await chip.focus(); await chip.press('Enter'); await cleared();

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
    result.rounds.push({ width, height, header, chipActions: ['own-icon', 'own-keyboard', 'empty-long-query'] });
    await context.close();
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.writes, []);
  console.log(JSON.stringify({ widths: result.rounds.map(row => row.width), errors: result.errors, writes: result.writes }));
} catch (error) {
  result.failure = error.message;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(out, 'failure.png') });
  throw error;
} finally { await browser.close(); await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(result, null, 2)); }
