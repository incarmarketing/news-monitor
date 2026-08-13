# Dashboard Design QA

- Selected visual truth: `design-references/dashboard-option-1-20260813.png`
- Desktop implementation: `design-qa-dashboard-desktop-v5.png`
- Mobile implementation: `design-qa-dashboard-mobile-v5.png`
- Desktop viewport: `1550 x 1024`
- Mobile viewport: `390 x 844`

## Visual Comparison

- [x] Option 1's editorial hierarchy is preserved: compact masthead, dark KPI rail, ranked issue desk, and restrained operations column.
- [x] The sidebar remains the only large dark surface; content panels use white and neutral gray for long-session readability.
- [x] The lead issue and its seven-day momentum share one visual region.
- [x] Follow-up issue rows remain dense and scannable without nested cards.
- [x] Desktop fits the primary operational view without horizontal overflow.
- [x] Mobile switches to an app-style top navigation, stacks the lead issue and operations rail, and has no page-level horizontal overflow.
- [x] The issue board no longer collapses into an 11px column below 860px.

## Interaction And Performance

- [x] Monitoring search accepts a query and `초기화` clears it back to an empty value.
- [x] Dashboard and monitoring routes render nonblank content.
- [x] Navigation changes the active screen immediately while optional feature code preloads in the background.
- [x] Dashboard calculations use the 14-day core profile capped at 2,000 rows and a final 500-row visual context.
- [x] Monitoring uses the core profile for current data and requests a bounded period only when an older date range is selected.
- [x] History, engagement, management, stock, and chart data load only for the screens that need them.
- [x] Recharts is isolated from the initial entry bundle and loaded through a separate chart chunk.
- [x] Returning to the dashboard reuses the prepared core profile instead of rebuilding it from the history profile.
- [x] Production build completed successfully.

## Resolved Findings

- P0: None.
- P1: The deployed screen still used the previous compact dashboard structure. The selected Option 1 structure is now implemented in the source that the Pages workflow builds.
- P1: Route changes previously waited for lazy imports and the monitoring route requested the history profile. The screen now switches first and current monitoring uses the core profile.
- P1: Monitoring filters previously reapplied deep-link state after reset. Preset state is consumed once and reset remains authoritative.
- P2: Initial JavaScript included chart dependencies and full operational tables. Feature chunks and data profiles now load progressively.

## Follow-up

- P3: The stylesheet still contains legacy selectors used by secondary screens. Removing them requires a separate route-by-route visual regression pass and is intentionally excluded from this low-risk release.

Final result: passed.
