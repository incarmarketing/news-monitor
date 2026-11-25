import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out = path.resolve(process.env.DESIGN_QA_OUT || ".qa/ledger-layout");
const verify = process.env.DESIGN_QA_VERIFY !== "0";
const sections = ["overview", "monitoring", "media", "clipping", "reports"];
const results = [];
const failures = [];
const anchors = {
  overview: [".desk-priority", ".desk-story-grid", ".desk-operations", ".desk-analysis"],
  monitoring: [".monitor-header", ".monitor-search", ".monitor-results", ".monitor-table-scroll", ".monitor-pagination"],
  media: [".media-command-panel", ".media-main-trend", ".media-keywords", ".media-issues"],
  clipping: [".page-title", ".clipping-category-toolbar", ".clipping-candidate-panel"],
  reports: [".report-command-panel", ".a4-report-stage", ".newspaper-footer"],
};

function measure(selectors) {
  const visible = node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  const box = node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, overflow: node.scrollHeight - node.clientHeight };
  };
  const main = [...document.querySelectorAll("main.workspace")].find(visible);
  return {
    section: document.querySelector(".app-shell").dataset.activeSection,
    viewport: { width: innerWidth, height: innerHeight },
    overflowY: document.documentElement.scrollHeight - innerHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    theme: getComputedStyle(document.documentElement).colorScheme,
    main: box(main),
    anchors: Object.fromEntries(selectors.map(s => [s, main.querySelector(s)]).filter(([,node]) => node && visible(node)).map(([s,node]) => [s,box(node)])),
    navigation: [...document.querySelectorAll(".newsroom-navigation button")].filter(visible).map(node => ({ id: node.dataset.section, ...box(node) })),
    selects: [...main.querySelectorAll("select")].filter(visible).map(node => {
      const style = getComputedStyle(node);
      return { ...box(node), label: node.getAttribute("aria-label"), appearance: style.appearance, position: style.backgroundPosition, padding: style.padding, icon: style.backgroundImage };
    }),
    charts: [...main.querySelectorAll(".desk-chart, .tone-trend, .report-count-chart")].filter(visible).map(box),
    plotBounds: [...main.querySelectorAll(".desk-chart, .tone-trend, .report-count-chart")].filter(visible).map(node => ({ container: box(node), plot: node.querySelector("svg") ? box(node.querySelector("svg")) : null })),
    stories: [...main.querySelectorAll(".desk-story-grid > article")].map(box),
  };
}

const settle = page => page.evaluate(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
async function snapshot(page, section, state) {
  await settle(page);
  const metrics = await page.evaluate(measure, anchors[section]);
  await page.screenshot({ path: path.join(out, `${metrics.viewport.width}-${section}-${state}.png`), animations: "disabled" });
  results.push({ state, ...metrics });
  if (verify && metrics.viewport.width >= 1201) {
    assert.ok(metrics.overflowY <= 1 && metrics.overflowX <= 1, `${section}/${state}: document overflow ${metrics.overflowX},${metrics.overflowY}`);
    assert.ok(metrics.main.bottom <= metrics.viewport.height + 1, `${section}/${state}: workspace exceeds viewport`);
    for (const [selector,box] of Object.entries(metrics.anchors)) {
      assert.ok(box.y >= 0 && box.bottom <= metrics.viewport.height + 1, `${section}/${state}: hidden ${selector}`);
    }
    for (const select of metrics.selects) {
      assert.equal(select.appearance, "none");
      assert.ok(select.position.includes("14px") && select.icon !== "none", `${section}: inconsistent chevron`);
    }
    for (const {container,plot} of metrics.plotBounds) {
      if (plot) assert.ok(plot.bottom <= container.bottom + 1, `${section}: plot exceeds its reserved height`);
    }
  }
  assert.equal(metrics.theme, "light");
  return metrics;
}

function stable(before, after, label) {
  if (!verify || before.viewport.width < 1201) return;
  for (const [selector,box] of Object.entries(before.anchors)) {
    const next = after.anchors[selector];
    assert.ok(next, `${label}: missing anchor ${selector}`);
    for (const key of ["x", "y", "width", "height"]) {
      assert.ok(Math.abs(next[key] - box[key]) <= 1, `${label}: ${selector}.${key} moved ${box[key]} -> ${next[key]}`);
    }
  }
  for (const [index,box] of before.navigation.entries()) {
    const next = after.navigation[index];
    assert.ok(next && next.id === box.id && Math.abs(next.x - box.x) <= 1 && Math.abs(next.width - box.width) <= 1, `${label}: navigation moved`);
  }
}

async function interactions(page, section, initial) {
  const main = page.locator("main.workspace:visible");
  if (section === "overview") {
    await main.locator(".desk-priority select").selectOption("latest");
    stable(initial, await snapshot(page, section, "sorted"), "priority sort");
    await main.locator(".desk-priority select").selectOption("own");
    stable(initial, await snapshot(page, section, "own"), "priority empty or shorter list");
    await main.locator(".desk-priority select").selectOption("risk");
    await main.getByRole("button", {name:"Slack 발송 이력 열기", exact:true}).click();
    stable(initial, await snapshot(page, section, "dialog"), "Slack dialog");
    await page.keyboard.press("Escape");
  }
  if (section === "monitoring") {
    await main.getByRole("button", {name:"조회 날짜 변경", exact:true}).click();
    stable(initial, await snapshot(page, section, "date-open"), "date popover");
    await page.keyboard.press("Escape");
    assert.equal(await main.getByRole("button", {name:"조회 날짜 변경", exact:true}).getAttribute("aria-expanded"), "false");
    const search = main.getByRole("textbox", {name:"검색어", exact:true});
    await search.fill("qa-no-matching-headline-20261125");
    await main.getByRole("button", {name:"조회/검색",exact:true}).click();
    stable(initial, await snapshot(page, section, "search"), "search results");
    await main.getByRole("button", {name:"검색 초기화",exact:true}).click();
    assert.equal(await search.inputValue(), "");
    stable(initial, await snapshot(page, section, "reset"), "search reset");
    const detail = main.locator(".monitor-expand button").first();
    if (await detail.count()) {
      await detail.click();
      stable(initial, await snapshot(page, section, "expanded"), "article detail");
      await detail.click();
    }
    await main.getByRole("combobox",{name:"페이지당 기사 수",exact:true}).selectOption("50");
    stable(initial, await snapshot(page, section, "page-size"), "page size");
  }
  if (section === "media") {
    await main.getByRole("tab",{name:"언론사별 보도량",exact:true}).click();
    stable(initial, await snapshot(page, section, "publishers"), "media tab");
    await main.getByRole("tab",{name:"주요 키워드",exact:true}).click();
    await main.getByRole("button",{name:"30일",exact:true}).click();
    stable(initial, await snapshot(page, section, "30-days"), "media range");
    await main.getByRole("button",{name:"7일",exact:true}).click();
  }
  if (section === "clipping") {
    await main.getByRole("tab",{name:"당사",exact:true}).click();
    stable(initial, await snapshot(page, section, "own"), "clipping filter");
    await main.getByRole("tab",{name:"전체",exact:true}).click();
    const evidence = main.getByRole("button",{name:"선정 근거",exact:true}).first();
    if (await evidence.count()) {
      await evidence.click();
      stable(initial, await snapshot(page, section, "evidence"), "clipping dialog");
      await page.keyboard.press("Escape");
    }
  }
  if (section === "reports") {
    for (const period of ["주간", "월간", "일간"]) {
      await main.getByRole("button",{name:period,exact:true}).click();
      stable(initial, await snapshot(page, section, period), `report ${period}`);
    }
    await main.getByRole("tab",{name:"언론사 보도량",exact:true}).click();
    stable(initial, await snapshot(page, section, "publishers"), "report breakdown");
  }
}

await fs.mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
try {
  for (const [width,height] of [[1280,720],[1366,768],[1440,900],[1600,900],[1920,1080],[1024,768],[390,844]]) {
    const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1,colorScheme:"dark"});
    await context.addInitScript(() => { localStorage.setItem("incar-dashboard-theme", "dim"); });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base, {waitUntil:"domcontentloaded"});
    await page.locator(".desk-story-grid h3").first().waitFor();
    for (const section of sections) {
      if (width < 1241 && section === "reports") continue;
      await page.locator(`.newsroom-navigation [data-section="${section}"]`).click();
      await page.locator(`.app-shell[data-active-section="${section}"] main.workspace:visible h1`).waitFor();
      try {
        const initial = await snapshot(page, section, "initial");
        if (width === 1440 || width === 1280) await interactions(page, section, initial);
        assert.deepEqual(errors, []);
        assert.equal(await page.getByRole("button",{name:/모드로 전환/}).count(), 0);
        console.log(`PASS ${width}x${height} ${section}`);
      } catch(error) {
        failures.push({width,height,section,error:error.message});
        console.error(`FAIL ${width} ${section}: ${error.message}`);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(out,"summary.json"), JSON.stringify({results,failures},null,2));
}
assert.deepEqual(failures, []);
