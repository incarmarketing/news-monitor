import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/resume-layout");
const observeOnly = process.env.RESUME_QA_OBSERVE_ONLY === "1";
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const now = Date.parse(`${today}T09:00:00+09:00`);
const articles = Array.from({ length: 52 }, (_, index) => ({
  article_hash: `resume-${index}`, title: `GA 1200%룰 보험 판매수수료 제도 개편 ${index}`,
  source: ["보험저널", "보험매일", "뉴스1"][index % 3], category: "policy", tone: "caution",
  pub_date: new Date(now - index * 60000).toISOString(), report_date: today,
  link: `https://example.com/resume/${index}`, summary: "보험대리점 수수료 개편에 따른 보험설계사의 영업 관리 변화를 확인한다.",
}));
articles.push(...["교육센터 개소", "마이데이터 업무협약 체결", "사회공헌 후원금 전달", "설계사 전문교육 시행", "보험 비교 서비스 출시"].map((title, index) => ({
  ...articles[index], article_hash: `resume-own-${index}`, title: `인카금융서비스 ${title}`,
  category: "own", own_mentioned: true, tone: "positive", summary: `인카금융서비스 ${title}`, link: `https://example.com/resume/own-${index}`,
})));
await fs.mkdir(out, { recursive: true });
const result = { rounds: [], errors: [], blockedWrites: [], counts: { changes: 0, snapshot: 0, range: 0 } };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
let currentPage;
try {
  for (const [width, height] of [[1440, 900], [1366, 768], [390, 844]]) {
    let revision = 1, rangeFails = false;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.addInitScript(({ now }) => {
      let visible = true, offset = 0;
      const NativeDate = Date, started = performance.now();
      const currentTime = () => now + offset + performance.now() - started;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [currentTime()])); }
        static now() { return currentTime(); }
      };
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
      window.__leaveFor = milliseconds => { visible = false; offset += milliseconds; document.dispatchEvent(new Event("visibilitychange")); };
      window.__returnToView = () => { visible = true; document.dispatchEvent(new Event("visibilitychange")); };
      window.__resumeFlashes = 0;
      new MutationObserver(() => {
        if (window.__watchResume && document.querySelector('.media-page:not([hidden]) .media-skeleton')) window.__resumeFlashes++;
      }).observe(document, { subtree: true, childList: true });
    }, { now });
    await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-resume.invalid", anon_key: "fixture-not-a-key" } }));
    await context.route("https://qa-resume.invalid/**", async route => {
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const { action, payload = {} } = route.request().postDataJSON() || {};
      const stamp = new Date(now + revision * 1000).toISOString();
      const rows = revision === 1 ? articles : [{ ...articles[0], article_hash: `resume-new-${revision}`, title: `인카금융서비스 신규 제재 확인 ${revision}`, summary: "인카금융서비스에 대한 보험 모집질서 위반 업무정지 제재를 확인했다.", category: "own", own_mentioned: true, tone: "negative", negative_target: "own", link: `https://example.com/resume/new-${revision}` }, ...articles];
      if (action === "changes") { result.counts.changes++; return route.fulfill({ headers, json: { ok: true, revisions: { news_articles: `r${revision}` }, data: {} } }); }
      if (action === "snapshot") { result.counts.snapshot++; return route.fulfill({ headers, json: { ok: true, snapshot_at: stamp, data: { articles_generated_at: stamp, articles: rows, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } } }); }
      if (action === "article_range") {
        result.counts.range++;
        await new Promise(resolve => setTimeout(resolve, revision > 1 ? 1400 : 80));
        return route.fulfill({ headers, status: rangeFails ? 503 : 200, json: rangeFails ? { ok: false, error: "fixture_range_unavailable" } : { ok: true, articles: rows, next_offset: null } });
      }
      if (action === "workflow_health") return route.fulfill({ headers, json: { ok: true, workflow: { id: payload.workflow, status: "live", latest: null } } });
      if (action === "rest" && payload.method === "GET") return route.fulfill({ headers, json: { ok: true, data: [] } });
      if (route.request().method() === "GET") return route.fulfill({ headers, json: [] });
      result.blockedWrites.push(action); return route.abort();
    });
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", error => result.errors.push(error.message));
    const url = new URL(base); url.searchParams.set("section", "media");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    const ready = async () => {
      await page.locator('.app-shell[data-active-section="media"]').waitFor();
      await page.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
    };
    await ready();
    await page.getByRole("button", { name: "90일", exact: true }).click(); await ready();
    await page.getByRole("tab", { name: "언론사별 보도량" }).click();
    await page.locator(".media-issue-content").evaluate(node => { node.scrollTop = 100; });
    const state = () => page.evaluate(() => ({
      range: [...document.querySelectorAll('.media-range-panel input')].map(node => node.value),
      publishers: document.querySelector('#media-publishers-tab')?.getAttribute('aria-selected'),
      scroll: document.querySelector('.media-issue-content')?.scrollTop,
      windowScroll: window.scrollY,
      geometry: [...document.querySelectorAll('.media-main-trend,.media-keywords,.media-issues,.media-intel-board .dashboard-svg-chart')].map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y + window.scrollY, r.width, r.height, node.getAttribute('viewBox')]; }),
      flashes: window.__resumeFlashes,
    }));
    const before = await state(), initialCalls = { ...result.counts };
    if (width > 1200) assert.ok(before.scroll > 0, "fixture did not exercise an actual list scroll position");
    await page.evaluate(() => { window.__watchResume = true; window.__leaveFor(20 * 60000); });
    await page.waitForTimeout(100);
    assert.deepEqual(result.counts, initialCalls, "hidden tab started a data read");
    await page.evaluate(() => window.__returnToView());
    await page.waitForFunction(() => document.visibilityState === "visible");
    await page.waitForTimeout(250);
    const unchanged = await state();
    assert.deepEqual(unchanged, before, "unchanged tab return moved the view");
    assert.equal(result.counts.range, initialCalls.range);
    assert.equal(result.counts.snapshot, initialCalls.snapshot);

    revision = 2;
    await page.evaluate(() => { window.__leaveFor(10 * 60000); window.__returnToView(); });
    await page.waitForFunction(() => [...document.querySelectorAll('.media-issue-entry h3')].some(node => node.textContent.includes('신규 제재 확인 2')), null, { timeout: 30000 });
    await ready();
    const refreshed = await state();
    await page.screenshot({ path: path.join(out, `${width}-refreshed.png`), animations: "disabled" });
    if (!observeOnly) {
      assert.equal(refreshed.flashes, 0, "background update replaced the view with a skeleton");
      assert.deepEqual(refreshed.geometry, before.geometry, "background update moved panels or chart dimensions");
      assert.deepEqual(refreshed.range, before.range);
      assert.equal(refreshed.publishers, "true");
      assert.equal(refreshed.scroll, before.scroll);
      assert.equal(refreshed.windowScroll, before.windowScroll);
    }

    await page.locator('[data-section="overview"]').click();
    await page.locator('.app-shell[data-active-section="overview"]').waitFor();
    const rangeBeforeLeaving = result.counts.range;
    revision = 3;
    await page.evaluate(() => { window.__leaveFor(20 * 60000); window.__returnToView(); });
    await page.waitForTimeout(350);
    assert.equal(result.counts.range, rangeBeforeLeaving, "inactive media view loaded article history");
    await page.locator('[data-section="media"]').click();
    await ready();
    await page.waitForFunction(() => [...document.querySelectorAll('.media-issue-entry h3')].some(node => node.textContent.includes('신규 제재 확인 3')), null, { timeout: 30000 });
    const returned = await state();
    await page.screenshot({ path: path.join(out, `${width}-returned.png`), animations: "disabled" });
    if (!observeOnly) {
      assert.deepEqual(returned.range, before.range, "menu return reset the selected period");
      assert.equal(returned.publishers, "true", "menu return reset the selected analysis tab");
      assert.equal(returned.scroll, before.scroll, "menu return reset the reading position");
      assert.equal(returned.flashes, 0, "menu return flashed a loading view");
      assert.deepEqual(returned.geometry, before.geometry, "menu return changed chart dimensions");
    }

    if (!observeOnly) {
      const lastCount = await page.locator('.media-trend-heading > span').innerText();
      rangeFails = true; revision = 4;
      await page.evaluate(() => { window.__leaveFor(10 * 60000); window.__returnToView(); });
      await page.getByRole('status', { name: "언론동향 갱신 상태" }).filter({ hasText: "이전 집계" }).waitFor({ timeout: 90000 });
      assert.equal(await page.locator('.media-trend-heading > span').innerText(), lastCount, "failed revalidation erased the previous count");
      assert.equal(await page.locator('.media-issue-entry h3').filter({ hasText: "인카금융서비스 신규 제재 확인 3" }).count(), 1);
      assert.deepEqual((await state()).geometry, before.geometry);
      assert.equal((await state()).flashes, 0);
      await page.screenshot({ path: path.join(out, `${width}-refresh-failed.png`), animations: "disabled" });
      rangeFails = false;
      await page.getByRole('button', { name: '다시 조회', exact: true }).click();
      await ready();
      assert.equal(await page.locator('.media-issue-entry h3').filter({ hasText: '신규 제재 확인 4' }).count(), 1, 'retry did not publish the latest result');

      await page.evaluate(() => { window.__watchResume = false; window.__leaveFor(24 * 60 * 60000); window.__returnToView(); });
      const tomorrow = new Date(now + 24 * 60 * 60000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      await page.waitForFunction(end => document.querySelectorAll('.media-range-panel input')[1]?.value === end, tomorrow);
      await ready();
      assert.equal((await state()).range[1], tomorrow, 'a retained rolling period did not advance across midnight');
      const custom = { start: today, end: tomorrow };
      await page.getByLabel('시작 기준일', { exact: true }).fill(custom.start);
      await page.getByLabel('종료 기준일', { exact: true }).fill(custom.end);
      await page.getByRole('button', { name: '적용', exact: true }).click(); await ready();
      await page.evaluate(() => { window.__leaveFor(24 * 60 * 60000); window.__returnToView(); });
      await ready();
      assert.deepEqual((await state()).range, [custom.start, custom.end], 'a custom date range was overwritten at midnight');
    }
    result.rounds.push({ width, height, before, refreshed, returned });
    await context.close();
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.blockedWrites, []);
  console.log(JSON.stringify({ rounds: result.rounds.map(row => ({ width: row.width, refreshFlashes: row.refreshed.flashes, returnedFlashes: row.returned.flashes, retainedRange: row.returned.range.join('~') === row.before.range.join('~'), retainedTab: row.returned.publishers === 'true', retainedScroll: row.returned.scroll === row.before.scroll })), counts: result.counts }));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: path.join(out, "failure.png") });
    result.failure = { message: error.message, text: await currentPage.locator('.media-page').innerText().catch(() => "Media is not mounted") };
  }
  throw error;
} finally { await browser.close(); await fs.writeFile(path.join(out, "summary.json"), JSON.stringify(result, null, 2)); }
