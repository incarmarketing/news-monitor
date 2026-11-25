import { displayHeadline, isPublisherPortal, UNKNOWN_PUBLISHER } from "./publisherIdentity.js";

const TRUNCATED = /(?:\.{3}|…)\s*$/;
const MIN_PREFIX_LENGTH = 30;
const normalize = value => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const prefix = value => normalize(value.replace(TRUNCATED, "")).replace(/[^\p{L}\p{N}]/gu, "");

function publicationMinute(row) {
  const value = String(row.pubDate || row.pub_date || "");
  if (!/(?:T|\s)\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? Math.floor(stamp / 60000) : null;
}

export function collapsePortalArticleAliases(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.source || row.source === UNKNOWN_PUBLISHER || isPublisherPortal(row.source)
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || "") || !/^https?:\/\//i.test(row.link || "")) continue;
    const title = displayHeadline(row);
    const entry = { row, title, normalized: normalize(title), prefix: prefix(title), truncated: TRUNCATED.test(title), minute: publicationMinute(row) };
    if (entry.normalized.length < 20) continue;
    const key = JSON.stringify([row.date, row.source]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const replacements = new Map();
  const removed = new Set();
  for (const entries of groups.values()) {
    const exact = new Map();
    const timed = new Map();
    for (const entry of entries.filter(item => !isPublisherPortal(item.row.link))) {
      if (!entry.truncated) {
        if (!exact.has(entry.normalized)) exact.set(entry.normalized, []);
        exact.get(entry.normalized).push(entry);
      }
      if (entry.minute !== null && entry.prefix.length >= MIN_PREFIX_LENGTH) {
        const key = `${entry.minute}:${entry.prefix.slice(0, MIN_PREFIX_LENGTH)}`;
        if (!timed.has(key)) timed.set(key, []);
        timed.get(key).push(entry);
      }
    }
    const matches = new Map();
    for (const portal of entries.filter(item => isPublisherPortal(item.row.link))) {
      const candidates = new Set(portal.truncated ? [] : exact.get(portal.normalized) || []);
      if (portal.minute !== null && portal.prefix.length >= MIN_PREFIX_LENGTH) {
        for (const original of timed.get(`${portal.minute}:${portal.prefix.slice(0, MIN_PREFIX_LENGTH)}`) || []) {
          if (portal.truncated === original.truncated) continue;
          const shorter = portal.truncated ? portal : original;
          const longer = portal.truncated ? original : portal;
          if (longer.prefix.startsWith(shorter.prefix)) candidates.add(original);
        }
      }
      if (candidates.size !== 1) continue;
      const original = [...candidates][0];
      if (!matches.has(original)) matches.set(original, []);
      matches.get(original).push(portal);
    }
    for (const [original, portals] of matches) {
      // A truncated original must not join two distinct follow-up headlines.
      const fullTitles = new Set(portals.filter(item => !item.truncated).map(item => item.normalized));
      if (original.truncated && fullTitles.size !== 1) continue;
      const aliases = new Map();
      for (const { row } of [original, ...portals]) {
        for (const alias of [...(row.articleAliases || []), ...(row === original.row ? [] : [{ articleHash: row.articleHash || row.id || "", link: row.link }])]) {
          aliases.set(`${alias.articleHash || ""}:${alias.link || ""}`, alias);
        }
      }
      const title = original.truncated ? portals.find(item => !item.truncated).title : original.row.title;
      replacements.set(original.row, { ...original.row, title, articleAliases: [...aliases.values()] });
      portals.forEach(item => removed.add(item.row));
    }
  }
  return rows.filter(row => !removed.has(row)).map(row => replacements.get(row) || row);
}
