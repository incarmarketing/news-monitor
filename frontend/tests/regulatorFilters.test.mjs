import test from "node:test";
import assert from "node:assert/strict";
import { filterRegulatorArticles } from "../src/regulatorFilters.js";

const rows = [
  { title: "보험 소비자 민원", regulatorKeyword: "소비자보호", source: "금융감독원", tone: "주의" },
  { title: "보험 대리점 관리", regulatorKeyword: "판매채널/GA", source: "금융감독원", tone: "주의" },
  { title: "디지털 보안 강화", regulatorKeyword: "디지털/보안", source: "금융위원회", tone: "중립" },
];
test("regulator category filtering agrees with category counts and retains other filters", () => {
  const facets = filterRegulatorArticles(rows, { query: "보험", source: "금융감독원", tone: "주의" });
  assert.equal(facets.length, 2);
  assert.deepEqual(filterRegulatorArticles(facets, { keyword: "판매채널/GA" }), [rows[1]]);
  assert.deepEqual(filterRegulatorArticles(facets, { keyword: "all" }), facets);
  assert.deepEqual(filterRegulatorArticles(facets, { keyword: "디지털/보안" }), []);
});
