import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chooseOption } from "./select-qa.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/media-clipping");
const results = { errors: [], layouts: [], drills: [], writes: [] };
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
await fs.mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => results.errors.push(error.message));
  let rangeRequests = 0;
  page.on("request", request => {
    if (!request.url().includes("/functions/v1/dashboard-api")) return;
    const { action = "" } = request.postDataJSON() || {};
    if (action === "article_range") rangeRequests += 1;
    if (/^(save_|trigger_|dispatch|collect|generate_)/.test(action)) results.writes.push(action);
  });
  const navigate = async section => {
    await page.locator(`.newsroom-navigation [data-section="${section}"]`).click();
    await page.locator(`.app-shell[data-active-section="${section}"]`).waitFor();
  };
  const main = page.locator("main.workspace:visible");
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await navigate("media");
  await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);

  for (const [width, height] of [[1280,720], [1366,768], [1440,900], [1600,900], [1920,1080], [1024,768], [390,844]]) {
    await page.setViewportSize({ width, height });
    await main.getByRole("tab", { name: "주요 키워드", exact: true }).click();
    const before = await main.locator(".media-keyword-content").boundingBox();
    await main.getByRole("tab", { name: "언론사별 보도량", exact: true }).click();
    assert.deepEqual(await main.locator(".media-keyword-content").boundingBox(), before, "tab changed detail bounds");
    const layout = await page.evaluate(() => {
      const box = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
      const plots = [...document.querySelectorAll(".tone-panel")];
      const issues = document.querySelector(".media-issues");
      return { width:innerWidth, overflowX:document.documentElement.scrollWidth-innerWidth, overflowY:document.documentElement.scrollHeight-innerHeight,
        dividerError:Math.abs(plots[2].getBoundingClientRect().left-issues.getBoundingClientRect().left),
        rows:[...document.querySelectorAll(".press-row")].map(row=>({ width:row.getBoundingClientRect().width, parent:row.parentElement.getBoundingClientRect().width, bar:row.querySelector(".press-bar").getBoundingClientRect().width, text:row.innerText })),
        sections:[...document.querySelectorAll(".media-keywords,.media-issues")].map(box),
        headers:[document.querySelector(".media-keywords > .newsroom-content-tabs"), document.querySelector(".media-issues .panel-head")].map(box) };
    });
    assert.ok(layout.overflowX <= 1);
    if (width >= 1201) {
      assert.ok(layout.overflowY <= 1); assert.ok(layout.dividerError <= 1, "misaligned middle divider");
      assert.ok(Math.abs(layout.headers[0].y-layout.headers[1].y)<=1 && Math.abs(layout.headers[0].height-layout.headers[1].height)<=1, "unequal lower headings");
    }
    assert.ok(layout.rows.length > 0 && layout.rows.every(row => Math.abs(row.width-row.parent) <= 1 && row.bar >= 50 && !row.text.includes("NaN")));
    assert.equal(await main.getByRole("heading", { name:"언론사별 보도량", exact:true }).count(), 0, "duplicate heading");
    await page.screenshot({ path:path.join(out, `publishers-${width}.png`), animations:"disabled" });
    results.layouts.push(layout);
  }

  await page.setViewportSize({ width:1600, height:900 });
  for (const days of [30,90]) {
    await main.getByRole("button", { name:`${days}일`, exact:true }).click();
    await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout:120000 });
    await main.getByRole("tab", { name:"언론사별 보도량", exact:true }).click();
    const row = main.locator(".press-row").first();
    const source = await row.locator(".press-name b").innerText();
    const expected = Number((await row.locator(":scope > strong").innerText()).replace(/\D/g,""));
    const dates = await main.locator('input[type="date"]').evaluateAll(nodes=>nodes.map(node=>node.value.replaceAll("-",".")));
    const requestsBefore = rangeRequests;
    await row.click();
    await page.locator('.app-shell[data-active-section="monitoring"]').waitFor();
    await main.locator('.monitor-results[aria-busy="false"]').waitFor();
    await page.waitForFunction(expectedCount => Number(document.querySelector(".monitor-category-tabs button b")?.textContent) === expectedCount, expected, { timeout:60000 });
    assert.equal(await main.getByRole("combobox", { name:"언론사", exact:true }).getAttribute("data-value"), source);
    assert.equal(await main.locator(".monitor-date-label").innerText(), dates.join(" - "));
    assert.ok((await main.locator(".monitor-publisher").allTextContents()).every(value=>value===source));
    assert.equal(rangeRequests, requestsBefore, "drilldown refetched already-loaded history");
    results.drills.push({ days, source, expected, rangeRequests:rangeRequests-requestsBefore });
    await page.screenshot({ path:path.join(out, `drill-${days}.png`) });
    await main.getByRole("button", { name:"검색 초기화", exact:true }).click();
    assert.equal(await main.getByRole("combobox", { name:"언론사", exact:true }).getAttribute("data-value"), "all");
    await navigate("media");
    await main.locator('.media-intel-board[aria-busy="false"]').waitFor({ timeout:120000 });
  }

  await navigate("clipping");
  await main.locator(".clipping-candidate-card").first().waitFor();
  for (const [width,height] of [[1280,720],[1600,900],[390,844]]) {
    await page.setViewportSize({ width,height });
    await page.evaluate(()=>scrollTo(0,0));
    const rows = await main.locator(".clipping-candidate-card").evaluateAll(nodes=>nodes.map(node=>({
      height:node.getBoundingClientRect().height, font:getComputedStyle(node.querySelector("h3")).fontSize,
      overflow:node.scrollWidth-node.clientWidth, title:node.querySelector("h3").textContent,
      actions:node.querySelector(".clipping-card-actions").getBoundingClientRect().right <= node.getBoundingClientRect().right+1,
    })));
    assert.ok(rows.length > 1 && rows.every(row=>row.font===rows[0].font && row.actions && row.overflow<=1 && row.title));
    if (width>=1201) assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({ path:path.join(out, `clipping-${width}.png`), animations:"disabled" });
  }
  await page.setViewportSize({ width:1600,height:900 });
  const panel = await main.locator(".clipping-candidate-panel").boundingBox();
  await main.getByRole("tab", { name:"당사",exact:true }).click();
  assert.deepEqual(await main.locator(".clipping-candidate-panel").boundingBox(),panel);
  await main.getByRole("tab", { name:"전체",exact:true }).click();
  await chooseOption(page, main.getByRole("combobox", { name:"클리핑 정렬" }), "latest");
  await chooseOption(page, main.getByRole("combobox", { name:"클리핑 정렬" }), "recommended");
  await main.getByRole("button", { name:"선정 근거",exact:true }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.deepEqual(await main.locator(".clipping-candidate-panel").boundingBox(),panel);
  const more = main.getByRole("button", { name:/기사 더 보기/ });
  if (await more.count()) {
    const count = await main.locator(".clipping-candidate-card").count();
    await more.click();
    assert.ok(await main.locator(".clipping-candidate-card").count() > count);
    assert.deepEqual(await main.locator(".clipping-candidate-panel").boundingBox(),panel);
  }
  assert.deepEqual(results.errors,[]);
  assert.deepEqual(results.writes,[]);
  console.log(JSON.stringify({ layouts:results.layouts.length, drills:results.drills, errors:results.errors, writes:results.writes }));
} finally { await browser.close(); await fs.writeFile(path.join(out,"summary.json"),JSON.stringify(results,null,2)); }
