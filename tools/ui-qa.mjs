#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const screenshots = Boolean(args.screenshots);
const outDir = path.join(root, "out", "ui-qa");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const shotDir = path.join(outDir, "screenshots", stamp);

const viewports = [
  { name: "mobile-280", width: 280, height: 760 },
  { name: "mobile-320", width: 320, height: 800 },
  { name: "mobile-360", width: 360, height: 820 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const targets = [
  {
    id: "dashboard",
    file: "public/dashboard.html",
    states: ["home", "monitor", "analysis", "media", "ads", "risk", "release"],
    prepare: prepareDashboardState,
  },
  {
    id: "daily-report",
    file: "public/index.html",
    states: ["report"],
    prepare: prepareReportState,
  },
];

await fs.mkdir(outDir, { recursive: true });
if (screenshots) await fs.mkdir(shotDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  root,
  viewports,
  results: [],
  skipped: [],
};

const executablePath = findBrowserExecutable();
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});

let failures = 0;
let warnings = 0;

try {
  for (const target of targets) {
    const absoluteFile = path.join(root, target.file);
    if (!fsSync.existsSync(absoluteFile)) {
      report.skipped.push({ target: target.id, reason: `${target.file} not found` });
      console.log(`[SKIP] ${target.id} - ${target.file} not found`);
      continue;
    }

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await page.goto(pathToFileURL(absoluteFile).href, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);

      for (const state of target.states) {
        await target.prepare(page, state);
        await page.waitForTimeout(250);

        const layout = await collectLayout(page, { target: target.id, state, viewport });
        const hasFailure = layout.documentOverflow > 2 || layout.offenders.length > 0;
        if (hasFailure) failures += 1;
        if (layout.smallTargets.length > 0) warnings += 1;

        let screenshotPath = "";
        if (screenshots || hasFailure) {
          const fileName = `${target.id}-${state}-${viewport.name}.png`;
          screenshotPath = path.join(shotDir, fileName);
          await fs.mkdir(shotDir, { recursive: true });
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }

        const result = {
          target: target.id,
          state,
          viewport: viewport.name,
          width: viewport.width,
          documentOverflow: layout.documentOverflow,
          offenders: layout.offenders,
          smallTargets: layout.smallTargets,
          screenshot: screenshotPath ? path.relative(root, screenshotPath) : "",
        };
        report.results.push(result);

        const status = hasFailure ? "FAIL" : "PASS";
        const detail = `overflow=${layout.documentOverflow}px offenders=${layout.offenders.length} smallTargets=${layout.smallTargets.length}`;
        console.log(`[${status}] ${target.id}/${state}/${viewport.name} ${detail}`);
      }

      await page.close();
    }
  }
} finally {
  await browser.close();
}

const reportPath = path.join(outDir, `ui-qa-${stamp}.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log("");
console.log(`report: ${path.relative(root, reportPath)}`);
if (screenshots) console.log(`screenshots: ${path.relative(root, shotDir)}`);

if (failures > 0) {
  console.error(`UI QA failed: ${failures} layout state(s) have horizontal overflow.`);
  process.exit(1);
}

console.log(`UI QA passed. warnings=${warnings}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--screenshots") {
      parsed.screenshots = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

async function prepareDashboardState(page, state) {
  await page.evaluate((pageName) => {
    if (!window.lucide) {
      window.lucide = { createIcons: () => {} };
    }

    if (typeof window.switchPage === "function") {
      window.switchPage(pageName);
    }

    if (pageName === "monitor") {
      const search = document.getElementById("searchInput");
      if (search) {
        search.value = "AIA생명 해촉 리스크 모바일 겹침 점검용 긴 검색어";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }

      const start = document.getElementById("monitorStart");
      if (start) start.value = "2026-05-28";
      const end = document.getElementById("monitorEnd");
      if (end) end.value = "2026-05-30";

      const risk = document.getElementById("riskFilter");
      if (risk) {
        let option = Array.from(risk.options).find((item) => item.value === "mobile-overflow-risk");
        if (!option) {
          option = document.createElement("option");
          option.value = "mobile-overflow-risk";
          option.textContent = "장기계약 해촉 민원 확산 가능성 점검";
          risk.appendChild(option);
        }
        risk.value = option.value;
        risk.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, state);
}

async function prepareReportState(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

async function collectLayout(page, context) {
  return page.evaluate((ctx) => {
    function compactNodeText(value) {
      return value.replace(/\s+/g, " ").trim().slice(0, 90);
    }

    function escapeCss(value) {
      if (globalThis.CSS && typeof globalThis.CSS.escape === "function") return globalThis.CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function describeNode(el) {
      if (el.id) return `#${escapeCss(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        let part = node.tagName.toLowerCase();
        if (node.classList && node.classList.length > 0) {
          part += `.${Array.from(node.classList).slice(0, 3).map(escapeCss).join(".")}`;
        }
        const parent = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(" > ");
    }

    const viewportWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
    );
    const documentOverflow = Math.max(0, Math.round(scrollWidth - viewportWidth));
    const offenders = [];
    const smallTargets = [];
    const seen = new Set();

    const nodes = Array.from(document.body ? document.body.querySelectorAll("*") : []);
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom < -200 || rect.top > window.innerHeight + 6000) continue;

      const key = describeNode(el);
      if ((rect.left < -2 || rect.right > viewportWidth + 2) && !seen.has(key)) {
        offenders.push({
          selector: key,
          text: compactNodeText(el.textContent || ""),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
        seen.add(key);
        if (offenders.length >= 15) break;
      }

      const isInteractive = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(el.tagName)
        || el.getAttribute("role") === "button"
        || el.tabIndex >= 0;
      if (smallTargets.length < 15 && isInteractive && rect.width > 1 && rect.height > 1 && (rect.width < 32 || rect.height < 32)) {
        smallTargets.push({
          selector: key,
          text: compactNodeText(el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || ""),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    }

    return {
      ...ctx,
      viewportWidth,
      scrollWidth,
      documentOverflow,
      offenders,
      smallTargets,
    };
  }, context);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.UI_QA_BROWSER,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((candidate) => candidate && fsSync.existsSync(candidate)) || "";
}
