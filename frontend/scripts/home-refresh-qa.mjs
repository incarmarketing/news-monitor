import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/home-refresh");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const results = { rounds: [], errors: [], mockedDispatches: 0 };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", error => results.errors.push(error.message));
  let firstRead, changed = false, release, fetched;
  const gate = new Promise(resolve => { release = resolve; });
  const fetchedSignal = new Promise(resolve => { fetched = resolve; });
  const fixtureTitle = "QA 검증용 인카금융서비스 내부통제 제재 기사";
  await page.route("**/functions/v1/dashboard-api", async route => {
    const action = route.request().postDataJSON()?.action;
    if (action === "trigger_collection") {
      changed = true; results.mockedDispatches += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, workflow: "dashboard-refresh.yml" }) });
    }
    if (action !== "snapshot") return route.continue();
    if (!firstRead) firstRead = route.fetch().then(async response => {
      assert.ok(response.ok()); const value = await response.json(); fetched(); return value;
    });
    const payload = structuredClone(await firstRead);
    await gate;
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    assert.ok(Array.isArray(data.articles) && data.articles.length);
    if (changed) {
      const now = new Date().toISOString();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
      data.articles.unshift({ article_hash: "f".repeat(64), title: fixtureTitle, link: "https://example.com/home-qa-only", source: "보험저널", report_date: today, pub_date: now, category: "own", tone: "negative", own_mentioned: true,
        summary: "인카금융서비스에 대한 내부통제 부실 제재를 확인하는 브라우저 검증용 데이터입니다.", score: 100,
        ai_context: { category: "own", tone: "negative", own_mentioned: true, negative_target: "own", evidence: fixtureTitle } });
      data.articles_generated_at = now;
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.addInitScript(() => {
    window.__homeTrace = []; window.__homeLongTasks = [];
    let previous = "";
    new MutationObserver(() => {
      const rows = [...document.querySelectorAll('.desk-story-grid > article:not([aria-hidden="true"])')].map(node => ({ title: node.querySelector("h3")?.textContent, link: node.querySelector("h3 a")?.href }));
      const key = JSON.stringify(rows);
      if (rows.length && key !== previous) { previous = key; window.__homeTrace.push({ at: performance.now(), rows }); }
    }).observe(document, { childList: true, subtree: true, characterData: true });
    new PerformanceObserver(list => window.__homeLongTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: "longtask", buffered: true });
  });
  const ready = () => page.locator('.desk-priority[aria-busy="false"] .desk-story-grid > article').first().waitFor({ timeout: 60000 });
  const anchors = () => page.locator(".desk-priority,.desk-operations,.desk-analysis").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; }));
  const record = async name => {
    await ready(); await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({ trace: window.__homeTrace, longestTask: Math.max(0, ...window.__homeLongTasks) }));
    results.rounds.push({ name, ...state }); return state.trace;
  };
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await fetchedSignal;
  await page.locator('.desk-priority[aria-busy="true"]').waitFor();
  assert.equal(await page.locator(".desk-story-skeleton").count(), 5);
  assert.equal(await page.locator(".desk-priority .desk-empty").count(), 0);
  assert.ok((await page.locator(".editorial-kpi-strip b").allTextContents()).every(text => text === ""));
  await page.evaluate(() => document.fonts.ready);
  const initialBounds = await anchors();
  await page.screenshot({ path: path.join(out, "home-loading.png") });
  await page.locator('.newsroom-navigation [data-section="monitoring"]').click();
  await page.locator('.app-shell[data-active-section="monitoring"]').waitFor();
  assert.equal(await page.locator('.monitor-results').getAttribute('aria-busy'), 'true');
  assert.equal(await page.getByText('검색 조건에 맞는 기사가 없습니다.', { exact:true }).count(), 0, "initial read was presented as an empty result");
  await page.locator('.newsroom-navigation [data-section="overview"]').click();
  release();
  const cold = await record("cold");
  assert.equal(cold.length, 1, "cold load displayed provisional articles");
  assert.deepEqual(await anchors(), initialBounds);
  const expected = cold[0].rows;
  await page.screenshot({ path: path.join(out, "home-ready.png") });
  for (let round = 1; round <= 2; round += 1) {
    await page.reload({ waitUntil: "domcontentloaded" });
    const trace = await record(`reload-${round}`);
    assert.equal(trace.length, 1, "cached reload displayed two rankings");
    assert.deepEqual(trace[0].rows, expected, "cached reload changed unchanged priority data");
  }
  await page.evaluate(() => { window.__homeTrace = []; });
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.locator('.desk-story-grid > article:not([aria-hidden="true"]) h3').filter({ hasText: fixtureTitle }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1800);
  const refresh = await page.evaluate(() => window.__homeTrace);
  assert.equal(refresh.length, 1, "refresh overwrote committed priorities with a provisional list");
  assert.ok(refresh[0].rows.some(row => row.title === fixtureTitle), "legitimate fresh data was frozen out");
  assert.deepEqual(await anchors(), initialBounds);
  results.rounds.push({ name: "mocked-manual-new-data", trace: refresh });
  assert.deepEqual(results.errors, []);
  assert.equal(results.mockedDispatches, 1);
  console.log(JSON.stringify({ rounds: results.rounds.map(row => ({ name:row.name, changes:row.trace.length, fourth:row.trace.at(-1)?.rows[3]?.title, longestTask:row.longestTask })), errors:results.errors, realDispatches:0 }));
} finally { await browser.close(); await fs.writeFile(path.join(out, "summary.json"), JSON.stringify(results, null, 2)); }
