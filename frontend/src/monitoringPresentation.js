import { displayHeadline, resolvePublisher } from "./publisherIdentity.js";

export const monitoringCategories = [
  { key: "own", label: "당사" },
  { key: "ga", label: "GA" },
  { key: "insurance", label: "보험업계" },
  { key: "policy", label: "정책" },
  { key: "sponsorship", label: "스폰서십" },
  { key: "other", label: "기타" },
  { key: "exclude", label: "제외" },
];

export function monitoringCategoryKey(value) {
  const category = String(value || "").trim().toLowerCase();
  if (["own", "당사"].includes(category)) return "own";
  if (["ga", "competitor", "경쟁사"].includes(category)) return "ga";
  if (["insurance", "industry", "보험사", "보험업계", "업계동향"].includes(category)) return "insurance";
  if (["policy", "regulation", "정책", "정책/규제"].includes(category)) return "policy";
  if (["sponsorship", "스폰서십"].includes(category)) return "sponsorship";
  if (["exclude", "제외"].includes(category)) return "exclude";
  return "other";
}

export function monitoringCategoryLabel(value) {
  return monitoringCategories.find(item => item.key === monitoringCategoryKey(value)).label;
}

export function monitoringCategoryCounts(rows) {
  const counts = Object.fromEntries(monitoringCategories.map(item => [item.key, 0]));
  for (const row of rows) counts[monitoringCategoryKey(row.category)] += 1;
  return counts;
}

export function monitoringDateRange(endDate, days) {
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(end.getTime()) || ![1, 7, 30].includes(days)) return null;
  end.setUTCDate(end.getUTCDate() - days + 1);
  return { startDate: end.toISOString().slice(0, 10), endDate };
}

export function monitoringPage(rows, page, size) {
  const pageSize = [10, 20, 50].includes(size) ? size : 10;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  const offset = (current - 1) * pageSize;
  return { current, pages, first: rows.length ? offset + 1 : 0, last: Math.min(offset + pageSize, rows.length), rows: rows.slice(offset, offset + pageSize) };
}

export function csvCell(value) {
  let text = String(value ?? "");
  // Spreadsheet apps must not execute article titles as formulas.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function monitoringCsv(rows) {
  const columns = ["날짜", "작성 시간", "논조", "분류", "기사 제목", "언론사", "원문 URL"];
  return "\uFEFF" + [columns, ...rows.map(row => [
    row.date || "", row.time || "", row.tone || "", monitoringCategoryLabel(row.category),
    displayHeadline(row), resolvePublisher(row), /^https?:\/\//i.test(row.link || "") ? row.link : "",
  ])].map(cells => cells.map(csvCell).join(",")).join("\r\n");
}
