# Classification Audit, 2026-09-09

## Scope

- Source-only replay of 785 articles dated September 3-9; three identical passes.
- Separately reviewed the original 253 drift candidates. A drift candidate is not a confirmed DB error.
- No AI requests, article deletion, notification sends, or unrestricted category rewrites.

## Findings and Changes

- Legacy context rules mapped named insurer products and activities into `competitor`, while the current UI uses that category for insurance agencies (GA). Three DB rules now use `industry`, with GA exclusions. Explicit title subjects distinguish insurers, agencies, and regulatory actions; company mentions and existing noise/manual protections retain precedence.
- Source-only replay discarded collection context. Safe keyword-context fields are now retained, but generated summaries and cached classification remain excluded from evidence.
- The old quality gate accepted 150 gold cases with only one positive alert case. Category/tone agreement was not enforced. The new gate requires category and tone agreement of 95%, joint agreement of 90%, alert precision of 99%, alert recall of 90%, at least 30 cases, five positive cases, and 20 negative cases. These are release prerequisites, not a claim of population accuracy.
- The same gate is enforced by the private DB repair function, preserving compare-and-swap, manual/risk protections, volume caps, and idempotency. An old runner cannot bypass it with `passed: true` alone.
- Historical gold labels have not been rewritten to force a pass. Current replay fails the strengthened gate. Automatic changes remain blocked until source-backed labels and sample coverage are sufficient.

## Operations

Operations > Classification Audit shows the latest 25 runs, quality metrics, block reasons, review candidates and actual changes, with 25-row pagination. Only verified admin/editor sessions may access the endpoint. Raw source records and private gold samples are not returned. Public snapshot and media-registry contracts are unchanged.

The source export and detailed CSV are private local artifacts under `out/classification-review-20260909`; they are not published to GitHub Pages. Missing body evidence does not clear existing company mentions or alerts. URLs rejected by the publisher cannot be counted as fully verified original articles.

## Verification

- Full Python tests, frontend tests and API authorization/contract tests.
- Browser checks at 1366, 1920 and 390 pixels: lazy loading, selected-run pagination, links, empty states, outage states and viewer access.
- No actual corrections is displayed as zero changes, never as a successful correction batch.
