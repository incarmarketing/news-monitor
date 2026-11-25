# Monitoring Toolbar, Collection Icon And Publication Times QA - 2026-11-25

## Scope And Causes

- Move CSV export from the Monitoring title row to the right side of the category tabs. Leave only the update timestamp on the title row's right edge and remove the redundant Monitoring refresh action, its callback/loading-only props and retired spinner CSS. The global collection workflow and export/filter logic remain unchanged.
- Replace the global plain refresh glyph with an icon-only Lucide Newspaper plus a small RefreshCw badge. Use a stable 44px target, the existing soft accent, an accessible name/native hover title of `새 기사 수집`, and a busy-only rotation respecting reduced-motion preferences. Do not add visible Korean/English button labels, fake unread badges or idle animation. Home refresh QA follows the new accessible name.
- Increase desktop Monitoring column headings from 12px to 16px (14px on mobile) and retain centered headings. Center the date/time stack within its cell. Render no dash/clock line when publication time is unknown; keep date and time unbroken on mobile.
- Fix normalization losing a known publication timestamp when a normalized `pubDate` record is read again. Preserve the camelCase timestamp alongside the raw API timestamp fields. The real Insurance Journal 34047 record now renders its actual KST `08:10`; a date-only record still has no invented time. No publication timestamps, classifications, database records or schedules were written.

## Verification

- 222 frontend tests pass; 40 checked frontend modules have no invalid local references. Added contracts for CSV placement, single collection action, readable headings and omitted unknown clocks, plus normalized/raw publication timestamp tests.
- `.qa/monitor-toolbar-final/summary.json`: seven desktop/tablet/mobile viewports pass same-row CSV alignment, right-aligned update date, no tab-label/clock overlap, readable centered headings and stable selected-export dimensions. Selected CSV downloads correctly. The real article appears once with `08:10` and the correct `+09:00` datetime. A browser-only date-only fixture renders just the date exactly centered vertically. No JavaScript errors or write actions. Repeatable script: `frontend/scripts/monitor-toolbar-qa.mjs`.
- Native 1600px/390px Monitoring captures and the real article's timestamp were visually reviewed. `.qa/monitor-controls-navigation/` passes 26 PC/mobile route/search/reset/CSV/tooltip/report checks and five desktop Home viewport fits.
- `.qa/collection-icon-refresh/` verifies the icon still invokes exactly one mocked collection request and accepts new data, with stable Home chart dimensions and no provisional article-ranking bounce. No real collection or Slack dispatch.
- Live release `24a2f7c9` completed Publish Dashboard run `45572766526` (publish/deploy successful), with Link QA `45573504244` successful. `.qa/live-monitor-toolbar-24a2f7c9/` verifies all seven viewport sizes, selected CSV download, original article `08:10` time and correct datetime, centered date-only rendering, no inline refresh, and the icon-only collection action. `.qa/live-collection-icon-refresh-24a2f7c9/` passes cold/two cached reloads and a browser-mocked new-data refresh without changing chart dimensions. Both live checks report no JavaScript errors; no real collection/write/Slack action was performed.

---

# Chart Paint, Report Printing, Headers And Article Aliases QA - 2026-11-25

## Causes And Scope

- Production trace `.qa/home-print-before/summary.json` captured Home charts painting a guessed `320 x 160` viewBox before changing to the measured `363 x 206`. Measure in a layout effect before the first paint; do not paint a guessed SVG while the container is hidden or unmeasured. Preserve resize handling and chart interactions.
- Native Chromium PDF generation reproduced the report-to-Home navigation, including a PDF containing Home instead of the report. The mobile guard treated print-page width as a mobile viewport. Limit both route guards to `screen` media; actual mobile report exclusion remains. Print only the report workspace, clear screen viewport heights/scroll gutters, use A4 landscape with 10mm margins, and reduce print-only gaps so a footer does not occupy an otherwise blank second page. Restore the document title when print returns rather than on a fixed timer.
- Home sort labels are Risk, Latest, Own mentions, Related articles without prefixes; Related articles is the existing bundle-size ordering, not a new ranking rule. Narrow the dropdown to 160px. Keep five story slots, including blank numbered rows when Own filtering has fewer results, without adding unrelated articles.
- Center column headings across Monitoring, Regulators, Management, stocks and dashboard detail tables. Keep body headline/name/numeric alignments unchanged. Remove the conflicting header overrides instead of adding an important-style layer.
- API evidence `.qa/article-alias-local/summary.json` confirms two records for Insurance Journal article 34047: publisher-original and Google RSS, with the same publisher, full title and publication timestamp. Existing read deduplication keyed by URL. Collapse only a same-publisher/date/full-title portal copy with one unambiguous original. Preserve different publishers, different original IDs, ambiguous or truncated titles and different dates. Prefer the original's full record; retain portal identifiers/links for existing deep links. Apply to core/cache/history reads, not only visible rows. Raw DB records and classification decisions are not changed or deleted.

## Verification

- 218 frontend tests pass; 40 modules have no invalid local references. Existing article-ID/query-parameter identity tests remain, with added portal alias, ambiguous-original and deep-link checks.
- `.qa/report-print-final/summary.json`: cold/reloaded chart frames use the actual size from their first visible frame; all four Home sorting modes retain five slots and the same story-region bounds. Actual daily/weekly/monthly PDFs were generated, inspected with `pdfinfo`, rendered to PNG and visually reviewed: each is one landscape A4 page, no orphan footer page. Print and simulated cancellation preserve Reports and document title; a real mobile screen resize still redirects as intended. No write actions.
- `.qa/article-alias-local/summary.json`: the reported real article appears once with its publisher-original URL; the previous Google record's hash deep link also opens that single article. Headers are centered. No JavaScript errors.
- `.qa/print-sort-header-navigation/`: 26 PC/mobile route checks and five desktop Home viewport fits pass, including centered table headings, existing body alignment, search/reset/CSV, dropdowns, tooltips and report controls.
- `frontend/scripts/report-print-qa.mjs` provides repeatable chart/slot/native-PDF/print-return checks. Home refresh QA additionally checks that a legitimate mocked refresh preserves the chart dimensions. These tests do not send Slack messages or perform real collection.
- Live release `b0767c3c`: Publish Dashboard `45569508986` completed both publish and deploy successfully; Link QA `45570098299` succeeded. `.qa/live-report-print-b0767c3c/` passes initial chart sizing, all sort slots, three native PDF outputs, print return/cancellation and the genuine mobile guard. Each generated PDF is one landscape A4 page; all three rendered pages were visually reviewed. `.qa/live-article-alias-b0767c3c/` confirms one original article and preserved Google-hash navigation. `.qa/live-refresh-chart-b0767c3c/` passes cold/two cached reloads and a mocked new-data refresh, including unchanged chart dimensions, with zero real dispatches. `.qa/home-own-final/own-five.png` visually confirms two populated own-mention rows followed by three numbered empty slots.

---

# Home Refresh And Monitoring Toolbar QA - 2026-11-25

## Cause And Fix

- Production trace `.qa/home-refresh-before/summary.json` reproduced the exact fourth-story switch on two cached page reloads: a GA commission headline at 275/283ms was replaced by the insurance-fraud headline at 1124/1123ms. Cold loading already showed the latter. The constructor ranked cached raw articles through a separate bootstrap path, whereas the later calculation grouped and filtered issues using the final rules. This was provisional rendering, not evidence that the database deleted and re-added an article.
- Remove the provisional ranking and KPI builders. Priority rows and headline metrics use structural skeletons until the existing final day-scoped calculation commits atomically. Subsequent refreshes keep the committed view while loading. The final ranking/grouping rules, 240-article day cap and idle scheduling remain unchanged; no synchronous full classifier was added to startup.
- Put Monitoring search/date/filter controls in one responsive toolbar and move Latest/Related sorting beside tone and publisher. The three selects stay on one horizontal line even on mobile. The fixed desktop date-field width avoids wrapping changes between one-day and date-range labels. Search/reset, date popover, pagination and CSV contracts remain unchanged.

## Verification

- Frontend: 213 passing tests, 40 modules with no invalid local references and a successful production build.
- `.qa/home-refresh-final/summary.json`: a delayed initial read displays five skeleton rows and no fabricated zero headline metrics or empty-result message; completed-region bounds match exactly. Cold start and two cached reloads each display one identical finalized priority list. A browser-only new-article fixture then updates the list once, proving genuine updates are not frozen out. Monitoring also retains a loading state instead of reporting no results during its initial read. No real collection or notification was dispatched. Repeatable test: `frontend/scripts/home-refresh-qa.mjs`.
- `.qa/refresh-toolbar-layout/summary.json`: 65 states across seven viewport sizes, zero failures. Date opening/search/reset/detail/page-size interactions preserve workspace bounds. `.qa/refresh-toolbar-navigation/` passes 26 PC/mobile category checks and five dashboard fits, with an explicit equal-y assertion for tone/publisher/sort selects.
- Native Monitoring and Home loading/ready screenshots were visually reviewed. Changes include the previously committed keyword-aligned publisher bars, duplicate Management-title removal and six equal Regulator tiles; none was reverted.
- Release `fb6648ee` completed Publish Dashboard run `45566204979` (publish and deploy successful). `.qa/live-home-fb6648ee/` passes four frozen-input/new-data rounds with no real dispatch; `.qa/live-newsroom-fb6648ee/` passes 26 routes and five viewport fits. Management's 12 views, five Regulator layouts and keyword-matched publisher bars/30-90 day drilldowns were also verified live on the preceding unchanged modules. Existing 08:00 and 13:00 report URLs return HTTP 200.

---

# Keyword-Aligned Bars, Management Titles And Regulator Tiles QA - 2026-11-25

## Scope

- User-directed presentation change: publisher rows now use the exact existing keyword-bar component styles and three tracks (publisher, bar, total), not the previous 5px micro-bar/five-column presentation. Bars are 24px high at every breakpoint, with identical fonts, column widths, padding and row gaps. Own-mention/negative counts remain in the native hover title and accessible button label; selected-period drilldowns are unchanged.
- Publisher and keyword skeletons now share the same three-column structure and 24px placeholders. Removed the obsolete publisher table/micro-bar selectors rather than overriding them with another style layer.
- Remove only repeated Management category titles: Media/Reporter Registry headings, manual media/reporter panel headings, Ad Management heading, and both locked/authorized Classification Audit titles. Preserve meaningful inner section headings, counts, sub-tabs, filters, forms, action buttons and the login requirement. `Panel.hideTitle` defaults to false so all other pages keep their existing headings.
- Follow-up: Financial Regulator status is now six equal tiles, starting with `All + current count`; remove the separate visible category-status heading, denominator caption and small All button. All reset and active-category toggle behavior remain, and mobile uses two equal columns/three rows. Removed the retired heading/summary/wrapper CSS.

## Verification

- Frontend: 211 passing tests, 40 checked modules without invalid local references, and a successful production build.
- `.qa/keyword-publisher-bars/summary.json` passes seven viewport sizes. Publisher and keyword rows have exactly equal grid tracks/font sizes and 24px bars; lower dividers/headers and tab bounds remain stable. Actual 30/90-day publisher counts of 251/800 open matching article counts with zero extra range requests. Counts are observations of changing live data.
- `.qa/management-headings/summary.json` checks all six Management categories on PC/mobile (12 views), including nested manual media/reporter views, count metadata, search fields, action buttons and the anonymous Classification Audit login notice. No duplicate category heading, JavaScript exception or write action. Authorized-only data was not fetched with a fabricated session; the existing role guard is unchanged and source-tested.
- Native screenshots of the new bars and Management views were visually reviewed. No collection, classification, report dispatch or permission rules were changed.
- `.qa/bars-management-navigation/` passes all 26 PC/mobile route checks, search/reset, sort, CSV, tooltip/report interactions and five desktop dashboard viewport fits. No JavaScript exceptions or empty fallback workspaces were observed.
- `.qa/regulator-equal-panels/summary.json` verifies equal tile widths/heights across five viewport sizes, all five category filters (including zero results), toggle-to-All, explicit All reset and selector synchronization. The observed total was 17, split 8/6/2/1/0; the displayed All total equals the category sum and updates with the actual source/search/tone scope rather than hard-coding the screenshot's 15.

---

# Publisher Drilldown And Clipping Layout QA - 2026-11-25

## Causes And Scope

- Current production capture `.qa/clipping-media-before/02-media-publishers-1600.png` reproduced 202px-wide native-looking publisher buttons, zero-width bars, a duplicate section heading and multi-line counts in the first grid cell. Publisher clicks also discarded the active Media range and opened today's articles.
- At 1600 x 900 the old lower divider was at x=776.5 while the caution/neutral divider was x=800.5. Media now uses the same four-column tracks and 16px gap throughout, putting the lower divider at x=800.5. Lower headings share 52px tracks and both article lists scroll beneath their headers.
- Publisher rows now use the full pane width, with aligned publisher/bar, total, own-mention and negative-count columns. A single detail scroller and responsive reserved height prevent tab changes from shifting the rest of the page. Publisher-specific skeletons use the same columns.
- Media publisher and keyword drilldowns preserve start/end dates and the usable-article scope. Monitoring reuses the same complete range cache and revision rather than issuing another query or truncating 90 days to the general 8,000-row history profile. Late range responses cannot overwrite a reset or newer range request.
- Clipping replaces the oversized lead/two-side-story mosaic with consistent editorial rows: rank, tone/category, headline, source/time, a short summary and aligned save/original/evidence actions. All full summary/evidence remains in the existing dialog, and category filtering, sorting and incremental article display remain intact. No recommendation, collection, classification, scheduling or authorization rules changed.

## Verification

- Frontend: 209 passing tests, 40 modules with zero invalid local references and a successful production build. The backend is unchanged.
- `.qa/media-clipping-detail/summary.json`: seven viewport sizes; publisher rows fill their pane and retain nonzero bar widths; desktop divider error is zero and tab bounds remain stable. Actual 30-day/90-day publisher drilldowns show exactly 248/797 matching articles and make zero additional range requests. These are live-data observations rather than fixed expected counts.
- `.qa/media-loading-race/summary.json`: publisher loading/ready bounds match exactly, no visible loading prose replaces the skeleton, and a held fixture range response is discarded after Monitoring reset. No article save or notification was made.
- `.qa/clipping-media-navigation/` contains 26 passing PC/mobile route captures, search/reset, sorting, CSV, tooltip/report checks and five desktop dashboard viewport fits. Before/after publisher and clipping captures were visually reviewed. Dedicated repeatable UI verification is in `frontend/scripts/media-clipping-qa.mjs`.
- Final seven-viewport suite `.qa/clipping-media-layout/summary.json` records 65 states and zero failures, including publisher tabs, Media ranges, Clipping categories/evidence dialog and Monitoring detail/page-size changes. Desktop still has no document scroll or offscreen workspace controls.

## Verified Publication

- Commit `a61bc40f`; Publish Dashboard run https://github.com/incarmarketing/news-monitor/actions/runs/45558874468 succeeded in both publish and deploy jobs. Actual service: https://incarmarketing.github.io/news-monitor/dashboard.html?v=a61bc40f .
- `.qa/media-clipping-live/summary.json` passes all seven viewport checks, equal lower-header heights, zero desktop divider error, Clipping filtering/sorting/evidence/load-more, and complete publisher drilldowns. Live publisher totals increased to 250/799 for 30/90 days; each opened exactly that many matching articles with no additional range request. No JavaScript error or write action was observed. Native publisher and clipping captures were visually reviewed.
- Today's 08:00 and 13:00 stable daily report URLs both return HTTP 200 after deployment. No test article save, extra collection or Slack/report notification was sent.
- Scope limit: the baseline Clipping capture includes a television-drama headline among candidates. This UI patch does not certify recommendation/classification accuracy or alter those rules; this existing content-quality issue remains a separate QA item.

---

# Media Skeletons, Publisher Columns And Commentary Removal QA - 2026-11-25

## Scope

- Remove the entire Media observation-commentary section, its cache payload, dedicated rendering helper, text generator and unused styles. Article counts, tone plots, keywords, publisher totals and issue links remain; no classification or report-writing rule changes.
- Replace visible Media loading sentences with structural skeletons for the four tone plots, keyword/publisher rows and issue digest. Progressive rendering, genuine error/retry states and empty-result states remain distinct. A single screen-reader status and reduced-motion support are retained.
- Move the Monitoring publisher into its own column immediately before the headline. Remove the headline subline, preserve links and controls, update detail colspan to nine, and reserve a separate publisher track on mobile.

## Verification

- Frontend: 206 passing tests, 40 checked modules with zero invalid local references, and a successful production build. The backend is unchanged from the 388-test release suite below.
- Read-only delayed-range test: `.qa/publisher-skeleton/summary.json`. All three Media region boxes match exactly before/after loading at 1280 x 720, with zero document overflow. Keyword and publisher tabs both display skeletons; completed data has no skeleton or observation commentary.
- Monitoring has nine cells per article at 1280 x 720, 1440 x 900 and 390 x 844, with the publisher before the headline and no publisher subline. Detail expansion retains all nine columns. No horizontal page overflow or JavaScript exceptions; desktop has no document scroll.
- Cross-category regression: `.qa/media-final-navigation/` contains 26 passing PC/mobile navigation captures and five desktop dashboard fits, including searches, reset, sorting, CSV, tooltips and report interactions. Loading and mobile publisher captures were visually reviewed.
- Seven-viewport stability suite: `.qa/media-final-layout/summary.json` records 65 states with zero failures. Desktop workspaces retain no-document-scroll and stable surrounding bounds during filtering, sorting, detail expansion and range changes.

## Verified Publication

- Commit `10b20cb5`; Publish Dashboard run https://github.com/incarmarketing/news-monitor/actions/runs/45554609289 completed successfully in both publish and deploy jobs. The preceding shared-select/tone/filter commit `7fcde41c` is included.
- Actual service: https://incarmarketing.github.io/news-monitor/dashboard.html?v=10b20cb5 . `.qa/publisher-skeleton-live/summary.json` confirms no observation commentary, exact loading/ready region bounds, nine-column publisher placement at 1280/1440/390px and no JavaScript errors. Live loading, ready and publisher captures were visually reviewed.
- `.qa/select-tone-live/summary.json` verifies all six tone option labels have zero center error, 6px popup corners and 1px borders. Keyboard selection, reset and regulator category/All filtering pass. The 30-day default and every day in both 30/90-day tone plots remain present, with plot sums matching the period total. Live negative totals were 19/58, on independent zero-based integer scales; these changing data observations are not fixed expected counts.
- Both November 25 stable daily report links, `08.html` and `13.html`, return HTTP 200 after deployment. All post-deployment tests were read-only; no extra collection, article save or report/Slack send was triggered.

---

# Shared Selects, Tone Scales And Regulator Filters QA - 2026-11-25

## Scope

- Replace every application-native select with one accessible, pinned Radix Select component (`@radix-ui/react-select` 2.4.1). Keep actual filtering, sorting, forms, numeric/string/empty values and disabled states; no collection/classification permissions or scheduling changes.
- Selected fields and popup lists share a 6px radius, 1px neutral border, 16px text, centered labels and a Lucide chevron 14px from the right edge. Closed fields stay 40px high. Pointer selection no longer produces the olive focus outline; keyboard focus retains a neutral visible indicator.
- All eight JSX consumers now use `AppSelect`. Removed the obsolete native-chevron SVG and native popup styling, and excluded select buttons from unrelated dashboard/pagination/correction action-button rules. Native options are not relied on for visible popup styling.
- Popups use Radix-managed navigation/typeahead/focus, bounded collision-aware portals, internal scrolling and stable scrollbar space. When opened in an existing native dialog, the portal stays inside that dialog. Hidden native form values remain original values rather than display labels.
- Media defaults to an inclusive 30-day range. Its four tone plots each have their own explicitly labeled zero-based integer scale, preserving every date and count; rare negatives are not flattened by the neutral-volume axis. Each plot shows period total and occurrence days. Desktop uses four columns; mobile/tablet use two columns without distorting plots.
- Regulator category tiles are real filters, synchronized with the keyword selector. Counts use the complete current search/source/tone scope rather than a five-article sample. Clicking the active tile toggles back to all; the All command resets only the category, and category changes reset the visible-row limit and selection consistently.

## Verification

- Frontend: 204 passing tests; backend release suite: 388 passing mocked tests. Build and reference validation passed. The new tests cover empty/numeric/implicit select values, disabled groups, category filter consistency, independent integer axes and the 30-day default.
- Local detailed checks: `.qa/select-tone-detail/summary.json`. All six tone option labels have 0px center error; popup radius is 6px and border 1px. Escape/focus return, End/Enter selection, reset and no surrounding-layout movement pass. Native-dialog tests pass for pointer interaction, disabled states, original/empty FormData values, focus restoration and long labels without dialog overflow. No real save was made in the fixture.
- Actual 30-day tone test: 19 negative articles across the period, with a negative y-axis of 0/1/2/3/4 while neutral uses 0/50/100/150/200. The 90-day negative plot independently uses 0/5/10/15/20. Per-plot sums and the overall period count agree; totals are observations of changing live data, not hard-coded expected values.
- Financial-regulator test: 15 articles in scope, with category counts 7/5/2/1/0; selecting the seven-article category shows only that category and the matching count, and All restores the same original scope. Actual click evidence: `.qa/select-tone-detail/regulator-filter.png`.
- Existing regression: `.qa/select-tone-navigation/` has 26 passing PC/mobile category captures plus five dashboard viewport fits. `.qa/select-tone-layout/` preserves the five desktop no-document-scroll and stable-anchor contracts across seven viewport sizes. Screenshots of expanded selects and both desktop/mobile tone panels were visually reviewed.

## Manual Refresh Authentication Recovery

- Read-only DB evidence identified the November 25 13:42:14 KST failure as GitHub `401 Bad credentials`, not a chart/DB/session failure. The user regenerated and registered `GITHUB_DISPATCH_TOKEN` directly; the assistant did not receive, copy or expose the token.
- Exactly one real public refresh was requested after registration, with Slack/report sends disabled. The endpoint returned HTTP 200 with `ok: true`; Dashboard News Refresh run https://github.com/incarmarketing/news-monitor/actions/runs/45549473041 succeeded.
- The successful job log records completion at 13:51:39 KST: 103 collected, 79 analyzed, then persisted by the production refresh path. No duplicate report or corrective notice was sent.

---

# Complete Media History And Header Cleanup QA - 2026-11-25

## Scope And Causes

- Requested follow-up, not a redesign reversal: keep the selected light editorial layout; rename the overview menu to Home, remove the duplicate masthead search and date, align the monitoring date popup, and repair the 30/90-day tone history.
- The database contains all 90 publication days. Media previously consumed a recent bounded snapshot after an unauthorized direct-table read failed; the period buttons only filtered that incomplete input. Media now owns its exact publication-date range through the existing restricted `article_range` API. No table grant, RLS policy, API write permission, collection schedule or dispatch channel was changed.
- Article URL deduplication also discarded every query parameter. Separate `articleView.html?idxno=...` articles therefore collapsed. It now preserves article IDs and case-sensitive paths, sorting retained parameters and removing only explicit tracking parameters/fragments.
- The screenshot's GitHub dispatch 401 is distinct from the denied direct-table history read. Human-readable bottom-right status notices replace the raw error under the logo; the rejected server `GITHUB_DISPATCH_TOKEN` still requires credential verification/replacement. No credential was read, replaced or copied for this UI change, and a real collection dispatch was not used as a test.

## Implementation And Evidence

- Complete range reads paginate beyond the old 8,000-row default, reject invalid cursors and reject a truncated 20,000-row result instead of pretending the period is complete. Read failures display a retry state, not a fabricated zero/sample curve.
- Two-minute bounded range caching shares duplicate/in-flight reads and invalidates on the article revision. Cancelled/late calculations cannot overwrite the selected period. Failed reads are evicted for retry.
- Large historical ranges reuse the existing issue-grouping/classification rules, with short cooperative batches and memoized summaries/scores. Date/time formatters are reused. Fully fetched tone/keyword results appear before the longer issue digest completes; CSV remains based on the fully fetched selected range.
- Local actual API verification: 30 days, 3,634 normalized articles; 90 days, 10,567 normalized articles, August 28 through November 25, all 90 days nonzero. Each displayed headline count equals the sum of its daily tone points. Different counts from raw DB rows reflect existing source exclusions and deduplication, not an assertion of one-to-one raw row counts.
- Cold local measurements: the 30-day graph appeared in 2.7 seconds and its complete digest in 8.8 seconds; the 90-day graph in 7.8 seconds and its digest in 27.9 seconds. Returning to a cached period made zero new range requests. Longest main-thread task in the same audit fell from 8,138ms before batching to 248ms in the final run. These are observed development measurements, not a promise of instantaneous cold history or a production SLA.
- Date popup: two equal 212.67px date inputs and a 40px-high Apply control have exactly matching bottoms on desktop; Escape/Apply restore the opener focus, outside click dismisses, mobile popup stays within 390px. The popup remains out of document flow.
- Removed masthead-only search/date/status styles instead of leaving superseded CSS active. Search, filters and CSV in Monitoring remain intact. Menu route ID remains `overview`; only its visible name is Home.
- Historical date-axis labels now reserve space before the final endpoint. Four/five-digit keyword counts retain their unit on one line.
- Read-only background evidence: `.qa/header-history/summary.json`, `media-30.png`, `media-90.png`, `date-popup.png`, `date-popup-mobile.png`, `refresh-error.png`, `race-final.png`.
- Mocked failure/race checks pass: failed range has no invented zero trend, retry succeeds, downloads are disabled for incomplete data, and a delayed 30-day response does not replace the selected 90-day result. The refresh 401 was mocked; no collector or notification was dispatched.
- Frontend: 198 passing tests; backend release regression: 388 passing mocked tests. Build and local reference validation passed. Cross-category regression covered 26 PC/mobile navigation captures, CSV, chart tooltips, reports, management subviews and five desktop dashboard fits. Viewport checks preserve the previous no-document-scroll and stable-anchor contracts.

## Verified Publication

- UI commit `2190f288`; Publish Dashboard run https://github.com/incarmarketing/news-monitor/actions/runs/45544319850 completed successfully. Deployment waited for the existing 13:00 report workflow rather than cancelling or bypassing it.
- Actual service checked: https://incarmarketing.github.io/news-monitor/dashboard.html?v=2190f288 . Live 30-day graph: 3,671 articles; live 90-day graph: 10,604 articles, all 90 dates present, each period total matching its plotted tone points. Counts rose by 37 after the regular report collection; local measurements above remain historical observations, not fixed expected counts.
- Live graph availability: approximately 3.0s for 30 days, 8.1s for 90 days; full issue digests finished in 9.6s and 29.6s respectively. Longest observed main-thread task was 230ms; returning to a cached period made no range requests. Historical digest latency remains visible and cancellable, not claimed eliminated.
- Live evidence: `.qa/header-history-live/summary.json` and native PC/mobile captures; `.qa/header-history-live-navigation/` contains 26 passing category/navigation checks plus five dashboard viewport fits. No JavaScript exceptions. Header/date alignment, final axis labels and unbroken keyword count units were visually reviewed.
- The first live harness comparison ran before the webfont finished loading; gating the comparison on `document.fonts.ready` isolates interaction layout correctly. The repeated comparison passed without changing production typography.
- Today's 08:00 and 13:00 stable report URLs both return HTTP 200 after the UI deployment. No corrective message, duplicate report send or test collection was triggered.

---

# Editorial Ledger And Stable Workspaces QA - 2026-11-25

final result: passed

## Current Visual Target

- Selected third displayed priority-article proposal: `C:/Users/User/.codex/generated_images/019e1489-9221-76e2-9cd8-a29490d3d5bf/exec-04fd27e8-e0f9-4f3a-b06e-e9d04fb08f74.png`.
- Light-only refinement shown before implementation: `C:/Users/User/.codex/generated_images/019e1489-9221-76e2-9cd8-a29490d3d5bf/exec-23279469-ac40-4284-a022-4d25cc2ac97b.png`.
- Scope: five equal editorial rows, permanent light mode, fixed-inset select arrows, desktop viewport-fit monitoring/media/clipping/reports, and stable surrounding layout on interaction. Existing data, classification, collection, dispatch and authorization behavior are unchanged.
- Implementation URL: `http://127.0.0.1:4186/`; user-approved background Playwright, no foreground PC control.
- Reference is 1672 x 941 pixels, proportionally contained at 1600 x 900 without distortion; implementation is 1600 x 900 CSS/pixels at device scale factor 1.
- State: dashboard, light mode, current read-only data. Different real counts and source-truncated titles are not replaced with illustrative mock data.
- Full comparison input reviewed: `C:/Users/User/Desktop/COWORK/news-monitor-newsroom/.qa/ledger-layout-final/compare-overview.png`, 3200 x 900.
- Focused comparison input reviewed: `C:/Users/User/Desktop/COWORK/news-monitor-newsroom/.qa/ledger-layout-final/compare-priority.png`, 3120 x 380.
- Implementation screenshot: `C:/Users/User/Desktop/COWORK/news-monitor-newsroom/.qa/ledger-layout-final/1600-overview-initial.png`.

## Findings And Iteration History

1. [P1, fixed] Old asymmetric mosaic and yellow lead highlighting did not match the selected equal-row proposal. Replaced that CSS/markup, not another overlapping theme. Category, tone, full available title, publisher and external-link icon have aligned columns; sort belongs to the section header.
2. [P2, fixed] Initial comparison showed smaller headline and operations type than the reference. Increased desktop headline/menu/operations typography, retained smaller fixed-size laptop variants, removed the redundant logo-side product title, recaptured, then reviewed the combined reference/implementation again. Final evidence is the two comparison inputs above.
3. [P1, fixed] First 1280 x 720 interaction pass found a media plot covering the lower tabs: the actual plot wrapper did not carry the intended responsive `tone-trend` class. Restored that class and the allocated chart height. Repeated actual clicks and bounded-SVG checks pass; `.qa/ledger-layout-round2/1280-media-initial.png` and final captures show separate, usable regions.
4. [P2, fixed] Weekly report switching produced document overflow despite a bounded report sheet. Absolutely positioned screen-reader link labels lacked a positioned ancestor inside the scrollable article index. Positioned that index, preserving the labels and all article content. Repeated daily/weekly/monthly switching now keeps document overflow at zero; no body overflow clipping is used.
5. [P2, fixed] Selected navigation/period/category text changed weight, date filters expanded in flow, and optional scope/loading text added height. Navigation and tabs now retain their weights; the custom date form opens as an anchored popup with outside/Escape dismissal; scope/loading has reserved space; root/content scrollbar gutters are stable.
6. [P2, fixed] Expanding clipping evidence changed neighboring tile geometry. Evidence now opens in the existing accessible native dialog, preserving the original summary/decision information and article list position. Escape closes it without navigating.
7. [P2, fixed] Final mobile visual review found the negative-story edge tick touching the first headline glyph after the layout stacked. Offset that tick into the existing mobile page gutter; the article text, ranks and desktop alignment remain unchanged. Final mobile capture is recaptured after this correction.

## Required Fidelity Surfaces

- Typography: bundled Pretendard Variable, 0 letter spacing, fixed sizes rather than viewport-scaled text; desktop headline 23px and laptop 18px, natural wrapping with no CSS ellipsis. Browser font-loading checks pass.
- Spacing/layout: equal middle-aligned editorial rows and hairline separators match the selected hierarchy. Five desktop viewports fit the dashboard, monitoring, media, clipping and report workspaces. Long lists scroll in designated content areas; controls and charts are not hidden to simulate a fit. Mobile/tablet retain readable natural scrolling and the existing mobile-report restriction.
- Colors/tokens: cool #f7f8f9 base, ink #131615, gray rules, restrained olive navigation, red/amber semantic labels. Removed dim-theme state, toggle, icon imports and CSS; old stored dim preference is cleared. A simulated dark OS preference with the old dim setting still renders light.
- Assets: existing official Incar and Slack bitmaps, existing Lucide action icons; select arrow asset is exported from Lucide ChevronDown, with a shared 14px right inset and 42px text reservation. Native select options and keyboard access remain intact; forced-colors uses the native arrow.
- Content: original URLs, ranking, date windows and status meanings remain. Existing source-level title ellipses and the previously documented article-summary/history count-basis discrepancy are separate data-quality matters, not purported fixes in this UI change.

## Verification

- Frontend: 185 passing tests. Reference validation: 32 modules, zero unresolved references. Production Vite build passes without oversized-JS warnings.
- Backend release regression: 388 passing mocked tests using the existing project Python environment. The first bare-system-Python attempt lacked dependencies; rerunning in that environment resolved the environment-only errors without source changes.
- Reusable viewport/interaction suite: 65 captures, zero failures, at 1280 x 720, 1366 x 768, 1440 x 900, 1600 x 900, 1920 x 1080, 1024 x 768 and 390 x 844. Five desktop workspaces have zero document overflow. Search/reset, empty/fewer results, date popup, sorting, pagination size, row expansion, media tabs/ranges, clipping dialog and report periods are tested; surrounding anchors and navigation remain within 1px.
- Evidence: `C:/Users/User/Desktop/COWORK/news-monitor-newsroom/.qa/ledger-layout-final/summary.json`.
- Full cross-category regression: 26 navigation captures and five additional dashboard viewport checks pass, including CSV, report print command, chart hover/focus/keyboard, stock controls, registry/manual-table alignment and management subviews. Evidence: `.qa/ledger-full-regression-final/`.
- Print rendering: all article content is retained in daily/weekly/monthly emulated print; screen-only finite-height constraints are released. Evidence: `.qa/ledger-layout-final/print-일간.png`, `print-주간.png`, `print-월간.png`.
- No browser test logged in, dispatched collection, changed classification, saved scraps, called paid analysis or sent notifications. Publication is checked separately from this local visual gate.
- No actionable P0/P1/P2 design issues remain in the tested states. P3: exact raster-generated glyph shapes vary slightly from the real licensed font; native menu popup chrome remains OS-controlled.

## Verified Publication

- Main UI commit `a0d9ed61`; mobile edge-marker correction `20f19af3`. Publish Dashboard runs `45536514607` and `45536980735` both completed successfully. Final run: https://github.com/incarmarketing/news-monitor/actions/runs/45536980735 .
- Actual service: https://incarmarketing.github.io/news-monitor/dashboard.html?v=20f19af3 . Served assets are `assets/index-DUhrFfUA.js` and `assets/index-uVXPAy4_.css`; verified the served module contains the new priority heading and no theme-toggle labels.
- Live viewport/interaction suite: 65 captures, zero failures, same seven viewport sizes and five desktop bounded workspaces. Evidence: `.qa/ledger-layout-live/summary.json`.
- Live all-category regression: 26 passing screen/interaction captures plus five dashboard viewport fits. Evidence: `.qa/ledger-live/summary.json` and `viewport-fits.json`.
- Final actual captures reviewed: `.qa/ledger-live/published-1600.png` and `published-390.png`. Dark-OS simulation plus the former stored dim preference still renders light; preference is removed, dropdown chevron inset is 14px, desktop document overflow is zero and the corrected mobile marker is -8px inside the page gutter.
- Browser console review: no JavaScript exceptions, failed application requests or failed page assets. An existing browser-level request for `https://incarmarketing.github.io/favicon.ico` returns 404; recorded as non-blocking P3, not claimed as fixed. Exact evidence: `.qa/ledger-live/published-assets.json`.

---

# Historical Newsroom Design QA - 2026-11-25

final result: passed

## Viewport And Control Follow-Up

- Updated requirement: the desktop dashboard must fit without document scrolling; align controls and tables across categories without removing workflows. The prior large newspaper spacing is intentionally compacted only where the viewport requires it.
- Desktop layout is scoped to the overview at widths 1201px and above. It allocates the available viewport among five stories, operations and four charts instead of hiding document overflow. Mobile/tablet keep readable scrolling; other categories retain their existing scrolling behavior.
- Baseline overflow: 1280 x 720 had 388px of vertical overflow; 1366 x 768 had 253px. Post-fix actual captures at 1280 x 720, 1366 x 768, 1440 x 900, 1672 x 941 and 1920 x 1080 have zero horizontal/vertical document overflow, five visible stories, non-overlapping headlines/footers and four complete plotting surfaces of at least 130px. Wheel input does not scroll the desktop overview.
- Full before/after pairs inspected: `.qa/viewport-controls-after/compare-1280.png`, `compare-1672.png`; focused control comparison: `compare-controls.png`. Same viewport/theme/scale; differences in live news counts and headlines are expected, not reproduced as mock data.
- Standard selects/inputs/commands now share 40px height, 16px control text, 4px radius and common borders/spacing; the dashboard's dense sort control is an explicit 32px/14px variant with the same styling. Native option typography/colors and keyboard behavior are retained without adding a dropdown framework. Native popup chrome remains OS/browser-rendered.
- Search wrappers, reset/export commands and date fields align vertically. Name/headline columns align left, dates/status center and numeric financial/registry columns right; matching headers and data cells use the same alignment. Removed obsolete dark-theme registry overrides and hard-coded audit/registry surface colors.
- Reusable browser regression checks now assert select styles, monthly selector, management subviews and the five desktop viewport fits in addition to the existing interactions. Local interaction/viewport checks and 27 responsive route cases passed.
- Additional subview review found registry count-column styling reaching the nested manual management tables. Scoped it to the actual `.registry-table` and verified exact header/data alignment in publisher, unknown-publisher, reporter, manual publisher and manual contact tables on desktop/mobile. Native keyboard changes in the monitoring sort do not navigate away. This pre-publication issue is fixed and covered by the reusable browser suite.
- Final publication: https://github.com/incarmarketing/news-monitor/actions/runs/45528912580 succeeded for `e3e227d3`. Production serves `index-CSEnXeml.js` / `index-CWtxPGGu.css`.
- Actual service verification: `.qa/viewport-ui-live/summary.json` has 26 passing navigation/interaction captures, including both desktop and mobile manual management tables; `viewport-fits.json` has five desktop sizes with zero X/Y document overflow, all five stories, four unclipped charts and no wheel scrolling. Actual capture `desktop-fit-1366.png` visibly includes `Slack 최근 10:39` and `08:00 발송완료` alongside the complete graphs.
- Recovery report URL returned HTTP 200. Public `data/operations.json` also contains the successful November 25 08:00 notification at 10:39:26 KST, so the static fallback does not retain the prior generated-only delivery state.

## Regular Briefing Recovery

- Confirmed root cause: November 24 13:00/18:00 and November 25 08:00 runs failed at Pages artifact discovery after upload. Slack steps were skipped. This incident is not attributed to token expiry.
- Fix `d15724e5`: preparation uploads the site and generated archive state; dependent delivery job restores that state, deploys Pages, then uses the existing link verification and notification deduplication. Failure/finish ledgers and archive persistence remain in place. Current-day generated daily reports can resume without another collection/analysis pass; forced regeneration and backfill keep their original paths.
- Recovery run https://github.com/incarmarketing/news-monitor/actions/runs/45526481650 completed successfully. Today's 08:00 report was accepted by Slack at 10:39:26 KST, provider HTTP 200/body `ok`, with exactly one successful `daily_report` notification row and a successful `daily_report:2026-11-25:08` job record. Actual dashboard shows `08:00 발송완료` and `1/3 완료`. Yesterday's missed reports were not batch resent.
- Automatic archive commit `5f5dfe79` was pulled before the UI deployment so current reports/state are preserved. No notification credentials were exposed or modified.

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

- Frontend unit suite: 182 tests passed, including shared-control/viewport guards and delivery labels.
- Python release regression suite: 388 tests passed, including delivery-job contracts and generated-report recovery; mocked tests only, no production writes or sends in the test suite. The explicitly requested operational recovery send is separately documented above.
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

- The generated-but-unsent regular briefing incident is now fixed and verified as documented above. Existing collection/classification/risk scoring, regular 08:00/13:00/18:00 schedule, negative watch cadence and normal notification deduplication are preserved.
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
