# Dashboard Design QA

- Selected visual truth: `design-references/dashboard-option-1-20260813.png`
- Deployed capture: `dashboard-option1-live-54b023c.png`
- Deployed build: `54b023c` / `assets/index-CWq5qhpZ.js`
- URL: `https://incarmarketing.github.io/news-monitor/dashboard.html`
- Current in-app viewport: `1265 x 760`

## Visual Comparison

- [x] Option 1's hierarchy is preserved: centered INCAR sidebar brand, compact masthead, dark KPI rail, ranked issue desk, and operations column.
- [x] The sidebar remains the only large dark surface; content panels use white and neutral gray for long-session readability.
- [x] The lead issue and its seven-day momentum share one visual region.
- [x] Follow-up issue rows remain dense and scannable without nested cards.
- [x] The verified viewport has no page-level horizontal overflow (`scrollWidth 1265`, `clientWidth 1265`).
- [x] Live operational data replaces the loading snapshot without collapsing the selected layout.
- [x] Historical dashboard experiments cannot override the selected production layout because its stylesheet is imported last.

## Interaction And Performance

- [x] Monitoring search accepts a query and `초기화` clears it back to an empty value.
- [x] Dashboard and monitoring routes render nonblank live content.
- [x] Dashboard aggregation runs outside the route-change render path.
- [x] Article and operational-status requests start concurrently.
- [x] The core profile is capped at 1,000 rows over eight days, with a final 500-row visual context.
- [x] Dashboard and monitoring remain mounted after first use so charts and filter state are not recreated on every return.
- [x] History, engagement, management, stock, and chart data remain route-scoped.
- [x] Production build completed successfully.
- [x] GitHub Pages serves the new hashed bundle.

## Resolved Findings

- P0: None.
- P1: The deployed screen used the previous compact dashboard rather than the selected Option 1. A final dashboard-only stylesheet now defines the production contract.
- P1: Returning to the dashboard rebuilt aggregation and charts. Core dashboard views now remain warm after first use.
- P1: Core article and status requests were serialized. They now run concurrently.
- P1: Monitoring reset was reported as unreliable. The deployed flow was tested with a populated search query and reset to an empty value.
- P2: The initial core profile was larger than the dashboard needs. Its default was reduced from 2,000 rows / 14 days to 1,000 rows / eight days.

## Follow-up

- P3: `styles.css` still contains legacy selectors used by secondary screens. Removing them requires a separate route-by-route visual regression pass and is intentionally excluded from this release.

Final result: passed.
