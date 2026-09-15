# Source quality repair: 2026-09-15

## Verified incidents

- Article 266807 was a Google News result for an Electronic Times photo caption.
  Its decoded destination was `etnews.com/tools/image_popup.html`, not an article.
  The original article already exists as 260291 at
  https://www.etnews.com/20260910000223 (2026-09-10 13:26 KST).
  Keep the rejected record for audit, mark it excluded, retain its observed URL,
  and point to the original. Never send a new alert for this repair.
- Article 266488 is https://view.asiae.co.kr/article/2026091220053477949.
  Publisher metadata says 2026-09-14 10:45 KST, despite the date-looking URL.
  Discovery was 10:50 KST and the 13:00 archive contains it. Collection succeeded.
  Cached competitor/neutral classification and report selection were the problem.
  Source text explicitly discusses Incar's information-security staffing and
  investment limitations. Classify own/caution/review, not a confirmed breach.
  Correct the archived source excerpt from the collected source description,
  regenerate the existing report URL, and retain its original generation time.

## Prevention

- Reject image assets, image popup URLs, and strongly identified photo captions
  before deduplication and report selection. Preserve legitimate photo journalism
  and PDF disclosure links. Do not pick arbitrary links from aggregator HTML.
- Bound body-fetch attempts, including failures. Enrich insurance security-capacity
  articles where source context is needed. Never use generated summaries or search
  terms as risk evidence.
- Keep minimal classification/own-mention metadata in lightweight archives;
  never copy the full article body. Rank verified own caution/negative coverage
  before generic report references. Recompute all category totals consistently.
- Expand the existing service-only media verification queue to recent unresolved
  publishers regardless of company mention. Check 20 per briefing after delivery,
  using existing retry controls and a three-minute workflow budget.
- Resolve Google destinations in an optional subprocess (15-second timeout),
  not on the critical collection or Slack-delivery path. Pin googlenewsdecoder
  0.1.7; source: https://github.com/SSujitX/google-news-url-decoder.
- Accept Daum identity only with agreeing scoped copyright evidence, or three
  agreeing header/site/author signals when copyright is absent. Conflicting
  ownership is still unresolved. Support repeated copyright prefixes and a
  co-branded copyright domain only when it maps to the same known publisher.
- Save publisher audit artifacts separately from reporter availability.

## Reviewed data repairs

Thirteen unresolved records were corrected using original-page evidence or
verified publisher domains: 255751, 256012, 260164, 264024, 264469, 265264,
265267, 266571, 266580, 266597, 266846, 266862, 267473.
Publisher writes use updated-at compare-and-set and do not alter classification.
Record 261849 remains unresolved: the destination is an insurance intermediary's
republication page, with no verified original newsroom. Do not invent a publisher.

The broader daily classification maintenance is running but its automatic bulk
repair gate remains blocked (`reviewed_case_gate_failed`). This is distinct from
publisher verification. Its reviewed-corpus accuracy is insufficient and the
confirmed alert sample is too small. Do not lower this gate or claim that all
classification auto-repair is now healthy. The fixes above are narrow,
source-reviewed changes with regression tests, not an automatic rule promotion.

## Verification

- Python release/report regressions: 356 passed.
- Frontend: 169 passed; reference validation and Vite build passed.
- Live publisher queue: returns the bounded candidate list; execute permission
  remains service_role only (anon/authenticated false).
- Rendered the corrected September 14 13:00 report and asserted the Asiae URL
  is included. Photo popup captions are excluded before report metrics.
- Public browser verification also caught old reports using the rebuild time
  as their generation date. Pass the archive timestamp explicitly and preserve
  its Korean-time display when regenerating an existing report.
- Source-page checks were repeated with actual decoded Google/Daum destinations.
- No report notifications or negative alerts were sent during repair.

Migration note: PostgreSQL rejected the initial long regex repetition bound at
runtime; the subsequent corrective migration changes it to a supported bound.
The live candidate query and ACL were verified after that correction. Keep both
applied migrations in order so a fresh installation reaches the tested state.
