# Dashboard Workbench QA - 2026-09-10

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
- Frontend tests: 161 passed. API tests: 20 passed. Python regression tests: 363 passed.
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
- Monitoring redesign remains an image proposal until the user selects a direction.
