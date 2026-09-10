# Headline display cleanup

## Scope

- Strip terminal, spaced source labels: publisher domains/URLs, portal names, known publisher names, or names supplied in article publisher metadata.
- Use the same fixture contract for Python reports/Slack text and JavaScript dashboard/monitoring/report views.
- Keep company names inside the headline and research attribution such as `Not Rated - iM증권`.
- Keep original DB titles, article identities, classification/grouping inputs, publisher metadata, and links unchanged. The formatter is network-free and does not mutate article records.
- Preserve the report's separate/prefixed publisher attribution. Existing Slack messages are immutable; newly generated message text uses the formatter.
- Normal Pages publishing regenerates archived daily report HTML and current weekly/monthly reports from the updated templates.

## Verification

- Python: 363 tests passed, including actual daily and weekly/monthly template rendering, source/link preservation, escaping, and original record immutability.
- Frontend: 154 tests passed, including 26 shared headline cases and idempotence checks.
- Dashboard API: 20 tests passed.
- Frontend reference check: 26 modules, no invalid imports.
- Vite production build: passed.
- Headless browser QA: 19 checks passed across 1366px and 390px viewports, including monitoring source suffix removal, separate publisher metadata, search/reset, report period switching, all active categories, and blocked browser storage. No page errors or horizontal overflow.

No production notification was sent by the tests. No article history was rewritten for this display change.
