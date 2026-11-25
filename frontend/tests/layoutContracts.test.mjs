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
  const controlCss = fs.readFileSync(new URL("../src/app-select.css", import.meta.url), "utf8");
  assert.match(controlCss, /right: var\(--select-chevron-inset\)/);
  const control = fs.readFileSync(new URL("../src/AppSelect.jsx", import.meta.url), "utf8");
  assert.match(control, /ChevronDown/);
  assert.match(control, /Select\.Portal/);
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
  assert.match(shared, /--control-radius: 6px/);
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

test("every application select uses the shared accessible control", () => {
  const files = fs.readdirSync(new URL("../src/", import.meta.url)).filter(file => file.endsWith(".jsx"));
  for (const file of files) assert.doesNotMatch(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), /<select\b/, `${file} retains a platform-styled dropdown`);
  const shared = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(shared, /outline: 2px solid var\(--focus-ring\)/);
  assert.doesNotMatch(shared, /:focus-visible[^}]*outline: 2px solid var\(--blue\)/);
});

test("publisher is a column before the headline, never a headline subline", () => {
  const source = fs.readFileSync(new URL("../src/MonitoringWorkbench.jsx", import.meta.url), "utf8");
  assert.match(source, /monitor-publisher-column">언론사/);
  assert.ok(source.indexOf('className="monitor-publisher"') < source.indexOf('className="monitor-headline"'));
  assert.doesNotMatch(source, /<small>\{resolvePublisher/);
  assert.match(source, /colSpan=\{9\}/);
});

test("media uses structural skeletons and has no observation commentary", () => {
  const source = fs.readFileSync(new URL("../src/MediaAnalysis.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /MediaSkeleton kind="trend"/);
  assert.match(source, /MediaSkeleton kind="keywords"/);
  assert.match(source, /MediaSkeleton kind="publishers"/);
  assert.match(source, /MediaSkeleton kind="issues"/);
  assert.doesNotMatch(source, /관찰 코멘트|buildPeriodObservations|<InsightList|media-observations/);
  assert.doesNotMatch(main, /buildPeriodObservations|InsightList/);
  assert.doesNotMatch(source, /className="media-trend-message" role="status"/);
  const css = fs.readFileSync(new URL("../src/media-skeleton.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("media column divider shares the four-plot grid and keeps a stable detail scroller", () => {
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../src/MediaAnalysis.jsx", import.meta.url), "utf8");
  assert.match(css, /\.media-intel-board \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.media-intel-board > \.media-issues \{[^}]*grid-column: 3 \/ 5;[^}]*border-left:/);
  assert.match(css, /\.tone-small-multiples \{[^}]*gap: var\(--media-column-gap, 16px\)/);
  assert.match(source, /className="media-keyword-content"[^>]*role="tabpanel"/);
  assert.doesNotMatch(source, /<Panel title="언론사별 보도량"/);
});

test("media drilldown keeps its complete period and read cache instead of falling back to today", () => {
  const source = fs.readFileSync(new URL("../src/MediaAnalysis.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /startDate: effectiveRange.start, endDate: effectiveRange.end/);
  assert.match(source, /mediaScope: true, rangeRevision: revision/);
  assert.match(source, /openPeriodMonitoring\(\{ query:/);
  assert.match(main, /await loadMediaArticleRange\(\{ startDate, endDate, revision \}\)/);
  assert.match(main, /focusPreset\?\.mediaScope && !isUsableArticle\(article\)/);
  assert.match(main, /if \(request === monitoringRangeRequest.current\) setMonitoringRangeArticles/);
});

test("publisher rows fill their grid and clipping articles have no oversized lead treatment", () => {
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(css, /\.press-row \{ width: 100%;[^}]*border: 0;/);
  assert.match(css, /\.press-table-head, \.press-row \{[^}]*grid-template-columns: var\(--press-columns\)/);
  assert.match(main, /className="clipping-rank"/);
  assert.match(main, /className="clipping-content"/);
  assert.doesNotMatch(css, /\.clipping-candidate-card:(first-child|nth-child)/);
  assert.doesNotMatch(main, /index === 0 \|\| index > 2/);
});
