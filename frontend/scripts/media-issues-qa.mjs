import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chooseOption } from "./select-qa.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/media-issues");
const now = new Date(), today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
const month = Number(today.slice(5, 7)), year = today.slice(0, 4);
const make = (id, title, extra = {}) => ({ article_hash: `media-issue-${id}`, title, source: "보험저널", link: `https://example.com/media-qa/${id}`, pub_date: new Date(now.getTime() - Number(id) * 60000).toISOString(), report_date: today, category: "policy", tone: "caution", ...extra });
const commission = Array.from({ length: 72 }, (_, index) => make(index, `GA 1200%룰 시행 수수료 제도 개편 발표 ${index}`, { summary: "GA 보험 판매수수료 1200%룰 시행과 적용 기준을 확인한다." }));
const brand = [
  make(80, `독립 보험대리점 브랜드평판 ${year}년 ${month}월…1위 인카금융서비스, 2위 에이플러스에셋, 3위 프라임에셋`, { summary: "한국기업평판연구소의 독립 보험대리점 브랜드평판 발표", category: "own", tone: "positive", own_mentioned: true }),
  make(81, `인카금융서비스, ${month}월 GA 평판 1위 독주…에이플러스에셋 2위 탈환`, { category: "own", tone: "positive", own_mentioned: true }),
  make(82, `[빅데이터로본다] 독립 보험대리점 ${year}년 ${month}월 브랜드평판 1위 인카금융서비스, 2위 에이플러스에셋, 3위 프라임에셋`, { category: "own", tone: "positive", own_mentioned: true }),
];
const articles = [...commission, ...brand,
  make(90, "인카금융서비스, 보험설계사 교육센터 신규 개소", { category: "own", tone: "positive", own_mentioned: true }),
  make(91, "인카금융서비스, 아이지넷과 마이데이터 업무협약 체결", { category: "own", tone: "positive", own_mentioned: true }),
  make(92, "인카금융서비스 전직 설계사 보험사기 등록취소 제재", { category: "own", tone: "negative", own_mentioned: true, negative_target: "own" }),
  make(93, "금융위원회, 금융소비자 보호 법령 개정 추진", { category: "policy", tone: "caution" }),
  make(94, "삼성화재, 자동차보험 전산 시스템 개편", { category: "competitor", tone: "neutral" }),
];
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const report = { screenshots: [], errors: [], writes: [], traversedArticles: 0, rangeReads: 0 };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.route(/\/supabase\.json(?:\?.*)?$/, route => route.fulfill({ json: { url: "https://qa-media.invalid", anon_key: "fixture-not-a-key" } }));
  await context.route("https://qa-media.invalid/**", route => {
    const { action, payload = {} } = route.request().postDataJSON() || {};
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (action === "snapshot") return route.fulfill({ headers, json: { ok: true, snapshot_at: now.toISOString(), data: { articles, notifications: [], watch_runs: [], report_runs: [], job_runs: [] } } });
    if (action === "article_range") { report.rangeReads++; return route.fulfill({ headers, json: { ok: true, articles, next_offset: null } }); }
    if (action === "changes") return route.fulfill({ headers, json: { ok: true, revisions: {} } });
    if (action === "workflow_health") return route.fulfill({ headers, json: { ok: true, workflow: { id: payload.workflow, status: "live", latest: null }, checkedAt: now.toISOString() } });
    if (route.request().method() === "GET") return route.fulfill({ headers, json: [] });
    report.writes.push(action); return route.abort();
  });
  await context.route("https://example.com/**", route => route.fulfill({ contentType: "text/html", body: "<main>Original article test</main>" }));
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  const url = new URL(base); url.searchParams.set("section", "media");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".media-issue-entry").count(), 6, "issue count and rendered list disagree");
  assert.equal(await page.locator('.media-issue-entry[data-article-count="1"] button').count(), 0, "single articles displayed a misleading group button");
  assert.match(await page.locator(".media-issues .panel-head").innerText(), /이슈 6개/);
  assert.equal(await page.locator(".media-issue-entry h3").filter({ hasText: /브랜드평판|GA 평판/ }).count(), 1, "one ranking announcement occupied several issue slots");
  const snapshot = async name => { await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" }); report.screenshots.push(name); };
  await snapshot("desktop-closed");
  const trigger = page.getByRole("button", { name: /기사 72건 보기$/ });
  await trigger.scrollIntoViewIfNeeded();
  const anchors = () => page.locator(".media-main-trend,.media-keywords,.media-issues,.media-intel-board .dashboard-svg-chart").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, node.getAttribute("viewBox")]; }));
  const before = await anchors(), scrollY = await page.evaluate(() => window.scrollY), reads = report.rangeReads;
  await trigger.click();
  const drawer = page.getByRole("dialog");
  await drawer.waitFor();
  await drawer.getByRole("combobox", { name: "관련 기사 정렬" }).click();
  await page.getByRole("listbox").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await drawer.isVisible(), true, "closing the sort menu also dismissed the drawer");
  assert.deepEqual(await anchors(), before, "opening the drawer resized the underlying view");
  assert.equal(await page.evaluate(() => window.scrollY), scrollY);
  const links = drawer.locator("a.media-related-row");
  const seen = new Set();
  for (let index = 0; index < 8; index++) {
    assert.equal(await links.count(), index === 7 ? 2 : 10);
    for (const href of await links.evaluateAll(nodes => nodes.map(node => node.href))) seen.add(href);
    if (index < 7) await drawer.getByRole("button", { name: "관련 기사 다음 페이지" }).click();
  }
  assert.equal(seen.size, 72); report.traversedArticles = seen.size;
  assert.equal(await drawer.getByRole("button", { name: "관련 기사 다음 페이지" }).isDisabled(), true);
  await snapshot("desktop-last-page");
  await drawer.getByRole("textbox", { name: "관련 기사 검색" }).fill("개편 발표 71");
  assert.equal(await links.count(), 1);
  assert.equal(await drawer.getByRole("combobox", { name: "관련 기사 페이지" }).getAttribute("data-value"), "1");
  await drawer.getByRole("textbox", { name: "관련 기사 검색" }).fill("검색 결과가 없는 문구");
  assert.equal(await links.count(), 0);
  await drawer.getByRole("button", { name: "관련 기사 검색 초기화" }).click();
  await chooseOption(page, drawer.getByRole("combobox", { name: "관련 기사 정렬" }), "oldest");
  assert.match(await links.first().getAttribute("href"), /\/71$/);
  await chooseOption(page, drawer.getByRole("combobox", { name: "관련 기사 정렬" }), "latest");
  const popupEvent = page.waitForEvent("popup");
  await links.first().click();
  const popup = await popupEvent; await popup.waitForLoadState("domcontentloaded");
  assert.match(popup.url(), /example\.com\/media-qa\/0$/); await popup.close();
  assert.equal(await page.locator(".app-shell").getAttribute("data-active-section"), "media");
  await snapshot("desktop-drawer");
  await drawer.getByRole("button", { name: "관련 기사 닫기" }).focus();
  for (let index = 0; index < 15; index++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest("dialog[open]"))), true); }
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true, "close did not restore focus");
  assert.deepEqual(await anchors(), before);
  await trigger.click();
  for (const [width, height] of [[1366, 768], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    const bounds = await drawer.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y === 0 && Math.abs(bounds.height - height) < 1 && bounds.x + bounds.width <= width + 1);
    if (width <= 560) assert.ok(bounds.x === 0 && Math.abs(bounds.width - width) < 1, "mobile drawer left a viewport gutter");
    assert.ok(await drawer.evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    assert.equal(await links.count(), 10);
    await snapshot(`drawer-${width}`);
  }
  await drawer.getByRole("button", { name: "관련 기사 닫기" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await trigger.click();
  await drawer.waitFor();
  await page.mouse.click(100, 200);
  await drawer.waitFor({ state: "hidden" });
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), "hidden", "closing the drawer left page scrolling locked");
  assert.equal(report.rangeReads, reads, "opening or paginating fetched the same article data again");
  assert.deepEqual(report.errors, []); assert.deepEqual(report.writes, []);
  console.log(JSON.stringify(report));
} finally { await browser.close(); await fs.writeFile(path.join(out, "summary.json"), JSON.stringify(report, null, 2)); }
