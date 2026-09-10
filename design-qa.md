# Monitoring Ledger QA - 2026-09-10

final result: passed

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

final result: passed

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
