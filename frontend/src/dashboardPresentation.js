export const dashboardSeries = [
  { key: "own", color: "#245bd7", label: "당사" },
  { key: "ga", color: "#008d78", label: "GA" },
  { key: "insurance", color: "#ee4051", label: "보험사" },
  { key: "regulation", color: "#ed9209", label: "정책/규제" },
];

export function reportSlotPresentation(health) {
  const slots = Array.isArray(health?.slots) ? health.slots : [];
  return ["08", "13", "18"].map((hour) => {
    const found = slots.find((slot) => String(slot.slot).padStart(2, "0") === hour);
    return found || { slot: hour, status: "unknown", state: "확인 중" };
  });
}

export function latestDeliveryLabel(health) {
  return String(health?.meta || "").match(/최신\s+([^·]+)/)?.[1]?.trim() || "미확인";
}

export function articleClock(issue, timestamp) {
  const time = String(issue?.time || "");
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return time;
  // Sorting falls back to midnight for date-only records; do not display that as a known time.
  const published = String(issue?.pubDate || issue?.pub_date || "");
  if (!/\d{1,2}:\d{2}/.test(published)) return "-";
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Seoul" }).format(timestamp);
}

export function priorityDisplayRows(issues, articles) {
  const byLink = new Map();
  for (const article of articles) {
    if (article.link && article.link !== "#") byLink.set(article.link, article);
  }
  return issues.map(issue => {
    const original = byLink.get(issue.link);
    if (!original) return issue;
    // Enrich presentation only. Ranking, grouping, tone and category stay unchanged.
    return { ...issue, title: original.title || issue.title,
      time: original.time || issue.time, date: original.date || issue.date,
      pubDate: original.pubDate || original.pub_date || issue.pubDate || issue.pub_date };
  });
}
