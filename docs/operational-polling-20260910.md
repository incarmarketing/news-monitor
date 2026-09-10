# Dashboard operational reads: 2026-09-10

## Scope

Keep the ten-minute negative-watch scheduler, three daily Slack briefings, collection rules,
manual collection button, report history, marketing JSON feed and watchdog recovery unchanged.
No new scheduler, WebSocket service, paid AI call or notification test delivery is introduced.

## Changes

- Remove the browser's five-workflow GitHub poll at startup and every five minutes.
- Read a five-row DB revision marker once per minute while the page is visible. Revisions
  change transactionally on article and ledger inserts, updates, deletes and truncates.
  Statement-level triggers invalidate once per SQL statement, not once per article.
- Only changed ledgers are downloaded. Only an article revision change, KST day change,
  initial load, explicit collection or bounded outage fallback reloads article rows.
- Unchanged arrays keep their identity so article classification/chart caches are retained.
- Pause reads in hidden tabs, check immediately on return/reconnection, and coalesce overlap.
- DB version lookups are coalesced/cached for ten seconds per warm Edge instance. This is not
  a claim of a global in-memory cache. HTTP responses remain no-store; user details are never
  placed in shared response caches.
- Manual collection checks only the requested workflow. Signed-in management diagnostics
  retain the five-workflow inspection on entry/manual refresh. A service-only DB lease/cache
  shares GitHub results across users and Edge instances for 60 seconds; failed reservations
  never fall through to unbounded GitHub calls. Provider rate-limit backoff is respected.
- The existing negative-watch job ledger supplies start/final state, including failures before
  an article scan is recorded. Missing finish records age into warning/failure at the existing
  25/45-minute thresholds. A read outage means confirmation unavailable, not a collection failure.
- Partial reads never clear a previously known ledger. Failed article loads cannot acknowledge
  a new DB revision. A valid empty DB article list is distinct from a failed request.

## Expected bounds

Visible-tab changes are normally reflected within about 60-70 seconds plus request/render time.
This is not push delivery and is not instantaneous. Diagnostic GitHub status may be cached for
up to 60 seconds; article/Slack state uses database records, independently of that cache.
If change tracking is unavailable, article fallback is capped at once per five minutes and
uncertainty is displayed. Hidden tabs resume current data when shown.

The one-hour unchanged-data regression produces one initial article load and 60 small checks,
with zero normal-dashboard GitHub requests. This reduces payload/query work, not a claim that
every type of HTTP request count decreases. The five-minute old article timer made 12 additional
full loads in the same interval, plus 60 GitHub requests (excluding startup).

## Verification

Local verification passed: 356 Python regressions, 140 frontend/API tests, 19 category/storage
browser cases and eight operational browser cases. The Edge TypeScript check and frontend
reference check passed. Both pre-apply rollback and post-apply rollback SQL checks passed;
security advisors introduced no new warnings (the pre-existing pg_net/password-protection
warnings are outside this change).

- `node --test frontend/tests/*.test.mjs tools/test_dashboard_api.cjs`
- `npm --prefix frontend run check:references` and `npm --prefix frontend run build`
- `node tools/verify-operational-polling.mjs`: isolated real-browser transitions, no production writes.
- `node tools/verify-category-flows.mjs`: all nine categories on desktop/mobile plus blocked storage.
- `tests/sql/dashboard_change_tracking.sql`: rollback-only invalidation, ACL and shared lease checks.
- `node tools/verify-read-contract.mjs`: live articles, ledger changes, marketing feed and denied raw REST.

Apply `20260910001814_dashboard_change_tracking.sql` before deploying the Edge API, then the
frontend. The old snapshot endpoint remains compatible. To revert UI/API, keep the additive DB
objects initially; the old UI does not depend on them. Drop only the named triggers/cache objects
after confirming no deployed client/API uses them. Do not change pg_net or existing article data.
