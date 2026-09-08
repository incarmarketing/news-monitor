import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadOperationalData, normalizeOperationalStatusPayload } from "../src/liveData.js";
import { classifyDashboardArticleSeries } from "../src/dashboardRisk.js";

test("failed article requests must not look like a successful empty snapshot", () => {
  for (const warning of ["articles_request_failed", "articles_503"]) {
    assert.throws(() => normalizeOperationalStatusPayload({
      ok: true, data: { articles: [], report_runs: [] }, warnings: [warning],
    }), /snapshot_articles_failed/);
  }
  assert.deepEqual(normalizeOperationalStatusPayload({ data: { articles: [] }, warnings: [] }).articles, []);
});

test("database outage uses the published current-day backup, retaining its real timestamp", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} };
  globalThis.window = { setTimeout, clearTimeout };
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; globalThis.sessionStorage = originalStorage; });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push(String(url));
    if (String(url).endsWith("supabase.json")) {
      return Response.json({ url: "https://db.example", anon_key: "public-test-key" });
    }
    if (String(url).endsWith("/dashboard-api")) {
      assert.equal(JSON.parse(options.body).action, "snapshot");
      return Response.json({ ok: true, data: { articles: [], report_runs: [] }, warnings: ["articles_request_failed"] });
    }
    if (String(url).includes("operations.json")) {
      return Response.json({
        generated_at: "2026-09-08T08:12:21+09:00", articles_generated_at: "2026-09-08T08:12:21+09:00",
        articles: [{ id: "today", date: "2026-09-08", pub_date: "2026-09-08T07:03:00+09:00", title: "사이버보험 필요성", summary: "KB손해보험의 개인정보배상책임보험", category: "competitor", tone: "neutral" }],
        report_runs: [{ report_date: "2026-09-08", report_slot: "08" }],
      });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const data = await loadOperationalData({ profile: "core" });
  assert.equal(data.status, "live", data.message);
  assert.equal(data.source, "static");
  assert.equal(data.articles[0].date, "2026-09-08");
  assert.equal(data.articles[0].category, "보험사");
  assert.equal(data.reportRuns[0].date, "2026-09-08");
  assert.equal(data.generatedAt, "2026-09-08T08:12:21+09:00");
  assert.deepEqual(data.dataLoadWarnings, ["database_unavailable"]);
  assert.ok(!requests.some(url => url.includes("/rest/v1/news_articles")));
});

test("insurer mentions are not insurance-agency evidence", () => {
  const article = { title: "3954만개 계정 털린 티빙도 의무보험뿐…커지는 사이버보험 필요성", summary: "KB손해보험이 판매하는 개인정보배상책임보험", category: "GA", aiContext: { category: "competitor" } };
  assert.equal(classifyDashboardArticleSeries(article), "insurance");
  assert.equal(classifyDashboardArticleSeries({ ...article, title: "KB손해보험, GA 보험대리점 교육 지원" }), "ga");
  assert.equal(classifyDashboardArticleSeries({ ...article, title: "한화생명금융서비스 영업 전략" }), "ga");
  assert.equal(classifyDashboardArticleSeries({ ...article, aiContext: { category: "regulation" } }), "regulation");
});

test("edge snapshot rejects failed article queries even when an empty array was allocated", () => {
  const source = readFileSync(new URL("../../supabase/functions/dashboard-api/index.ts", import.meta.url), "utf8");
  assert.match(source, /!Array\.isArray\(data\.articles\) \|\| warnings\.some/);
});
