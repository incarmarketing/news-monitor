# Public Dashboard API Boundary

## Compatibility

- Keep the same URL, API key formats, origin allowlist, action names, response envelope, article fields and limits.
- Keep anonymous `snapshot` and all read-only `media_registry` modes. Do not grant direct table or RPC access to `anon` or `authenticated`.
- Keep report dates, slots, delivery timestamps, statuses, dedupe keys, links and numeric historical aggregates. These drive the dashboard and read integrations.
- Logged-in snapshots and authorized management requests retain their existing detail fields.
- An origin allowlist is not authentication. All anonymous responses must be suitable for public access.

## Public Redaction

Anonymous snapshots omit provider errors, job details and arbitrary report metadata. Notification bodies retain only report date/slot signals needed for delayed-delivery matching. Watch messages retain only the legacy empty-scan signal so redaction cannot turn a successful empty scan into a failure. Static operations snapshots use the same watch-message boundary.

## Refresh Reservation

`claim_dashboard_refresh` is service-role-only and security invoker. One atomic conditional upsert reserves the existing fixed `job_runs` key shared by public and signed-in refreshes. The minimum cooldown remains two minutes. Requests cannot choose a reservation key or bypass the cooldown with workflow parameters.

A missing or failed reservation never dispatches GitHub work. Reads do not depend on the reservation RPC. Reservations expire automatically; no cleanup scheduler is required. GitHub dispatch errors remain in the private ledger, not the anonymous response. This prevents simultaneous dispatch claims, not a general exactly-once guarantee for an external HTTP delivery.

## Verification And Deployment

1. `node tools/test_dashboard_api.cjs`
2. `node --test frontend/tests/*.test.mjs`
3. Run Python regression tests, including `tests/test_dashboard_operations_snapshot.py`.
4. `node tools/verify_dashboard_public_api.mjs --baseline` (read-only; stores only public contract fields in ignored `out/`).
5. Apply `20260908231125_dashboard_public_refresh_claim.sql` before deploying `dashboard-api`.
6. Run `tests/sql/dashboard_refresh_claim.sql`; its ledger changes roll back and it never dispatches GitHub.
7. Deploy with existing custom API/session authentication (`verify_jwt=false` unchanged).
8. `node tools/verify_dashboard_public_api.mjs` checks live redaction and unchanged overlapping record values. Concurrent collection can legitimately change records; investigate rather than silently accepting differences.
9. Optional `--refresh` makes five real refresh calls; at most one workflow should be accepted. It does not send Slack reports.

If the API must be rolled back, the additive service-only RPC can remain in place. Never revoke public article/feed access or change unrelated shared-project RLS to resolve these warnings.
