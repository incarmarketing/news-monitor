import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const baseUrl = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/newsroom-final");
const sections = ["overview", "monitoring", "media", "regulators", "clipping", "scraps", "reports", "stocks", "management"];
const results = [];
const viewportFits = [];

async function assertSelectStyles(main, label) {
  const styles = await main.locator("select:visible").evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { height: node.getBoundingClientRect().height, size: style.fontSize, padding: style.padding, radius: style.borderRadius, border: style.borderWidth, align: style.textAlign, appearance: style.appearance, chevron: style.backgroundPosition, icon: style.backgroundImage };
  }));
  for (const style of styles) {
    assert.equal(style.height, 40, `${label}: inconsistent select height`);
    assert.equal(style.size, "16px", `${label}: inconsistent select type`);
    assert.equal(style.padding, "8px 42px 8px 12px", `${label}: inconsistent select padding`);
    assert.equal(style.radius, "4px", `${label}: inconsistent select radius`);
    assert.equal(style.border, "1px", `${label}: inconsistent select border`);
    assert.equal(style.align, "center", `${label}: inconsistent selected-label alignment`);
    assert.equal(style.appearance, "none", `${label}: duplicate native chevron`);
    assert.ok(style.icon !== "none" && style.chevron.includes("14px"), `${label}: missing fixed-inset chevron`);
  }
}

async function assertTableAlignment(main, selector, expected) {
  const table = main.locator(selector);
  await table.waitFor();
  assert.deepEqual(await table.locator("thead th").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign)), expected, `${selector}: header alignment differs`);
  const firstRow = table.locator("tbody tr").filter({ hasNot: table.page().locator("[colspan]") }).first();
  if (await firstRow.count()) {
    assert.deepEqual(await firstRow.locator("td").evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textAlign)), expected, `${selector}: cell alignment differs`);
  }
}

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
  for (const viewport of [{ width: 1440, height: 1024 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(30_000);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".newsroom-navigation").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".editorial-kpi-strip b")].some(node => Number(node.textContent) > 0), { timeout: 30_000 }).catch(() => {});
    const desktop = viewport.width > 1240;
    for (let round = 1; round <= (desktop ? 2 : 1); round++) {
      for (const section of sections) {
        if (!desktop && section === "reports") continue;
        const started = Date.now();
        await page.locator(`.newsroom-navigation [data-section="${section}"]`).click();
        await page.locator(`.app-shell[data-active-section="${section}"]`).waitFor();
        const main = page.locator("main.workspace:visible");
        await main.locator("h1").waitFor();
        await page.waitForFunction(() => ![...document.querySelectorAll('main.workspace')].filter(e => e.getBoundingClientRect().width).some(e => /화면 불러오는 중/.test(e.innerText)));
        if (section === "media") await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        const font = await page.evaluate(() => ({
          family: getComputedStyle(document.body).fontFamily,
          loaded: document.fonts.check('700 24px "Pretendard Variable"', "오늘의 언론 상황"),
          resources: performance.getEntriesByType("resource").filter(entry => /Pretendard.*woff2/.test(entry.name)).length,
        }));
        assert.ok(font.loaded && font.resources > 0, `${section}: bundled Korean font did not load`);
        if (section === "management") {
          await page.waitForFunction(() => ![...document.querySelectorAll(".registry-empty")].some(node => /조회 중/.test(node.textContent)), { timeout: 30_000 });
        }
        // Let measured chart dimensions finish without waiting for unrelated network polling.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, text: [...document.querySelectorAll("main.workspace")].filter(e => e.getBoundingClientRect().width).map(e => e.innerText).join(" ").length }));
        await assertSelectStyles(main, section, section === "overview");
        assert.ok(layout.overflow <= 2, `${section}: horizontal page overflow ${layout.overflow}`);
        assert.ok(layout.text > 30, `${section}: empty workspace`);
        assert.deepEqual(errors, [], `${section}: JavaScript errors`);
        const file = `${desktop ? "desktop" : "mobile"}-${section}${round > 1 ? "-repeat" : ""}.png`;
        await page.screenshot({ path: path.join(out, file), fullPage: false, animations: "disabled" });
        results.push({ section, viewport, round, durationMs: Date.now() - started, layout, font, screenshot: file });
        console.log(`PASS ${viewport.width}/${section} round=${round}`);

        if (desktop && round === 1 && section === "overview") {
          const point = page.locator(".desk-small-multiples circle").first();
          if (await point.count()) {
            await point.hover();
            await page.getByRole("tooltip").waitFor();
            assert.match(await page.getByRole("tooltip").innerText(), /당사.*건/s);
            await point.focus();
            await point.press("ArrowRight");
            await page.getByRole("tooltip").waitFor();
            await page.screenshot({ path: path.join(out, "desktop-tooltip.png"), animations: "disabled" });
          }
          await page.locator(".desk-priority select").selectOption("latest");
          assert.equal(await page.locator(".app-shell").getAttribute("data-active-section"), "overview");
          await page.locator(".desk-priority select").selectOption("risk");
          const links = await page.locator(".desk-story-grid h3 a").evaluateAll(nodes => nodes.map(e => ({ href: e.href, target: e.target })));
          assert.ok(links.every(link => /^https?:/.test(link.href) && link.target === "_blank"));
        }
        if (round === 1 && section === "overview") {
          for (const control of [page.locator(".editorial-kpi-strip button").filter({ hasText: "리스크" }), page.getByTitle("분류별 건수와 전일 대비 현황", { exact: true })]) {
            await control.click();
            const dialog = page.getByRole("dialog").last();
            await dialog.waitFor();
            assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), "dialog focus escaped to the page");
            await dialog.getByRole("button", { name: "닫기", exact: true }).click();
          }
          await page.getByRole("button", { name: "Slack 발송 이력 열기", exact: true }).click();
          const history = page.getByRole("dialog", { name: "Slack 발송 이력", exact: true });
          await history.waitFor();
          const bounds = await history.boundingBox();
          assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, "Slack history exceeds viewport");
          assert.ok(await history.evaluate(node => node.scrollWidth <= node.clientWidth), "Slack history contents overflow");
          const firstDelivery = history.locator(".notification-list > button").first();
          if (await firstDelivery.count()) {
            await firstDelivery.click();
            const detail = page.locator(".notification-detail-dialog");
            await detail.waitFor();
            assert.ok(await detail.evaluate(node => node.contains(document.activeElement)), "delivery detail did not receive focus");
            await page.keyboard.press("Escape");
            await detail.waitFor({ state: "detached" });
            assert.equal(await history.isVisible(), true, "closing delivery detail also closed its parent");
          }
          await page.screenshot({ path: path.join(out, `${desktop ? "desktop" : "mobile"}-slack-history.png`), animations: "disabled" });
          await page.keyboard.press("Escape");
          await history.waitFor({ state: "detached" });
          assert.equal(await page.locator(".app-shell").getAttribute("data-active-section"), "overview");
        }
        if (desktop && round === 1 && section === "monitoring") {
          const sort = main.locator(".monitor-sort select");
          const originalSort = await sort.inputValue();
          await sort.focus();
          await sort.press("ArrowDown");
          await sort.press("Enter");
          assert.equal(await page.locator(".app-shell").getAttribute("data-active-section"), "monitoring");
          await sort.selectOption(originalSort);
          const actionBoxes = await main.locator(".monitor-article-row").first().locator(".monitor-action").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }));
          assert.ok(actionBoxes.every(box => box.width >= 32), "monitoring action columns are collapsed");
          assert.ok(actionBoxes[0].right <= actionBoxes[1].left + 1, "monitoring action buttons overlap");
          const search = main.getByRole("textbox", { name: "검색어", exact: true });
          await search.fill("qa-no-match-20261124");
          await main.getByRole("button", { name: "조회/검색", exact: true }).click();
          await main.getByRole("button", { name: "검색 초기화", exact: true }).click();
          assert.equal(await search.inputValue(), "");
          const first = main.locator(".monitor-check input").first();
          if (await first.count()) {
            await first.check();
            const download = page.waitForEvent("download");
            await main.getByRole("button", { name: /선택.*CSV/ }).click();
            assert.match((await download).suggestedFilename(), /\.csv$/);
            await first.uncheck();
          }
        }
        if (desktop && round === 1 && section === "reports") {
          await main.getByRole("button", { name: "주간", exact: true }).click();
          await main.getByRole("heading", { name: "주간 뉴스 브리핑", exact: true }).waitFor();
          await main.getByRole("button", { name: "월간", exact: true }).click();
          await main.getByRole("heading", { name: "월간 미디어 브리핑", exact: true }).waitFor();
          await main.locator(".month-select select").waitFor();
          await assertSelectStyles(main, "reports/monthly");
          await main.getByRole("button", { name: "일간", exact: true }).click();
          await main.getByRole("heading", { name: "일일 언론 동향", exact: true }).waitFor();
          await page.evaluate(() => { window.__qaPrinted = false; window.print = () => { window.__qaPrinted = true; }; });
          await main.getByRole("button", { name: "PDF 저장", exact: true }).click();
          await page.waitForFunction(() => window.__qaPrinted === true);
          assert.equal(await page.evaluate(() => window.__qaPrinted), true);
        }
        if (desktop && round === 1 && section === "media") {
          await main.getByRole("button", { name: "30일", exact: true }).click();
          await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 90000 });
          await main.getByRole("button", { name: "7일", exact: true }).click();
          await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 90000 });
          const point = main.locator(".tone-trend circle").last();
          if (await point.count()) { await point.hover(); await main.getByRole("tooltip").waitFor(); }
          await main.getByRole("tab", { name: "언론사별 보도량", exact: true }).click();
          await main.getByRole("tab", { name: "주요 키워드", exact: true }).click();
          const download = page.waitForEvent("download");
          await main.getByRole("button", { name: "다운로드", exact: true }).click();
          assert.match((await download).suggestedFilename(), /^media-analysis-.*\.csv$/);
        }
        if (desktop && round === 1 && section === "clipping") {
          await main.getByRole("tab", { name: "당사", exact: true }).click();
          await main.getByRole("tab", { name: "전체", exact: true }).click();
          await main.getByRole("combobox", { name: "클리핑 정렬" }).selectOption("latest");
          await main.getByRole("combobox", { name: "클리핑 정렬" }).selectOption("recommended");
        }
        if (desktop && round === 1 && section === "stocks") {
          await main.getByRole("button", { name: "20거래일", exact: true }).click();
          await main.getByRole("button", { name: "5거래일", exact: true }).click();
          await main.getByRole("tab", { name: "상대 수익률", exact: true }).click();
          await main.getByRole("tab", { name: "주가", exact: true }).click();
          await main.locator(".stock-custom-range summary").click();
          await main.locator('.stock-range-input input').fill("15");
          await main.locator(".stock-range-reset").click();
          await main.locator(".stock-custom-range summary").click();
        }
        if (round === 1 && section === "management") {
          const tabs = main.locator(".management-tabs");
          for (const name of ["기자 관리", "광고비 관리", "키워드 문맥", "분류 피드백", "분류 점검", "언론사 관리"]) {
            await tabs.getByRole("button", { name, exact: true }).click();
            await page.waitForFunction(() => ![...document.querySelectorAll(".registry-empty")].some(node => /조회 중/.test(node.textContent)), { timeout: 30_000 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await assertSelectStyles(main, `management/${name}`);
            assert.deepEqual(errors, [], `management/${name}: JavaScript errors`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 2), `management/${name}: horizontal page overflow`);
            if (name === "광고비 관리") {
              const heights = await main.locator(".ad-chart-box").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
              assert.ok(heights.length === 3 && heights.every(height => height >= 200), "advertising charts have no plotting height");
            }
            if (name === "기자 관리") {
              await assertTableAlignment(main, ".registry-table", ["left","left","right","center","center"]);
              await main.getByRole("tab", { name: "연락처·관리 정보", exact: true }).click();
              await assertTableAlignment(main, ".reporter-data-table", ["left","left","left","center","left","center","left","left","left","center"]);
              await assertSelectStyles(main, "management/manual-reporters");
            }
            if (name === "언론사 관리") {
              await assertTableAlignment(main, ".registry-table", ["left","left","right","center","center"]);
              await main.getByRole("tab", { name: /언론사 미확인/ }).click();
              await assertTableAlignment(main, ".registry-table", ["left","right","right","center","center"]);
              await main.getByRole("tab", { name: "관리 정보", exact: true }).click();
              await assertTableAlignment(main, ".media-data-table", ["left","left","center","center","left","center","left","left","center"]);
              await assertSelectStyles(main, "management/manual-media");
              await main.getByRole("tab", { name: "당사 보도 매체", exact: true }).click();
            }
          }
        }
      }
    }
    if (!desktop) assert.equal(await page.locator('.newsroom-navigation [data-section="reports"]').isVisible(), false);
    await context.close();
  }
  for (const [width, height] of [[1280,720],[1366,768],[1440,900],[1672,941],[1920,1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".desk-story-grid h3").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fit = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      stories: [...document.querySelectorAll(".desk-story-grid > article")].map(node => ({ overflow: node.scrollHeight - node.clientHeight, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, titleTop: node.querySelector("h3").getBoundingClientRect().top, titleBottom: node.querySelector("h3").getBoundingClientRect().bottom, titleRight: node.querySelector("h3").getBoundingClientRect().right, publisherLeft: node.querySelector(".desk-story-publisher").getBoundingClientRect().left })),
      charts: [...document.querySelectorAll(".desk-chart")].map(node => ({ height: node.getBoundingClientRect().height, bottom: node.getBoundingClientRect().bottom })),
    }));
    assert.ok(fit.overflowX <= 1 && fit.overflowY <= 1, `${width}/${height}: dashboard scrolls`);
    assert.equal(fit.stories.length, 5);
    assert.ok(fit.stories.every(story => story.overflow <= 2 && story.titleTop >= story.top && story.titleBottom <= story.bottom && story.titleRight <= story.publisherLeft), `${width}/${height}: article content overlaps`);
    assert.ok(fit.charts.length === 4 && fit.charts.every(chart => chart.height >= 130 && chart.bottom <= height), `${width}/${height}: clipped chart`);
    await page.mouse.wheel(0, 500);
    assert.equal(await page.evaluate(() => scrollY), 0, `${width}/${height}: dashboard scroll position changed`);
    await page.screenshot({ path: path.join(out, `desktop-fit-${width}.png`), animations: "disabled" });
    viewportFits.push({ width,height,...fit });
    console.log(`PASS dashboard viewport ${width}x${height}: no scrolling or clipped content`);
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, "summary.json"), JSON.stringify({ baseUrl, results }, null, 2));
  await fs.writeFile(path.join(out, "viewport-fits.json"), JSON.stringify(viewportFits, null, 2));
}
console.log(`Verified ${results.length} screens and navigation/search/CSV/tooltip/report interactions.`);
