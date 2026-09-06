import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend/dist");
const output = path.join(root, "out/monitoring-layout");
await mkdir(output, { recursive: true });
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const longTitle = "인카금융서비스, 보험설계사 교육과 소비자보호를 위한 전국 사업단 지원 체계 확대 및 장기계약 유지율 개선 계획 발표, 현장 의견을 반영한 디지털 업무 지원과 내부통제 강화 방안도 함께 공개";
const articles = [
  { title: longTitle, category: "당사", tone: "긍정", own_mentioned: true },
  { title: "보험업계, 소비자보호 교육 과정 확대", category: "보험사", tone: "중립" },
].map((article, index) => ({
  ...article, id: `layout-${index}`, article_hash: `layout-${index}`,
  link: `https://example.com/article-${index}`, source: "보험매일", keyword: "보험",
  date, report_date: date, pub_date: `${date}T08:00:00+09:00`, time: "08:00",
  summary: "보험설계사 교육과 소비자보호 지원 방안을 발표했습니다.",
}));
const snapshot = { articles, status: "live", notifications: [], watchRuns: [], reportRuns: [],
  jobRuns: [], scraps: [], mediaRelations: [], reporters: [], ads: [], aliases: [], keywords: [], feedback: [] };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const target = path.resolve(dist, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!target.startsWith(`${dist}${path.sep}`)) { response.writeHead(403).end(); return; }
  try {
    response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const width of [1920, 1366, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Isolate UI checks from production DB, collectors, and notification endpoints.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (/\/(operations|articles)\.json$/.test(url.pathname)) {
        await route.fulfill({ json: snapshot });
      } else if (url.origin !== base || url.pathname.includes("/data/") || url.pathname.endsWith("supabase.json")) {
        await route.fulfill({ json: {} });
      } else { await route.continue(); }
    });
    await page.addInitScript((data) => {
      localStorage.setItem("incar_core_snapshot_v3", JSON.stringify({ cachedAt: Date.now(), data }));
    }, snapshot);
    await page.goto(`${base}/?section=monitoring`, { waitUntil: "networkidle" });
    const workspace = page.locator(".monitoring-workspace");
    await workspace.locator(".feed-row").first().waitFor();
    assert.equal(await workspace.getByText("문맥 필터 기준", { exact: true }).count(), 0);
    assert.equal(await workspace.locator(".monitoring-layout > .panel").count(), 1);
    const geometry = await workspace.evaluate((element) => {
      const title = [...element.querySelectorAll(".feed-title-line > b")].sort((a, b) => b.textContent.length - a.textContent.length)[0];
      const row = title.closest(".feed-row");
      const actions = row.querySelector(".feed-actions");
      const main = row.querySelector(".feed-main");
      const bounds = (node) => node.getBoundingClientRect();
      const panel = element.querySelector(".monitoring-layout > .panel");
      const style = getComputedStyle(element);
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        panelGap: bounds(element).width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - bounds(panel).width,
        title: title.textContent, clipped: title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1,
        actionsBelow: bounds(actions).top >= bounds(main).bottom,
        titleWidth: Math.round(bounds(title).width), fontSize: getComputedStyle(title).fontSize,
      };
    });
    assert.ok(geometry.overflow <= 1, `horizontal overflow at ${width}: ${geometry.overflow}`);
    assert.ok(Math.abs(geometry.panelGap) <= 2, `feed does not fill workspace at ${width}`);
    assert.equal(geometry.title, longTitle);
    assert.equal(geometry.clipped, false);
    assert.equal(geometry.actionsBelow, true);
    const filterFits = await workspace.locator(".monitoring-filter-card").evaluate((filter) => {
      const box = filter.getBoundingClientRect();
      return [...filter.querySelectorAll("input, select, button")].every((control) => {
        const item = control.getBoundingClientRect();
        return item.left >= box.left && item.right <= box.right && item.bottom <= box.bottom;
      });
    });
    assert.equal(filterFits, true, `filter controls clipped at ${width}`);
    await workspace.getByPlaceholder("제목, 언론사, 키워드 검색").fill("일치하지않는검색어");
    await workspace.getByRole("button", { name: "조회/검색", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".monitoring-workspace .feed-row").length === 0);
    await workspace.getByRole("button", { name: "초기화", exact: true }).click();
    await workspace.locator(".feed-row").first().waitFor();
    assert.equal(await workspace.getByPlaceholder("제목, 언론사, 키워드 검색").inputValue(), "");
    assert.ok((await workspace.getByRole("link", { name: "기사 열기", exact: true }).first().getAttribute("href")).startsWith("https://example.com/"));
    await workspace.getByRole("button", { name: "분류 수정", exact: true }).first().click();
    await workspace.locator(".correction-editor").first().waitFor();
    await workspace.getByRole("button", { name: "분류 수정", exact: true }).first().click();
    await page.screenshot({ path: path.join(output, `monitoring-${width}.png`), fullPage: true });
    await page.goto(`${base}/?section=management`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "키워드 문맥", exact: true }).click();
    await page.locator(".management-context-rules").waitFor();
    assert.equal(await page.locator(".management-context-rules article").count(), 5);
    assert.equal(await page.getByText("문맥 필터 기준", { exact: true }).count(), 1);
    assert.equal(await page.getByText("분류 기준 관리", { exact: true }).count(), 1);
    const ruleFits = await page.locator(".management-context-rules").evaluate((rules) => [...rules.querySelectorAll("p")].every((description) => {
      const row = description.closest("article").getBoundingClientRect();
      return description.getBoundingClientRect().width >= row.width - 32 && description.scrollWidth <= description.clientWidth + 1;
    }));
    assert.equal(ruleFits, true, `context rules squeezed at ${width}`);
    if (width === 1366) await page.screenshot({ path: path.join(output, "management-1366.png"), fullPage: false });
    assert.deepEqual(errors, []);
    results.push({ width, ...geometry, errors });
    await page.close();
  }
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
