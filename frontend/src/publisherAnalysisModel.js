import { collapsePortalArticleAliases } from "./articleAliases.js";
import { resolvePublisher } from "./publisherIdentity.js";
import { monitoringCategories, monitoringCategoryKey } from "./monitoringPresentation.js";

export const publisherToneColors = { "긍정":"#33805b", "중립":"#6675a0", "주의":"#bc781b", "부정":"#bc3e43", "제외":"#909995", "미분류":"#909995" };

export function publisherDateRange(endDate, days = 30) {
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(end.getTime()) || ![30,90].includes(days)) return null;
  end.setUTCDate(end.getUTCDate() - days + 1);
  return { startDate:end.toISOString().slice(0,10), endDate };
}

export function isOwnCoverage(row) {
  return row.aiContext?.ownMentioned === true || row.aiContext?.ownMentioned !== false && monitoringCategoryKey(row.category) === "own";
}

export function isDirectOwnNegative(row) {
  return row.tone === "부정" && isOwnCoverage(row) && row.aiContext?.negativeTarget === "own";
}

export function buildPublisherAnalysis(articles, publisher, range) {
  const unique = new Map();
  for (const row of articles || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || "") || row.date < range.startDate || row.date > range.endDate || resolvePublisher(row) !== publisher) continue;
    const key = row.link && row.link !== "#" ? row.link : row.articleHash || row.id;
    if (key && !unique.has(key)) unique.set(key, row);
  }
  const rows = collapsePortalArticleAliases([...unique.values()]).sort((a,b) => `${b.date} ${b.time || ""}`.localeCompare(`${a.date} ${a.time || ""}`));
  const counts = new Map(Object.keys(publisherToneColors).map(key => [key,0]));
  const categoryCounts = new Map(monitoringCategories.map(item => [item.key,0]));
  for (const row of rows) {
    const tone = counts.has(row.tone) ? row.tone : "미분류";
    counts.set(tone, counts.get(tone) + 1);
    const key = monitoringCategoryKey(row.category);
    categoryCounts.set(key, categoryCounts.get(key) + 1);
  }
  return {
    rows, total:rows.length, own:rows.filter(isOwnCoverage).length,
    directNegative:rows.filter(isDirectOwnNegative).length,
    latest:rows[0]?.date || "",
    tones:[...counts].filter(([,count]) => count).map(([key,count]) => ({key,label:key,count,color:publisherToneColors[key]})),
    categories:monitoringCategories.map(item => ({...item,count:categoryCounts.get(item.key)})).filter(item => item.count),
  };
}

export function filterPublisherArticles(rows, { tone = "", category = "", own = false, directNegative = false } = {}) {
  return rows.filter(row => (!tone || (publisherToneColors[row.tone] ? row.tone : "미분류") === tone)
    && (!category || monitoringCategoryKey(row.category) === category)
    && (!own || isOwnCoverage(row)) && (!directNegative || isDirectOwnNegative(row)));
}
