import assert from "node:assert/strict";
import test from "node:test";
import { brandEventEvidence, coalesceMediaEvents, mediaArticleDate, mediaArticleKey, mediaArticleUrl, mediaIssueArticles, mediaIssuePage, mediaIssuesMeta } from "../src/mediaIssueModel.js";

const row = (id, extra = {}) => ({ title: `보험 보도 ${id}`, source: "보험저널", link: `https://example.com/news/${id}`, date: "2026-11-11", time: `${String(id % 24).padStart(2, "0")}:30`, ...extra });
const brand = (id, extra = {}) => row(id, { title: "독립 보험대리점 브랜드평판 2026년 11월…1위 인카금융서비스, 2위 에이플러스에셋, 3위 프라임에셋", summary: "한국기업평판연구소가 발표했다.", ...extra });
const group = (...rows) => ({ ...rows[0], relatedArticles: rows });

test("all 72 related articles are reachable in ten-row pages without mutating input", () => {
  const rows = Array.from({ length: 72 }, (_, i) => row(i));
  const before = [...rows];
  const seen = new Set();
  for (let page = 1; page <= 8; page++) {
    const result = mediaIssuePage(rows, { page });
    assert.equal(result.pages, 8);
    result.rows.forEach(item => seen.add(mediaArticleKey(item)));
    assert.equal(result.rows.length, page === 8 ? 2 : 10);
  }
  assert.equal(seen.size, 72);
  assert.deepEqual(rows, before);
  assert.equal(mediaIssuePage(rows, { page: 99 }).current, 8);
});

test("related article search covers cleaned headlines and publisher names and clamps empty pages", () => {
  const rows = [row(1, { title: "보험 영업 제도 개편 - 보험저널" }), row(2, { source: "이데일리", title: "수수료 공개" })];
  assert.equal(mediaIssuePage(rows, { query: "이데일리", page: 8 }).total, 1);
  assert.equal(mediaIssuePage(rows, { query: "제도 개편" }).total, 1);
  assert.deepEqual(mediaIssuePage(rows, { query: "없는 기사", page: 8 }), { rows: [], total: 0, pages: 1, current: 1, start: 0, end: 0 });
});

test("date-only articles never invent a publication time and unknown dates sort last", () => {
  assert.equal(mediaArticleDate(row(1, { time: "", pubDate: "2026-11-11T00:00:00Z" })), "2026-11-11");
  assert.equal(mediaArticleDate({ pub_date: "2026-11-11T02:28:00Z" }), "2026-11-11 11:28");
  assert.equal(mediaArticleDate({ pub_date: "2026-11-11" }), "2026-11-11");
  const unknown = row(3, { date: "", time: "" });
  for (const sort of ["latest", "oldest"]) assert.equal(mediaIssuePage([unknown, row(1)], { sort }).rows.at(-1), unknown);
});

test("article identities remove tracking and fragments but preserve publisher paths and custom ports", () => {
  assert.equal(mediaArticleKey(row(1, { link: "http://www.example.com/a?id=2&utm_source=google#top" })), mediaArticleKey(row(1, { link: "https://example.com/a?id=2" })));
  assert.notEqual(mediaArticleKey(row(1)), mediaArticleKey(row(2)));
  assert.notEqual(mediaArticleKey(row(1)), mediaArticleKey(row(1, { link: "https://example.com:8080/news/1" })));
  for (const link of ["javascript:alert(1)", "ahttps:unsafe", "file:///a", ""]) assert.equal(mediaArticleUrl({ link }), "");
});

test("issue counts include representatives exactly once and do not trust stale cluster counts", () => {
  const a = row(1), b = row(2);
  assert.equal(mediaIssueArticles({ relatedArticles: [a, a, b] }).length, 2);
  assert.equal(mediaIssuesMeta([{ ...a, relatedCount: 99, relatedArticles: [a, b] }, { ...b, relatedArticles: [b] }]), "이슈 2개 · 기사 2건");
});

test("same GA ranking announcement joins explicit and independently corroborated headlines", () => {
  const anchor = brand(1);
  const short = brand(2, { title: "인카금융서비스, 11월 GA 평판 1위 '독주'…에이플러스에셋 '2위 탈환'", summary: "독립 보험대리점 업계 소식" });
  const full = brand(3, { summary: "1위 인카금융서비스, 2위 에이플러스에셋, 3위 프라임에셋" });
  const input = [group(anchor), group(short), group(full), group(row(4))];
  const before = JSON.stringify(input);
  const output = coalesceMediaEvents(input);
  assert.equal(output.length, 2);
  assert.equal(output[0].relatedArticles.length, 3);
  assert.equal(output[0].eventKey, "ga-brand:2026-11:한국기업평판연구소");
  assert.equal(JSON.stringify(input), before);
});

test("a survey window mentioning October does not override the November headline", () => {
  const evidence = brandEventEvidence(brand(1, { summary: "한국기업평판연구소는 지난 10월 11일부터 11월까지 분석했다." }));
  assert.equal(evidence.base, "ga-brand:2026-11");
});

test("different months and institutions split even a previously overbroad group", () => {
  const november = brand(1), october = brand(2, { title: brand(2).title.replace("11월", "10월") });
  const other = brand(3, { summary: "별도평판연구소가 발표했다." });
  const result = coalesceMediaEvents([group(november, october, other)]);
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.relatedArticles.length === 1));
  assert.equal(new Set(result.map(item => item.eventKey)).size, 3);
});

test("missing evidence, conflicting results and competing issuer anchors cannot silently join", () => {
  const anchor = brand(1), other = brand(2, { summary: "별도평판연구소가 발표했다." });
  const noIssuer = brand(3, { summary: "기사 제목만 수집됨" });
  assert.equal(coalesceMediaEvents([group(anchor), group(other), group(noIssuer)]).length, 3);
  const conflict = brand(4, { title: "독립 보험대리점 2026년 11월 브랜드평판…1위 인카금융서비스, 2위 한화생명금융서비스", summary: "" });
  assert.equal(coalesceMediaEvents([group(anchor), group(conflict)]).length, 2);
  const noRanks = brand(5, { title: "11월 GA 브랜드평판 현황", summary: "" });
  assert.equal(coalesceMediaEvents([group(anchor), group(noRanks)]).length, 2);
});

test("insurer rankings and ambiguous months are not treated as a GA announcement", () => {
  assert.equal(brandEventEvidence(brand(1, { title: "생명보험 2026년 11월 브랜드평판 1위 인카금융서비스" })), null);
  assert.equal(brandEventEvidence(brand(1, { title: "10월과 11월 GA 브랜드평판 비교" })), null);
  assert.equal(brandEventEvidence({ title: "11월 GA 브랜드평판 1위 인카금융서비스" }), null);
  assert.notEqual(brandEventEvidence(brand(1, { title: brand(1).title.replace("2026", "2025") })).base, brandEventEvidence(brand(2)).base);
});

test("adverse stories mentioning a ranking remain separate even in an old mixed cluster", () => {
  const anchor = brand(1);
  for (const risk of [brand(2, { tone: "부정" }), brand(3, { title: "11월 GA 브랜드평판 1위 인카금융서비스, 보험사기 제재 의혹" })]) {
    assert.equal(brandEventEvidence(risk), null);
    const output = coalesceMediaEvents([group(anchor, risk)]);
    assert.equal(output.length, 2);
    assert.ok(output.every(item => item.relatedArticles.length === 1));
    assert.equal(risk.title, output.find(item => !item.eventKey).relatedArticles[0].title);
  }
});
