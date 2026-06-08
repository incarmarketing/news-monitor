import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const DEFAULT_URL = "https://your-github-id.github.io/your-repo/dashboard.html";
const baseUrl = process.env.DESIGN_QA_URL || DEFAULT_URL;
const outDir = process.env.DESIGN_QA_OUT || ".qa/design";

const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "tablet", width: 900, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
];

const sections = [
  { id: "overview", name: "dashboard" },
  { id: "monitoring", name: "monitoring" },
  { id: "regulators", name: "regulators" },
  { id: "media", name: "media-analysis" },
  { id: "reports", name: "reports" },
  { id: "risk", name: "risk-center" },
  { id: "management", name: "management" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sectionUrl(sectionId) {
  const url = new URL(baseUrl);
  url.searchParams.set("section", sectionId);
  url.searchParams.set("qa", Date.now().toString());
  return url.toString();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const doc = document.documentElement;
    const body = document.body;
    const horizontalScroll = Math.max(doc.scrollWidth, body?.scrollWidth || 0) - viewportWidth;
    const visibleElements = Array.from(document.querySelectorAll("body *")).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 1 &&
        rect.height > 1 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0";
    });

    const offscreen = visibleElements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").slice(0, 120),
          text: String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.top < viewportHeight * 3 && (item.left < -2 || item.right > viewportWidth + 2))
      .filter((item) => !/recharts-tooltip|tooltip|toast|dialog/.test(item.className))
      .slice(0, 12);

    const textOverflow = visibleElements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const text = String(element.textContent || "").trim();
        if (!text || text.length < 4) return false;
        if (["svg", "path", "canvas"].includes(element.tagName.toLowerCase())) return false;
        if (style.overflowX === "visible" && style.whiteSpace !== "nowrap") return false;
        return element.scrollWidth > element.clientWidth + 3;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className || "").slice(0, 120),
        text: String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
      .slice(0, 12);

    return {
      viewportWidth,
      scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth || 0),
      horizontalScroll,
      offscreen,
      textOverflow,
    };
  });
}

async function run() {
  await ensureDir(outDir);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = false;

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.name === "mobile" ? 2 : 1,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(45_000);

      for (const section of sections) {
        const url = sectionUrl(section.id);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
        await sleep(1200);

        const metrics = await measureLayout(page);
        const screenshotPath = path.join(outDir, `${viewport.name}-${section.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

        const status = metrics.horizontalScroll > 6 || metrics.offscreen.length ? "fail" : "ok";
        if (status === "fail") failed = true;
        results.push({
          viewport: viewport.name,
          section: section.name,
          status,
          screenshotPath,
          metrics,
        });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summaryPath = path.join(outDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), results }, null, 2));

  for (const item of results) {
    const marker = item.status === "ok" ? "OK" : "FAIL";
    console.log(`${marker} ${item.viewport}/${item.section} scroll=${item.metrics.horizontalScroll}`);
    if (item.metrics.offscreen.length) {
      console.log(JSON.stringify(item.metrics.offscreen, null, 2));
    }
  }

  if (failed) {
    console.error(`Design QA failed. See ${summaryPath} and screenshots for details.`);
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
