# Newsroom Design QA - 2026-11-25

final result: passed

## Current Target

- Selected first newsroom concept and the eight matching category samples from November 24, not the earlier September design.
- Source root: `C:/Users/User/.codex/generated_images/019e1489-9221-76e2-9cd8-a29490d3d5bf/`.
- Dashboard: `exec-33cb8538-fadb-4f52-a6e7-2fd6fa57ddb1.png`.
- Monitoring: `exec-86a2ecc8-ab3f-4a36-ae78-e2857546ba51.png`.
- Media: `exec-6f1f199d-1a5d-480a-abc0-0b0d53ff42a4.png`.
- Regulators: `exec-498d5203-fc28-4db9-9568-1ffd8699fab8.png`.
- Clipping: `exec-6673751a-40ff-425e-9654-0107cfdebfc3.png`.
- Scraps: `exec-52e35d01-ee63-439e-bc1b-d5f742154004.png`.
- Reports: `exec-ee9cbf64-37b7-4d7d-a2ed-8d9a65c648bf.png`.
- Stocks: `exec-8031b064-f331-4147-9a15-cfd068f903fe.png`.
- Management: `exec-0d863226-83f1-47ec-9a08-f2f8257363a3.png`.
- Implementation: `http://127.0.0.1:4186/` in background Chrome through user-approved Playwright.
- Evidence root: `C:/Users/User/Desktop/COWORK/news-monitor-newsroom/.qa/newsroom-final/`.
- Source and implementation are composited together in `compare-{section}.png`, not reviewed as unrelated separate images.
- Comparison viewport 1440 x 1024 CSS pixels, device scale factor 1. Sources approximately 1488 x 1056 pixels are proportionally normalized to 1440 x 1024 without cropping; each comparison is 2880 x 1024.
- Additional actual viewport captures: 1280 x 720, 1366 x 768, 1672 x 941, 900 x 1180, 390 x 844. The broad responsive suite uses mobile scale factor 2; the focused mobile suite uses scale factor 1.
- State: light theme, actual public read-only operational data. November 25 counts and headlines intentionally differ from the November 24 illustrative source. No illustrative articles or success states are copied into production.

## Findings And Fix History

1. [P1, fixed] November 24 implementation used a fallback font and substantially smaller titles, headlines and controls. Bundled Pretendard Variable 1.3.9 with its OFL license; explicit family/weights replace platform-dependent fallback. Browser checks confirm loaded WOFF2 resources and Chrome reports the actual custom platform font as `Pretendard Variable` at all three additional desktop widths.
2. [P1, fixed] Dashboard lead and navigation proportions diverged from the selected image. Matched the horizontal masthead, inline date/KPIs, five-story editorial grid, operating strip and four separate trend charts. Restored readable 48px lead, 24px secondary titles, and fixed-height 150px plotting surfaces instead of squeezing charts to fill a viewport.
3. [P2, fixed] Monitoring publisher column removal left a zero-width action column. Removed the obsolete column from both the table and colgroup, adjusted detail colspan/mobile tracks, and added browser assertions for non-overlapping action columns. Publisher remains below each full headline.
4. [P2, fixed] Media date tools occupied a separate row; keyword labels were too small. Consolidated the command row, enlarged actual bars/labels, made CSV download functional, and retained keyword/publisher tabs and range constraints.
5. [P2, fixed] Regulator headings and summary blocks pushed the release list down. Moved selection into the toolbar, compacted classification counts to one band and corrected fixed table widths. Existing filters and source links remain available.
6. [P2, fixed] Clipping, scraps and management text did not match the sample hierarchy. Enlarged titles and table text, aligned work areas, added matching local category/search/sort controls, and kept saved articles, evidence disclosures and management tabs intact. Management page size defaults to six and still supports 20/50 rows.
7. [P2, fixed] Stock supplementary statistics preceded and displaced the main chart. Moved quotes into a compact top band, chart/market facts into the primary row and returns/disclosures below. Existing custom periods, detailed statistics, indices and peer tables remain accessible.
8. [P2, fixed] Mobile navigation buttons shrank into overlapping text. Disabled item shrinking; the navigation strip scrolls independently while the page retains zero horizontal overflow.
9. [P2, fixed] Print-only publisher bars made the report rail disproportionately tall. Added dedicated print typography, compact two-column publisher rows and bounded chart height. Short report category labels avoid broken policy labels; already-bracketed publisher names are not duplicated.
10. [P2, fixed] Additional management-tab review found a mobile keyword ledger exceeding page width by 118px and advertising charts missing explicit plotting height after legacy CSS replacement. Added bounded table scrolling, responsive editor/rule grids and 240px chart surfaces. Post-fix `management-tabs.json` verifies all 12 desktop/mobile subviews with zero page overflow/errors; `management-ads-1440.png` visibly contains all three charts. The reusable browser suite now asserts secondary-tab overflow and chart height.
11. [P2, fixed] Report category bars inherited positional colors when categories were absent. They now reuse the dashboard's semantic category series colors; unit coverage and the final report/print recaptures verify that insurer and policy colors stay stable.
12. [P1, fixed] Supplemental modal review found that Slack history/detail had retained markup whose former panel/list CSS was removed. Both now reuse the same native dialog as risk/category details, with bounded surfaces, four-column delivery rows on desktop, compact two-line rows on mobile and readable formatted detail titles. Added browser checks for bounds, contained focus, Escape closing only the topmost detail and returning to the parent history without navigating away.

Post-fix evidence: `desktop-{section}.png`, `compare-{section}.png`, `focus-overview.png`, `focus-monitoring.png`, `focus-reports.png`, `mobile-{section}.png`, `desktop-1280.png`, `desktop-1366.png`, `desktop-1672.png`, `report-print.png`.

## Required Fidelity Surfaces

- Fonts/typography: actual self-hosted font loading verified, fixed pixel sizes, 0 letter spacing, no viewport-scaled fonts or CSS headline ellipsis. Existing ellipses already present in stored headlines remain factual source content.
- Spacing/layout rhythm: common 30px desktop page margins, black section rules, aligned toolbar controls, 12-column editorial story composition and stable chart heights. Longer real data may make a page scroll rather than shrink its text or plot.
- Colors/tokens: cool near-white paper, black ink, gray hairlines and restrained citron selections. Semantic positive/caution/negative states remain distinct; unknown or generated reports are not painted as sent.
- Assets: existing official Incar and Slack bitmap assets, existing Lucide icons; no generated screenshot or mock is used as an application background.
- Copy/content: actual operational data and article URLs remain in use. Simplified display labels do not write back classifications. Read-only scraps are empty in the actual test session; the mock's saved articles are not fabricated.

## Verification

- Frontend unit suite: 180 tests passed, including delivery labels for alerts, daily/weekly/monthly reports and unchanged custom labels.
- Python release regression suite: 380 tests passed after the two deployment guards; mocked tests only, no production writes or sends.
- Reference validation: 32 modules, zero unresolved or invalid local references.
- Production Vite build: passed, screen chunks retained and no oversized-JS-chunk warning.
- Repeated navigation/interaction suite: 26 captures across two desktop rounds and one mobile round. Search/reset, selected CSV, media CSV/ranges/tabs, article URLs, chart hover/focus/arrows, all report periods/month selector, delayed print command, stock periods/modes and six management tabs checked.
- Broad responsive suite: 27 cases across desktop/tablet/mobile, all passed with no page-level horizontal overflow or runtime exceptions. Independent overflow is intentional for the mobile navigation and wide financial/registry tables.
- Extra desktop checks: three viewport widths, no page overflow, custom font actually rendered, chart plotting height at least 140px.
- Management secondary views: 12 additional desktop/mobile captures, all six tabs, no page overflow or runtime errors. Advertising charts have three nonzero plotting surfaces; keyword editor and ledger remain inside the page.
- No login, collector dispatch, classification save, scrap save, paid analysis or Slack send was performed during browser verification.
- Final targeted recapture reviewed: monitoring bookmark/external/detail actions occupy separate columns, report category labels remain on one line, publisher prefixes are not duplicated, and print-only rail fits beside the five article rows. No actionable P0/P1/P2 visual findings remain in the reviewed states.
- Deployment verification is recorded separately after publication; passing this local visual gate does not by itself claim successful deployment.

## Deployment Follow-Through

- Initial redesign commit `3b47016`: Publish Dashboard run `45511708014` succeeded.
- Supplemental layout commit `b5ddd77`: build/tests/static generation and artifact upload succeeded in run `45513127157`; the final deploy step failed to discover the artifact immediately after upload. REST confirms artifact `14977031915` exists and is not expired. This is not a frontend build failure or an expired credential diagnosis.
- Moved only the dashboard Pages deploy step into a dependent job, following the documented separate-job pattern and the same-job artifact visibility issue tracked at https://github.com/actions/deploy-pages/issues/451. Build environment configuration, serialized Pages concurrency, data/report generation and notification workflows are unchanged. A failed deploy job can now be retried without re-uploading a duplicate artifact.
- Added regression checks for upload/deploy dependency, bounded deploy runtime, retained environment configuration and preserved concurrency.
- Deployment fix `98ee5280`: run https://github.com/incarmarketing/news-monitor/actions/runs/45514750839 succeeded with separate `publish` and `deploy` jobs. Supplemental dialog fix `fb60427f`: run https://github.com/incarmarketing/news-monitor/actions/runs/45516721240 also succeeded.
- Production verification URL: https://incarmarketing.github.io/news-monitor/dashboard.html?v=fb60427f. Served assets confirmed as `index-B87tCjKS.js` and `index-MSARdSEl.css`; publication was verified, not inferred from a local build.
- Live interaction suite: 26 captures, two desktop navigation rounds and one mobile round, all passed. Includes search/reset, CSV, chart hover/focus/arrows, article links, all report periods/print command, stock modes, six management tabs and risk/category/Slack dialogs. Focus stays in the native dialog, Escape closes only the topmost delivery detail and leaves the history open.
- Live responsive suite: 27 direct-route cases across 1440px desktop, 900px tablet and 390px mobile passed, with zero page overflow and no runtime exceptions. Mobile report routing follows the existing intentional restriction.
- Live additional widths 1280/1366/1672: zero overflow and CDP confirms the custom `Pretendard Variable` platform font is actually rendered. Final report and browser print rendering reviewed.
- Final production evidence: `.qa/newsroom-live/`, `.qa/newsroom-live-responsive/`; latest delivery-history captures use human-readable alert/daily/weekly labels without internal hashes. No browser test dispatched collection, logged in, saved classifications or sent notifications.

## Scope And Residual Notes

- This change does not repair the earlier 13:00 briefing deployment/authentication incident or change collection, classification, risk scoring, polling or scheduling.
- Report-run totals and currently loaded article subsets may differ in existing data; this visual change does not invent missing category counts. The report rail explicitly labels its displayed category sum.
- Known data-quality follow-up, not a passed numerical assertion: live header article totals and the latest category-flow total can differ. They still use the existing composed period/report summary and seven-day context/history aggregation paths respectively. Numerical reconciliation and company-mention classification were not changed as part of this design release; no claim is made that those data-basis differences are fixed.
- P3: exact glyph shapes can differ slightly from the image-generated sample. Long real headlines and empty/private workspaces cannot reproduce the mock's illustrative text density without fabricating content.
- Authenticated saves, analysis execution and OS printer dialog were intentionally not exercised; print CSS was browser-rendered and the print command was intercepted only in the isolated test page.

---

# Historical Monitoring Ledger QA - 2026-09-10

Historical result: passed (superseded by the current newsroom review above).

## Selected Source And Comparison

- Selected direction: monitoring option 1, a full-width article table.
- Reference: C:/Users/User/.codex/generated_images/019e1489-9221-76e2-9cd8-a29490d3d5bf/exec-0a96d51f-47c6-46e9-bcfc-577d78b31a34.png
- Reference raster: 1672 x 941, normalized proportionally to the intended 1280 x 720 CSS viewport.
- Preview: http://127.0.0.1:5198/?section=monitoring
- Capture folder: C:/Users/User/Desktop/COWORK/news-monitor-publisher-fix/out/monitoring-ledger/
- Combined reference/implementation comparison: comparison.png. Focused table comparison: table-comparison.png.
- Native captures: desktop-1280.png, desktop-1672.png, mobile-390.png and detail-1280.png.
- Checked the combined images, not just separate screenshots. Actual saved articles replace the mock's illustrative titles/counts. Existing official logo and read-only identity remain unchanged.

## Iteration And Fidelity

- First render had 6px table overflow caused by action-cell padding; removed that padding. Final desktop horizontal overflow is zero.
- At 1280 x 720, reduced table/header/footer spacing until all ten default rows fit. Document size equals viewport, no vertical or horizontal overflow. Full longer headlines still wrap; expanded details and larger page sizes intentionally scroll within the table.
- Mobile tabs initially shrank into one another; fixed their flex sizing. At 390 x 844 the category strip scrolls independently, document has no horizontal overflow and headlines are not clipped.
- Widened the page-size selector after visual review found the final character clipped.
- Direct date input could retain a stale controlled value with input-only browser events. Both input and change events now update the date. Verified 2026-09-10 to 2026-09-09 applies as 2026-09-09 to 2026-09-10 and returns 148 stored articles.
- Layout: compact heading, search/reset/export row, period/tone/publisher row, category tabs and one article table. No additional dashboard hero or nested cards.
- Typography: fixed 28px heading and 15px headlines, 14px table text; no viewport-scaled type, negative spacing or CSS headline ellipsis. Actual upstream ellipses are preserved.
- Color: existing desk tokens, white surfaces, restrained blue selected controls and semantic tone badges. Existing low-glare theme remains available through the dashboard.
- Assets: official existing Incar bitmap and Lucide icons, no recreated brand drawings.
- Content differences: publication time labeled accurately instead of the mock's collection time; actual additional categories remain visible. Existing source-based related groups remain available under the retained related sort.
- Final combined comparison: no remaining actionable P0/P1/P2 layout differences. Deliberate production-data and retained-function differences are listed above.

## Functional Evidence

- Search with zero results and reset: restores default dates, latest sort, cleared query/category/tone/source/focus/selection and ten first-page rows.
- Category selection resets pagination; publisher filter returned only its three stored articles. 50-row page selection displays 50 rows; ten-row reset/default verified.
- Seven-day period loads the existing range API without collector dispatch. Custom reverse date range normalized correctly.
- Related sort uses existing grouping. Five-member group expands to five actual related links; single-article rows have no false grouped disclosure.
- First-row detail and correction editor open inline. Direct headline and external-icon URLs preserve the existing external link handler.
- Page checkbox selects ten rows, selected CSV command runs. CSV helper tests verify UTF-8 BOM, quotes, newlines, source-suffix cleanup, safe URLs and spreadsheet formula escaping.
- Dashboard direct-company KPI reported 17; linked monitoring scope also returned 17. Reset removes the scope.
- Authenticated scrap/correction persistence was not executed: verification used read-only state and did not modify real classifications or scraps.
- No collection dispatches, Slack sends, DB migrations or new polling were introduced.
- Frontend: 169 tests. API: 20 tests. Python release suite: 332 tests. Build and reference validation passed.
- Updated tools/verify-monitoring-layout.mjs for the new selectors; browser verification used the existing hidden CUA browser rather than launching its standalone Playwright CLI.

## Cleanup Boundary

- Removed superseded monitoring-filter-card, monitoring-filter-actions, monitoring-layout and monitoring-workspace feed overrides from styles.css.
- Current monitoring presentation lives only in MonitoringWorkbench.jsx and monitoring-workbench.css.
- Kept shared ArticleFeed, summary, decision, correction, related-article and scrap components because other categories still use them.
- Preserved warm-mounted route visibility, existing data cache, classification rules and collection/sending schedule.

---

# Historical Dashboard Workbench QA - 2026-09-10

Historical result: passed (superseded by the current newsroom review above).

## Visual Sources

- Source: C:/Users/User/.codex/generated_images/019e1489-9221-76e2-9cd8-a29490d3d5bf/exec-778aa2a8-4fb1-4582-8b05-9aa9cd920eac.png
- Selected direction: third dashboard proposal, analysis above a full-width priority table.
- Reference raster: 1672 x 941; intended CSS viewport: 1280 x 720. Normalized proportionally to 1280 x 720, not used as a background asset.
- Implementation: http://127.0.0.1:5198/?section=overview
- Screenshot: C:/Users/User/Desktop/COWORK/news-monitor-publisher-fix/out/dashboard-workbench/desktop-final-1280.png
- Combined comparison: C:/Users/User/Desktop/COWORK/news-monitor-publisher-fix/out/dashboard-workbench/comparison.png
- CSS viewport: 1280 x 720, devicePixelRatio 1. Additional responsive checks: 1672 x 941 and 390 x 844.
- State: light theme, actual saved operational data, read-only/no login. Mock article counts in the design are not copied into production.

## Comparison History

1. First render: header status wrapped awkwardly; publication times were absent from summary rows; mobile search icon shrank. Classified P2, result blocked.
2. Kept status/time tokens together, used exact-URL article records to restore display titles/timestamps without replacing classification or sorting, removed mobile search flex gap. Recaptured and compared against the source. No remaining actionable P0/P1/P2 differences.
3. In-app advanced screenshot after a viewport override returned a scaled/cropped image. This was a capture artifact, not layout overflow. Replaced it with the native CUA screenshot after the compositor updated. DOM bounds confirmed the expected viewport and zero horizontal overflow.

## Required Fidelity Surfaces

- Typography: fixed pixel sizes, no viewport-scaled text; Korean system sans fallback; readable full titles with wrapping rather than CSS ellipsis. Main title 25px, section headings 16px, article titles 13px/14px mobile. Preserved real source headlines, including ellipses already stored upstream.
- Layout: white navigation and KPI band, single-line desktop operations strip, shared chart/distribution surface, full-width five-row issue table. Desktop document height equals viewport height at 1280 x 720 and 1672 x 941. Mobile deliberately scrolls; chart retains a 190px plotting region.
- Colors: chart/distribution use the same four series tokens. Warning and unknown statuses are not painted as successful. Low-glare theme retained.
- Assets: existing official blue Incar signature bitmap and Slack bitmap, existing Lucide icons. The official signature contains company text unlike the generated mock logo; this is an intentional brand-asset correction, not a substituted drawing.
- Content: actual data replaces illustrative numbers. Read-only login identity, unknown operational states, theme toggle, risk-history dialog and day-over-day detail remain available. These retained functional elements account for small differences from the mock.
- Focused checks: header alignment, KPI values, source/time columns, mobile search icon and two-line headlines inspected at native screenshot size. Full comparison alone was not used for typography acceptance.

## Functional Verification

- Sidebar: overview, monitoring, media analysis, regulators, clipping, scraps, reports, stocks, management render nonempty views.
- Monitoring: nonexistent search returns zero rows; reset restores 20 visible rows. Publisher metadata and headline source cleanup remain intact.
- Priority sort remains on overview; own-only filtering retains direct-mention evidence behavior.
- Risk KPI opens the risk chart dialog. Slack opens the existing delivery-history dialog on overview, not management.
- Article links retain direct external navigation and noopener/noreferrer.
- Browser console: no JavaScript errors in checked views. A development media-analysis first load temporarily delayed one automation click; the view completed and subsequent navigation succeeded. This is not a claim that all historical media-analysis latency has been eliminated.
- Build and reference validation: passed (28 modules).
- Frontend tests: 162 passed. API tests: 20 passed. Python regression tests: 363 passed.
- Production smoke check: new stylesheet and layout loaded, live data recovered from the saved initial snapshot, no console errors or document overflow at 1280x720.
- Follow-up display guard: date-only articles show an unknown publication time rather than the midnight fallback used for sorting. Explicit midnight timestamps remain supported.
- No collection dispatches, Slack sends, classification writes, DB migrations or paid API calls were performed during UI QA.

## Cleanup Boundary

- Removed dashboard v3/v4/v5/v6 rules and deleted dashboard-option1.css.
- Removed eight unreferenced legacy visual components plus replaced old layout components.
- Kept active clipping styles under clipping-candidate-*; management CRM styles and unrelated feature/report styles remain.
- New dashboard and navigation definitions live in dashboard-workbench.css. Visibility selectors retain the warm-mounted overview/monitoring performance contract.
- Combined styles.css + dashboard stylesheet source size: 407224 to 259340 bytes (36.3% reduction). This measures source footprint, not measured network latency.

## Residual Scope

- Stock collection was empty in the local data snapshot; verified its existing empty state, not live market collection.
- Backend operational statuses reflect the provided stored data; this redesign does not repair upstream service incidents.
- Monitoring direction was selected subsequently and implemented; see the current monitoring QA above.
