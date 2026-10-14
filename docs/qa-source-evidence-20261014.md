# Reviewed 14-day QA corrections (2026-10-14)

Scope: 1,602 records first discovered October 1-14 KST; current day partial.
Original-source checks: 72 attempted, 65 verified, seven unverified.

## Runtime fixes

- Replace title, metadata description, body, content, and nested raw source fields
  together when rechecking an original. Previous content must not contaminate a
  fresh scoped body.
- Distinguish a zero/improving incomplete-sales rate from an actual harm event.
  Independent sanctions, fraud, legal actions, and worsening rates still alert.
- Preserve a bounded verbatim evidence sentence only when it was matched inside
  a verified DOM/RSS body. Bind it to the article title/link and body digest.
  Metadata-only sources still do not persist their full body or description.
- Reuse verified source evidence before checking cached classifications; stale
  verdicts are recalculated under the current ruleset.
- Prefer current verified DB source evidence over unverified text in older
  archive files during a manual archive re-sync.
- Rehydrate historical alert-state rows using verified DB evidence and filter
  them through the current direct-risk contract before persisting them again.
- Canonicalize only recognized FSS/FSC post URLs. Keep post identifiers and omit
  variable pagination/search parameters; unrelated article URLs are unchanged.

## Reviewed database changes

Reviewed scope, no blanket reclassification:

- Company mention false positives: 292890, 311579.
- Quality-statistic false negative-tone/alert classification: 296076.
- Original-backed alert context recovery: 303288, 304242, 304301, 304441,
  305500, 312277.

Repairs use a bounded transaction, compare-and-set against the observed row,
manual-feedback protection, a locked rules snapshot, and a private backup ledger.
Original IDs, URLs, publication/discovery times, and notification history remain
unchanged. No correction announcement is sent.

Any additional delivery must use the existing Slack destination and duplicate
checks. Historical QA corrections are not automatically treated as new incidents.
