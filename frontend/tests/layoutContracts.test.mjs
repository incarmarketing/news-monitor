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

test("refresh-sensitive chrome reserves its footprint before fonts and status data arrive", () => {
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const home = fs.readFileSync(new URL("../src/dashboard-workbench.css", import.meta.url), "utf8");
  assert.match(css, /\.newsroom-navigation button \{[^}]*width: calc\(var\(--nav-label-length\) \* 1em\)/);
  assert.match(home, /\.desk-operations \{ display: grid;[^}]*grid-template-columns:/);
  assert.match(home, /\.editorial-kpi-strip b \{[^}]*width: 48px; height: 32px/);
  assert.match(home, /\.desk-slots > span \{ display: grid; grid-template-columns: 24px 44px minmax\(0, 1fr\)/);
  assert.match(home, /\.desk-operations-title \{[^}]*white-space: nowrap/);
  assert.match(css, /\.scrap-actions-v2 \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("registry loading keeps table columns and rows instead of a short empty paragraph", () => {
  const source = fs.readFileSync(new URL("../src/MediaRegistry.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/mediaRegistry.css", import.meta.url), "utf8");
  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(source, /<colgroup>/);
  assert.match(source, /registry-skeleton-row/);
  assert.match(css, /table\.registry-table \{ table-layout:fixed/);
  assert.match(css, /\.registry-table tbody td \{ height:80px/);
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
  assert.match(registry, /\.registry-table td:nth-child\(3\)/);
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
  const issues = fs.readFileSync(new URL("../src/MediaIssueDigest.jsx", import.meta.url), "utf8");
  assert.match(issues, /MediaSkeleton kind="issues"/);
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
  assert.match(css, /\.press-row \{ width: 100%;/);
  assert.match(main, /className="media-keyword-bars press-list"/);
  assert.match(css, /\.media-keyword-bars > button > span \{ height: 24px;/);
  assert.doesNotMatch(css, /press-table-head|press-name|press-negative|--press-columns/);
  assert.match(main, /className="clipping-rank"/);
  assert.match(main, /className="clipping-content"/);
  assert.doesNotMatch(css, /\.clipping-candidate-card:(first-child|nth-child)/);
  assert.doesNotMatch(main, /index === 0 \|\| index > 2/);
});

test("management removes repeated category headings but retains section scope and controls", () => {
  const management = fs.readFileSync(new URL("../src/Management.jsx", import.meta.url), "utf8");
  const registry = fs.readFileSync(new URL("../src/MediaRegistry.jsx", import.meta.url), "utf8");
  const audit = fs.readFileSync(new URL("../src/ClassificationMaintenance.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  for (const name of ["언론사 관리", "기자 관리", "광고비 관리"]) assert.ok(management.includes(`title="${name}" hideTitle`));
  assert.doesNotMatch(registry, /registry-section-heading"><h2>/);
  assert.match(registry, /aria-label=\{reportersOnly \? "기자 관리 보기"/);
  assert.doesNotMatch(audit, /<h2>/);
  assert.match(audit, /aria-label="분류 점검"/);
  assert.match(audit, /\["admin", "editor"\]\.includes\(getStoredSession\(\)\?\.role\)/);
  assert.match(main, /aria-label=\{hideTitle \? title : undefined\}/);
  assert.match(main, /className="panel-meta-only">\{meta\}/);
});

test("regulator counts include an equal-width All tile instead of a separate heading", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const panel = main.slice(main.indexOf("function RegulatorDirectionPanel("), main.indexOf("function RegulatorReleaseFeed("));
  const css = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(panel, /data-category="all"/);
  assert.match(panel, /<span>전체<\/span><b>\{rows.length.toLocaleString/);
  assert.doesNotMatch(panel, /<h2>|건 기준|regulator-facet-meta/);
  assert.match(css, /\.regulator-theme-grid \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /regulator-facet-meta|regulator-keyword-summary|regulator-keyword-board/);
});

test("home publishes only finalized issue rankings, never a differently ranked bootstrap list", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const dashboard = fs.readFileSync(new URL("../src/DashboardWorkbench.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(main, /buildDashboardBootstrapData|buildDashboardBootstrapIssues/);
  assert.match(main, /loading=\{!dashboardSnapshot.ready\}/);
  assert.match(main, /data: nextData, ready: true/);
  assert.match(dashboard, /aria-busy=\{loading\}/);
  assert.match(dashboard, /desk-story-skeleton/);
  assert.match(dashboard, /!loading && !rows.length/);
});

test("monitoring sorting is grouped with tone and publisher, not isolated below results", () => {
  const source = fs.readFileSync(new URL("../src/MonitoringWorkbench.jsx", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/monitoring-workbench.css", import.meta.url), "utf8");
  const filter = source.slice(source.indexOf('<section className="monitor-filters"'), source.indexOf('<section className="monitor-results"'));
  assert.match(filter, /monitor-select-group/);
  assert.match(filter, /aria-label="논조"/);
  assert.match(filter, /aria-label="언론사"/);
  assert.match(filter, /aria-label="정렬"/);
  const results = source.slice(source.indexOf('<section className="monitor-results"'));
  assert.doesNotMatch(results, /className="monitor-sort"|aria-label="정렬"/);
  assert.match(css, /\.monitor-date-label \{ width: 280px; min-width: 280px;/);
});

test("home sorting uses concise names and keeps five story slots", () => {
  const source=fs.readFileSync(new URL('../src/DashboardWorkbench.jsx',import.meta.url),'utf8');
  for(const label of ['리스크순','최신순','당사언급순','관련기사순']) assert.ok(source.includes(`>${label}</option>`));
  assert.doesNotMatch(source,/정렬:|보기:|확산순/);
  assert.match(source,/5 - rows.length/);
  assert.match(source,/className="desk-story-empty"/);
});

test("charts measure their actual container before painting instead of guessing a first size", () => {
  const source=fs.readFileSync(new URL('../src/NewsroomChart.jsx',import.meta.url),'utf8');
  assert.match(source,/useLayoutEffect\(\(\) =>/);
  assert.match(source,/width: 0, height: 0/);
  assert.match(source,/measure\(\);\s*const observer/);
  assert.doesNotMatch(source,/compact \? 320|compact \? 160/);
});

test("report printing is separate from screen layouts and excludes other workspaces", () => {
  const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/report.css',import.meta.url),'utf8');
  assert.match(main,/matchMedia\("screen and \(max-width: 1240px\)"\)/);
  assert.match(css,/@page \{ size: A4 landscape; margin: 10mm;/);
  assert.match(css,/\.app-shell > \.workspace:not\(\.report-workspace\)/);
  assert.match(css,/html, body, #root, \.app-shell \{ min-height: 0; height: auto;/);
});

test("monitoring puts CSV beside category tabs and keeps only the update date in its title row", () => {
  const source=fs.readFileSync(new URL('../src/MonitoringWorkbench.jsx',import.meta.url),'utf8');
  const header=source.slice(source.indexOf('<header className="monitor-header"'),source.indexOf('<section className="monitor-filters"'));
  assert.match(header,/className="monitor-updated"/);
  assert.doesNotMatch(header,/<button|CSV/);
  const resultsHeader=source.slice(source.indexOf('<header className="monitor-results-header"'),source.indexOf('<div className="monitor-status-bar"'));
  assert.match(resultsHeader,/monitor-category-tabs/);
  assert.match(resultsHeader,/monitor-export/);
  assert.match(resultsHeader,/onClick=\{exportCsv\}/);
  assert.doesNotMatch(source,/RefreshCw|onRefresh|monitor-spin/);
});

test("global collection is an accessible newspaper-refresh icon without visible label text", () => {
  const source=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const header=source.slice(source.indexOf('<div className="newsroom-global-actions"'),source.indexOf('<MemoizedOverview'));
  assert.match(header,/aria-label="새 기사 수집" title="새 기사 수집"/);
  assert.match(header,/aria-busy=\{working\}/);
  assert.match(header,/<Newspaper \/><RefreshCw/);
  assert.match(header,/trigger: true, workflow: "dashboard-refresh.yml"/);
  assert.doesNotMatch(header,/>기사 수집</);
});

test("monitoring uses readable column headings and omits unknown clock placeholders", () => {
  const css=fs.readFileSync(new URL('../src/monitoring-workbench.css',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/MonitoringWorkbench.jsx',import.meta.url),'utf8');
  assert.match(css,/\.monitor-table th \{[^}]*font-size: 16px/);
  assert.match(css,/\.monitor-time time \{[^}]*align-items: center; justify-content: center;/);
  assert.match(source,/hasClock && <span className="monitor-clock">/);
  assert.match(source,/dateTime=\{publishedAt\}/);
});
