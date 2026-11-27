import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/route-loading");
const now = new Date().toISOString();
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const articles = [{ article_hash: "route-qa-1", title: "인카금융서비스 보험설계사 교육 강화", own_mentioned: true, category: "own", tone: "positive", source: "보험저널", summary: "인카금융서비스 보험설계사 교육 강화", report_date: today, pub_date: now, link: "https://example.com/article/1" }];
const modules = { media: "MediaAnalysis", reports: "Reports", management: "Management", stocks: "StockMarketDashboard" };
const result = { rounds: [], errors: [], writes: [] };
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
let currentPage;
try {
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    for (const section of Object.keys(modules)) {
      if (width <= 1240 && section === "reports") continue;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const chunk = new RegExp(`/(?:src/${modules[section]}\\.jsx|assets/${modules[section]}-[^/?]+\\.js)(?:\\?|$)`);
      await context.route(chunk, async route => { await gate; await route.continue(); });
      await context.route(/\/(?:operations|articles)\.json(?:\?.*)?$/, route => route.fulfill({ json: { generated_at: now, articles_generated_at: now, articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } }));
      await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-route.invalid", anon_key: "fixture-not-a-key" } }));
      await context.route("https://qa-route.invalid/**", route => {
        const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
        const { action, payload = {} } = route.request().postDataJSON() || {};
        if (action === "snapshot") return route.fulfill({ headers, json: { ok: true, snapshot_at: now, data: { articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } } });
        if (action === "changes") return route.fulfill({ headers, json: { ok: true, revisions: { news_articles: "route-r1" }, data: {}, warnings: [] } });
        if (action === "article_range") return route.fulfill({ headers, json: { ok: true, articles, next_offset: null } });
        if (action === "workflow_health") return route.fulfill({ headers, json: { ok: true, workflow: { id: payload.workflow, status: "live", latest: null } } });
        if (action === "media_registry") return route.fulfill({ headers, json: { ok: true, data: { media: [], unknown: [], reporters: [], own_articles: 0, as_of: now } } });
        if (action === "rest" && payload.method === "GET") return route.fulfill({ headers, json: { ok: true, data: [] } });
        if (route.request().method() === "GET") return route.fulfill({ headers, json: [] });
        result.writes.push(action); return route.abort();
      });
      const page = await context.newPage();
      currentPage = page;
      page.setDefaultTimeout(30000);
      page.on("pageerror", error => result.errors.push(error.message));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator('.desk-priority[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const masthead = await page.locator('.newsroom-masthead').boundingBox();
      const headerControls = await page.locator('.newsroom-global-actions').locator('time').boundingBox();
      await page.locator(`[data-section="${section}"]`).click();
      const skeleton = page.locator(`.workspace-loading[data-loading-section="${section}"]`);
      await skeleton.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const before = await skeleton.locator('h1').boundingBox();
      const body = await skeleton.boundingBox();
      assert.ok(body.y >= masthead.y + masthead.height - 1, 'route skeleton is detached from the content region');
      assert.equal(await page.locator('main.workspace:visible').count(), 1, 'multiple route bodies are visible');
      assert.doesNotMatch(await skeleton.innerText(), /화면 불러오는 중/);
      assert.equal(await skeleton.getByRole('button').count(), 0, 'loading shell exposes fake commands');
      assert.deepEqual(await page.locator('.newsroom-global-actions time').boundingBox(), headerControls, 'route loading moved the global clock');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'skeleton exceeds viewport width');
      if (width > 1200 && ['media', 'reports'].includes(section)) assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'skeleton introduces page scrolling');
      await page.screenshot({ path: path.join(out, `${width}-${section}-loading.png`), animations: 'disabled' });
      await page.locator('[data-section="monitoring"]').click();
      await page.locator('.app-shell[data-active-section="monitoring"]').waitFor();
      assert.equal(await page.locator('.workspace-loading').count(), 0, 'an abandoned loading shell remains over another route');
      assert.equal(await page.locator('main.workspace:visible').count(), 1);
      await page.locator(`[data-section="${section}"]`).click();
      await skeleton.waitFor();
      assert.deepEqual(await skeleton.locator('h1').boundingBox(), before, 'interrupting and returning to a pending route moved its skeleton');
      release();
      await skeleton.waitFor({ state: 'detached' });
      const main = page.locator('main.workspace:visible');
      await main.locator('h1').waitFor();
      if (section === "media") await main.locator('.media-intel-board[aria-busy="false"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const after = await main.locator('h1').boundingBox();
      assert.ok(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1, `loading title moves on resolution: ${JSON.stringify({ width, section, before, after })}`);
      assert.deepEqual(await page.locator('.newsroom-global-actions time').boundingBox(), headerControls);
      await page.screenshot({ path: path.join(out, `${width}-${section}-ready.png`), animations: 'disabled' });
      await page.evaluate(() => {
        window.__loadingFlashes = 0;
        new MutationObserver(() => { if (document.querySelector('.workspace-loading')) window.__loadingFlashes++; }).observe(document, { subtree: true, childList: true });
      });
      await page.locator('[data-section="overview"]').click();
      await page.locator(`[data-section="${section}"]`).click();
      await main.locator('h1').waitFor();
      assert.equal(await page.evaluate(() => window.__loadingFlashes), 0, 'returning to a loaded route unnecessarily replaced content with a skeleton');
      result.rounds.push({ width, height, section, before, after });
      await context.close();
    }
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.writes, []);
  console.log(JSON.stringify({ cases: result.rounds.map(({ width, section }) => ({ width, section })), errors: result.errors, writes: result.writes }));
} catch (error) {
  result.failure = error.message;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(out, 'failure.png') });
  throw error;
} finally { await browser.close(); await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(result, null, 2)); }
