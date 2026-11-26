import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/refresh-layout");
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const now = new Date().toISOString();
const articles = Array.from({ length: 42 }, (_, index) => ({
  article_hash: `refresh-layout-${index}`, source: "보험저널", category: index % 3 ? "industry" : "own",
  title: `인카금융서비스 보험 판매 관리 동향 ${index}`, tone: index % 4 ? "neutral" : "caution",
  own_mentioned: index % 3 === 0, report_date: today, pub_date: new Date(Date.now() - index * 60000).toISOString(),
  link: `https://www.insjournal.co.kr/news/articleView.html?idxno=${980000 + index}`, summary: "보험대리점과 보험설계사의 영업 관리 현황을 확인했습니다.",
}));
const regulatorArticles = Array.from({ length: 12 }, (_, index) => ({
  article_hash: `refresh-regulator-${index}`, source: index % 2 ? "금융위원회" : "금융감독원", category: "policy", tone: "caution",
  title: index % 3 ? `금융소비자 보호 제도 안내 ${index}` : `보험대리점 판매수수료 개편 ${index}`,
  pub_date: now, report_date: today, link: `https://www.fsc.go.kr/no010101/${980000 + index}`,
}));
const freshTitle = "인카금융서비스 내부통제 제재 확인 - 화면 검증용";
const registry = {
  media: Array.from({ length: 6 }, (_, index) => ({ name: ["보험저널", "이데일리", "보험매일", "연합뉴스", "뉴스1", "한국경제"][index], article_count: 120 - index, verified_count: 10, last_at: now })),
  unknown: [{ host: "example.com", article_count: 43, own_count: 3 }], reporters: [], own_articles: 1728, as_of: now,
};
const result = { rounds: [], errors: [], blockedWrites: [], mockedDispatches: 0 };
const anchors = {
  overview: [".editorial-dashboard-header", ".editorial-kpi-strip", ".desk-priority", ".desk-story-grid", ".desk-operations", ".desk-watch", ".desk-slack", ".desk-slots", ".desk-analysis", ".desk-chart"],
  monitoring: [".monitor-header", ".monitor-filters", ".monitor-select-group .app-select", ".monitor-results-header", ".monitor-status-bar", ".monitor-table-scroll"],
  regulators: [".page-title", ".regulator-filter .app-select", ".regulator-theme-grid", ".regulator-list-panel", ".regulator-table-scroll"],
  clipping: [".page-title", ".clipping-workspace", ".clipping-category-toolbar", ".clipping-category-toolbar .app-select"],
  scraps: [".page-title", ".scrap-workspace-v2", ".scrap-collection-heading", ".scrap-collection-heading .app-select"],
  management: [".page-title", ".management-summary", ".management-tabs", ".registry-toolbar", ".registry-table-wrap", ".registry-pagination-row"],
};

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
  for (const [width, height] of [[1440, 900], [1366, 768], [390, 844]]) {
    for (const section of Object.keys(anchors)) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", error => result.errors.push({ width, section, error: error.message }));
      let changed = false;
      await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-layout.invalid", anon_key: "fixture-not-a-key" } }));
      await context.route("https://qa-layout.invalid/**", async route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
        const request = route.request().postDataJSON() || {};
        const { action, payload = {} } = request;
        let response;
        if (action === "trigger_collection") {
          changed = true; result.mockedDispatches++;
          response = { ok: true, workflow: "dashboard-refresh.yml" };
        } else if (action === "snapshot") {
          const rows = [...articles, ...regulatorArticles];
          if (changed) rows.unshift({ ...articles[0], article_hash: "refresh-new-article", title: freshTitle, tone: "negative", negative_target: "own", category: "own", own_mentioned: true });
          response = { ok: true, snapshot_at: new Date(Date.parse(now) + (changed ? 1000 : 0)).toISOString(), data: { articles: rows, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } };
        } else if (action === "article_range") response = { ok: true, articles: [...articles, ...regulatorArticles], next_offset: null };
        else if (action === "changes") response = { ok: true, revisions: {} };
        else if (action === "workflow_health") response = { ok: true, workflow: { id: payload.workflow, status: "live", latest: null, previousFailures: 0 }, checkedAt: now };
        else if (action === "media_registry") response = { ok: true, data: registry };
        else if (action === "rest" && payload.method === "GET") response = { ok: true, data: [] };
        else if (route.request().method() === "GET") response = [];
        else {
          result.blockedWrites.push(action || route.request().method());
          return route.abort();
        }
        await new Promise(resolve => setTimeout(resolve, action === "media_registry" ? 1800 : 1000));
        return route.fulfill({ json: response, headers: { "access-control-allow-origin": "*" } });
      });
      // Exercise a cold font cache as well as an unchanged-data browser reload.
      await context.route("**/*.woff2*", async route => {
        const response = await route.fetch();
        await new Promise(resolve => setTimeout(resolve, 1200));
        await route.fulfill({ response });
      });
      const selectors = [".newsroom-masthead", ".newsroom-navigation", ".newsroom-navigation > button", ".newsroom-global-actions", ...(width > 1200 ? anchors[section] : [])];
      await page.addInitScript(({ selectors }) => {
        window.__refreshGeometry = [];
        window.__readRefreshGeometry = () => Object.fromEntries(selectors.flatMap(selector => [...document.querySelectorAll(selector)].flatMap((node, index) => {
          const rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) return [];
          return [[`${selector}:${index}`, [rect.x, rect.y, rect.width, rect.height]]];
        })));
        let previous = "";
        setInterval(() => {
          const geometry = window.__readRefreshGeometry(), key = JSON.stringify(geometry);
          if (key !== previous) { previous = key; window.__refreshGeometry.push({ at: performance.now(), geometry }); }
        }, 50);
      }, { selectors });
      const ready = async () => {
        const selector = { overview: '.desk-priority[aria-busy="false"]', monitoring: '.monitor-results[aria-busy="false"]', management: '.media-registry[aria-busy="false"]' }[section];
        await page.locator(`.app-shell[data-active-section="${section}"]`).waitFor();
        if (selector) await page.locator(selector).waitFor({ timeout: 60000 });
        await page.waitForLoadState("networkidle");
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
      };
      const record = async round => {
        await ready();
        const state = await page.evaluate(() => ({ trace: window.__refreshGeometry, final: window.__readRefreshGeometry(), overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: document.documentElement.scrollHeight - innerHeight }));
        const differences = [];
        for (const sample of state.trace) for (const [key, rect] of Object.entries(sample.geometry)) {
          const expected = state.final[key];
          if (!expected) continue;
          if (rect.some((number, index) => Math.abs(number - expected[index]) > 1)) differences.push({ key, at: sample.at, before: rect, after: expected });
        }
        await page.screenshot({ path: path.join(out, `${width}-${section}-${round}.png`), animations: "disabled" });
        await fs.writeFile(path.join(out, `${width}-${section}-${round}.json`), JSON.stringify(state, null, 2));
        assert.deepEqual(differences, [], `${width}/${section}/${round}: controls or panels moved while loading`);
        assert.ok(state.overflowX <= 1, `${width}/${section}: horizontal page overflow`);
        if (width > 1200 && section === "overview") assert.ok(state.overflowY <= 1, "Home gained a page scrollbar");
        if (section === "regulators") assert.deepEqual(await page.locator('.regulator-theme-grid > button').evaluateAll(nodes => nodes.map(n=>n.dataset.category)), ["all", "감독/검사", "소비자보호", "건전성/자본", "판매채널/GA", "디지털/보안"]);
        result.rounds.push({ width, height, section, round, differences: differences.length });
        console.log(`PASS refresh layout ${width}/${section}/${round}`);
        return state.final;
      };
      const url = new URL(base); url.searchParams.set("section", section);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      const cold = await record("cold");
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.deepEqual(await record("reload"), cold, "Unchanged data changed final geometry");
      if (section === "overview" && width > 1200) {
        await page.evaluate(() => { window.__refreshGeometry = []; });
        await page.getByRole("button", { name: "새 기사 수집", exact: true }).click();
        await page.locator(".desk-story-grid h3").filter({ hasText: freshTitle }).waitFor({ timeout: 60000 });
        await record("mocked-new-data");
      }
      await context.close();
    }
  }
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.blockedWrites, []);
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, "summary.json"), JSON.stringify({ ...result, realDispatches: 0 }, null, 2));
}
