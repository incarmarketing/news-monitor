# Alphabiz publisher resolution, 2026-09-10

## Confirmed cause

- Article: https://www.alphabiz.co.kr/news/articleView.html?idxno=183959
- Database ID: 259955; stored link was a Google RSS wrapper.
- RSS `source_url` was `https://www.alphabiz.co.kr`, while both the RSS name
  and preserved source were `alphabiz.co.kr`, not the publisher's Korean name.
- The shared domain registry omitted this domain. The byline worker had
  recorded `needs_original`, so the original page's copyright had not been read.
- A direct, bounded fetch confirms matching site metadata, NewsArticle
  publisher and article copyright: 알파경제. Author metadata: 김혜실.
- The existing HTML evidence parser succeeds without changes. The apparent
  Korean corruption in an initial terminal response was not a page decoding bug.

## Repair

- Added the exact domain to the registry shared by collector, archive,
  briefing renderer and frontend. No additional per-article request is needed.
- Added seven cross-language fixtures covering original/mobile links, RSS raw
  metadata, a title-domain suffix, preserved sources, lookalike-domain rejection
  and manual-override precedence.
- Added collection/archive/storage/repair and page/byline regression tests.
- Repaired the existing article source and saved matching page evidence in a
  locked transaction. Compared other article/raw fields before and after and
  aborted on any unintended change; category, tone, date and content stayed intact.
- Registered the verified domain in `press_aliases` and replaced `needs_original`
  with verified article byline evidence. No article was inserted or alert sent.

## Verification

- 56 Python publisher/byline tests passed.
- Full Python regression suite: 358 tests passed.
- 73 frontend publisher/media-registry tests passed.
- Frontend production build passed.
- Live snapshot API returned HTTP 200, source 알파경제, category `own`, tone
  `neutral`, with no warnings after the repair.

The Google wrapper link is retained for article identity. The original article
URL is stored as publisher and byline evidence, not inferred from unrelated links.
