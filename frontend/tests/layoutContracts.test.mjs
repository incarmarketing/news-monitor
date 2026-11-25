import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("desktop reading workspaces fit the viewport without hiding document overflow", () => {
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(shared, /@media screen and \(min-width: 1201px\)/);
  for (const section of ["overview", "monitoring", "media", "clipping", "reports"]) {
    assert.match(shared, new RegExp(`data-active-section="${section}"`));
  }
  assert.match(shared, /grid-template-rows: var\(--app-header-height\) minmax\(0, 1fr\); height: 100dvh/);
  assert.doesNotMatch(shared, /(?:html|body)\s*\{[^}]*overflow:\s*hidden/s);
});

test("priority articles use equal editorial rows without lead highlighting", () => {
  const source = fs.readFileSync(new URL("../src/DashboardWorkbench.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/dashboard-workbench.css", import.meta.url), "utf8");
  assert.match(source, /우선 확인 기사/);
  assert.match(source, /desk-story-rank/);
  assert.match(source, /desk-story-publisher/);
  assert.doesNotMatch(source, /<mark>|desk-story-footer/);
  assert.doesNotMatch(css, /article:first-child h3|grid-column: 1 \/ 8/);
});

test("light mode is permanent and select chevrons share a fixed right inset", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setTheme|toggleTheme|onToggleTheme/);
  assert.doesNotMatch(css, /html\[data-theme=/);
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--select-chevron-inset: 14px/);
  assert.match(css, /background-position: right var\(--select-chevron-inset\) center/);
  const icon = fs.readFileSync(new URL("../src/assets/select-chevron.svg", import.meta.url), "utf8");
  assert.match(icon, /lucide-chevron-down/);
});

test("interactive states reserve space instead of moving the surrounding workspace", () => {
  const source = fs.readFileSync(new URL("../src/MonitoringWorkbench.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/monitoring-workbench.css", import.meta.url), "utf8");
  assert.match(source, /monitor-status-bar/);
  assert.match(source, /closeOnEscape/);
  assert.match(css, /\.monitor-custom-dates \{ position: absolute/);
  assert.match(css, /\.monitor-status-bar \{[^}]*min-height: 32px/);
  assert.doesNotMatch(css, /\[aria-selected="true"\] \{[^}]*font-weight/);
});

test("form controls share one visual contract across feature stylesheets", () => {
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(shared, /--control-height: 40px/);
  assert.match(shared, /--control-font-size: 16px/);
  assert.match(shared, /--control-radius: 4px/);
  for (const file of ["monitoring-workbench.css", "mediaRegistry.css", "classificationAudit.css"]) {
    const css = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    assert.match(css, /var\(--control-height\)/);
    assert.doesNotMatch(css, /select\s*\{[^}]*font-size:\s*(?:14|17|18)px/s);
  }
  const registry = fs.readFileSync(new URL("../src/mediaRegistry.css", import.meta.url), "utf8");
  assert.match(registry, /\.registry-table :is\(th,td\):nth-child\(3\)/);
  assert.doesNotMatch(registry, /\.media-registry :is\(th,td\):nth-child\(3\)/);
});

test("header has a home entry and no redundant search or inline status banner", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const data = fs.readFileSync(new URL("../src/data.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const header = main.slice(main.indexOf('<header className="newsroom-masthead">'), main.indexOf('<MemoizedOverview'));
  assert.match(data, /id: "overview", label: "홈"/);
  assert.doesNotMatch(header, /<time>|newsroom-search-action|newsroom-work-status/);
  assert.match(css, /\.work-notice \{ position: fixed/);
});

test("date popover uses equal date columns and a bottom-aligned apply action", () => {
  const css = fs.readFileSync(new URL("../src/monitoring-workbench.css", import.meta.url), "utf8");
  assert.match(css, /\.monitor-custom-dates \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto; align-items: end/);
});
