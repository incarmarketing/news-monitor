import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://your-github-id.github.io/your-repo/";
const rawBaseUrl = process.env.LINK_QA_BASE_URL || DEFAULT_BASE_URL;
const outDir = process.env.LINK_QA_OUT || ".qa/links";
const requireNotifications = /^true|1|yes|on$/i.test(process.env.LINK_QA_REQUIRE_NOTIFICATIONS || "");

const rootUrl = normalizeRootUrl(rawBaseUrl);
const rootHost = rootUrl.host;
const rootPath = rootUrl.pathname.endsWith("/") ? rootUrl.pathname : `${rootUrl.pathname}/`;
const failures = [];
const checks = [];

function normalizeRootUrl(value) {
  const url = new URL(value);
  if (url.pathname.endsWith(".html")) {
    url.pathname = url.pathname.replace(/[^/]+$/, "");
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  url.search = "";
  url.hash = "";
  return url;
}

function siteUrl(relativePath) {
  const clean = String(relativePath || "").replace(/^\//, "");
  return new URL(clean, rootUrl).toString();
}

function cacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("qa", Date.now().toString());
  return parsed.toString();
}

function pushFailure(kind, detail) {
  failures.push({ kind, ...detail });
}

function isLocalLink(value) {
  const lowered = String(value || "").toLowerCase();
  return lowered.includes("localhost") ||
    lowered.includes("127.0.0.1") ||
    lowered.includes("::1") ||
    lowered.startsWith("file:");
}

function isInternalUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.host === rootHost && parsed.pathname.startsWith(rootPath);
  } catch {
    return false;
  }
}

function normalizeLink(value, currentUrl = rootUrl.toString()) {
  return new URL(String(value || ""), currentUrl).toString();
}

async function fetchText(url, label) {
  const response = await fetch(cacheBust(url), { redirect: "follow" });
  checks.push({ label, url, status: response.status });
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  return JSON.parse(text);
}

function notificationDateSlot(row) {
  const title = String(row.title || "");
  const link = String(row.link_url || row.link || "");
  const titleMatch = title.match(/(20\d{2}-\d{2}-\d{2})\s+(\d{2})/);
  if (titleMatch) return { date: titleMatch[1], slot: titleMatch[2] };
  const linkMatch = link.match(/\/reports\/daily\/(20\d{2}-\d{2}-\d{2})-(\d{2})\.html/);
  if (linkMatch) return { date: linkMatch[1], slot: linkMatch[2] };
  return null;
}

function validateNotification(row) {
  const id = row.id || "";
  const type = String(row.message_type || row.type || "");
  const title = String(row.title || "");
  const link = String(row.link_url || row.link || "").trim();
  if (String(row.status || "").toLowerCase() !== "success") return;
  if (!link) {
    pushFailure("notification_link_missing", { id, type, title });
    return;
  }
  if (isLocalLink(link)) {
    pushFailure("notification_link_local", { id, type, title, link });
    return;
  }

  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    pushFailure("notification_link_invalid", { id, type, title, link });
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    pushFailure("notification_link_protocol", { id, type, title, link });
    return;
  }

  if (type.includes("daily")) {
    const slot = notificationDateSlot(row);
    if (!slot) {
      pushFailure("daily_notification_title_missing_slot", { id, title, link });
      return;
    }
    const expectedPath = `${rootPath}reports/daily/${slot.date}-${slot.slot}.html`;
    if (parsed.host !== rootHost || parsed.pathname !== expectedPath) {
      pushFailure("daily_notification_link_mismatch", { id, title, link, expectedPath });
    }
    return;
  }

  if (type.includes("negative")) {
    if (parsed.host !== rootHost || parsed.pathname !== `${rootPath}dashboard.html`) {
      pushFailure("negative_notification_not_dashboard", { id, title, link });
    }
    if (parsed.searchParams.get("section") !== "monitoring") {
      pushFailure("negative_notification_missing_monitoring_section", { id, title, link });
    }
    return;
  }

  if (type.includes("ai_usage")) {
    const allowed = new Set(["aistudio.google.com", "console.groq.com"]);
    if (!allowed.has(parsed.host)) {
      pushFailure("ai_usage_link_unexpected_host", { id, title, link });
    }
  }
}

function collectReportUrls(data, notifications) {
  const urls = new Map();
  const reportRuns = Array.isArray(data.report_runs) ? data.report_runs : [];
  const latestReportDate = reportRuns
    .map((row) => String(row.report_date || "").slice(0, 10))
    .filter((date) => /^20\d{2}-\d{2}-\d{2}$/.test(date))
    .sort()
    .pop();
  for (const row of reportRuns) {
    const date = String(row.report_date || "").slice(0, 10);
    const slot = String(row.report_slot || "").padStart(2, "0");
    if (latestReportDate && date !== latestReportDate) continue;
    if (/^20\d{2}-\d{2}-\d{2}$/.test(date) && ["08", "13", "18"].includes(slot)) {
      urls.set(`${date}-${slot}`, siteUrl(`reports/daily/${date}-${slot}.html`));
    }
  }
  for (const row of notifications) {
    const slot = notificationDateSlot(row);
    if (slot) {
      urls.set(`${slot.date}-${slot.slot}`, siteUrl(`reports/daily/${slot.date}-${slot.slot}.html`));
    }
  }
  return Array.from(urls.entries()).slice(0, 16);
}

function validateReportDashboardLinks(html, reportUrl, key) {
  if (html.includes('href="./dashboard.html"')) {
    pushFailure("report_uses_relative_dashboard_link", { key, reportUrl });
  }
  if (html.includes("/reports/daily/dashboard.html")) {
    pushFailure("report_uses_nested_dashboard_link", { key, reportUrl });
  }

  const hrefs = Array.from(html.matchAll(/href=(["'])(.*?)\1/gi)).map((match) => match[2]);
  const dashboardHrefs = hrefs.filter((href) => href.includes("dashboard.html"));
  if (!dashboardHrefs.length) {
    pushFailure("report_dashboard_link_missing", { key, reportUrl });
    return;
  }

  for (const href of dashboardHrefs) {
    const resolved = normalizeLink(href, reportUrl);
    const parsed = new URL(resolved);
    if (parsed.host !== rootHost || parsed.pathname !== `${rootPath}dashboard.html`) {
      pushFailure("report_dashboard_link_wrong_target", { key, reportUrl, href, resolved });
    }
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const dashboardUrl = siteUrl("dashboard.html");
  await fetchText(dashboardUrl, "dashboard");
  await fetchText(siteUrl("dashboard.html?section=monitoring&query=link-qa"), "dashboard-monitoring-query");
  await fetchText(siteUrl("weekly.html"), "weekly-report");
  await fetchText(siteUrl("monthly.html"), "monthly-report");

  const data = await fetchJson(siteUrl("data/articles.json"), "dashboard-data");
  const notifications = (Array.isArray(data.notifications) ? data.notifications : []).slice(0, 50);
  if (requireNotifications && !notifications.length) {
    pushFailure("notification_history_empty", { message: "data/articles.json has no notification rows" });
  }

  for (const row of notifications) {
    validateNotification(row);
    const link = String(row.link_url || row.link || "").trim();
    if (link && isInternalUrl(link)) {
      await fetchText(link, `notification-${row.id || row.title || "link"}`);
    }
  }

  const reports = collectReportUrls(data, notifications);
  for (const [key, url] of reports) {
    const html = await fetchText(url, `daily-report-${key}`);
    validateReportDashboardLinks(html, url, key);
  }

  const summary = {
    baseUrl: rootUrl.toString(),
    generatedAt: new Date().toISOString(),
    notificationCount: notifications.length,
    reportCount: reports.length,
    checks,
    failures,
    status: failures.length ? "fail" : "ok",
  };
  const summaryPath = path.join(outDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  for (const check of checks) {
    console.log(`OK ${check.label} ${check.status} ${check.url}`);
  }
  for (const failure of failures) {
    console.error(`FAIL ${failure.kind} ${JSON.stringify(failure)}`);
  }

  if (failures.length) {
    console.error(`Link QA failed. See ${summaryPath}.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
