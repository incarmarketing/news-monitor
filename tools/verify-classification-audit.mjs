import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend/dist");
const output = path.join(root, "out/classification-ui");
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const file = path.resolve(dist, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
  if (!file.startsWith(`${dist}${path.sep}`)) return response.writeHead(403).end();
  try { response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = JSON.parse(await readFile(path.join(root, "out/classification-review-20260909/latest-report.json"), "utf8"));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const width of [1366, 1920, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [], auditRequests = [];
    let failure = false, empty = false;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem("marketing_pr_session_v1", JSON.stringify({ role: "admin", session_token: "local-test-only", session_expires_at: "2099-01-01T00:00:00Z" })));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("supabase.json")) return route.fulfill({ json: { url: "https://audit.test", anon_key: "public-test-key" } });
      if (url.pathname.endsWith("/dashboard-api")) {
        const body = route.request().postDataJSON();
        if (body.action === "classification_maintenance") {
          auditRequests.push(body.payload);
          if (failure) return route.fulfill({ status: 502, json: { error: "classification_audit_unavailable" } });
          const offset = body.payload.offset || 0;
          const rows = body.payload.mode === "repairs" || empty ? [] : body.payload.mode === "candidates" ? report.repair_candidates || [] : report.reviews;
          return route.fulfill({ json: { ok: true, data: { runs: empty ? [] : [report], run: empty ? null : report, items: rows.slice(offset, offset + 25), total: rows.length, offset, page_size: 25 } } });
        }
        if (body.action === "media_registry") return route.fulfill({ json: { ok: true, data: { media: [], unknown: [], reporters: [], own_articles: 0 } } });
        return route.fulfill({ json: { ok: true, data: [] } });
      }
      if (url.origin !== base || url.pathname.includes("/data/")) return route.fulfill({ json: {} });
      return route.continue();
    });
    await page.goto(`${base}/?section=dashboard`, { waitUntil: "networkidle" });
    assert.equal(auditRequests.length, 0);
    await page.goto(`${base}/?section=management`, { waitUntil: "networkidle" });
    assert.equal(auditRequests.length, 0, "no audit load before opening tab");
    await page.getByRole("button", { name: "분류 점검", exact: true }).click();
    const panel = page.locator(".classification-audit");
    await panel.locator(".audit-articles tbody tr").first().waitFor();
    assert.equal(await panel.locator(".audit-articles tbody tr").count(), 25);
    assert.match(await panel.innerText(), /자동 보정 보류/);
    await panel.getByRole("button", { name: "다음 페이지", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".audit-pagination")?.textContent.includes("26–50"));
    assert.equal(auditRequests.at(-1).run_id, report.run_id, "pagination pins the selected run");
    await panel.getByRole("button", { name: "실제 보정 이력", exact: true }).click();
    await panel.getByText("이 점검에서 실제로 변경한 기사가 없습니다.").waitFor();
    await panel.getByRole("button", { name: "재검토 후보", exact: true }).click();
    await panel.locator(".audit-articles tbody tr").nth(24).waitFor();
    assert.ok(await panel.locator(".audit-articles a").first().getAttribute("href"));
    await panel.screenshot({ path: path.join(output, `audit-${width}.png`) });
    const box = await panel.boundingBox();
    assert.ok(box.width <= width, "audit panel fits viewport");
    failure = true;
    await panel.getByRole("button", { name: "분류 점검 이력 새로고침", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    assert.equal(await panel.locator(".audit-summary").count(), 0, "failure cannot display successful old stats");
    failure = false; empty = true;
    await panel.getByRole("button", { name: "분류 점검 이력 새로고침", exact: true }).click();
    await panel.getByText("아직 등록된 분류 점검 이력이 없습니다.").waitFor();
    const requestCount = auditRequests.length;
    await page.evaluate(() => sessionStorage.setItem("marketing_pr_session_v1", JSON.stringify({ role: "viewer", session_token: "local-viewer-test", session_expires_at: "2099-01-01T00:00:00Z" })));
    await page.locator(".management-tabs").getByRole("button", { name: "광고비 관리", exact: true }).click();
    await page.locator(".management-tabs").getByRole("button", { name: "분류 점검", exact: true }).click();
    await panel.getByText("관리자 또는 편집자 로그인이 필요한 운영 기록입니다.").waitFor();
    assert.equal(auditRequests.length, requestCount, "viewer must not fetch private audit history");
    assert.deepEqual(errors, []);
    results.push({ width, errors: errors.length, checks: "lazy-load, pages, pin-run, changes, outage, empty, screenshot" });
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
