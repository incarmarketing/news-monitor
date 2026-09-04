import registry from "../../publisher_registry.json" with { type: "json" };

export const UNKNOWN_PUBLISHER = "언론사 확인 필요";
const portals = new Set(registry.portal_names.map((name) => name.toLowerCase()));
const known = new Set([...Object.values(registry.domains), ...Object.values(registry.name_aliases), ...registry.known_names]);
const clean = (value) => String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

export function publisherHost(value) {
  const raw = clean(value).replace(/[./]+$/, "").toLowerCase();
  if (!raw || raw.includes(" ") || !raw.includes(".")) return "";
  try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "").replace(/\.$/, ""); }
  catch { return ""; }
}

export function isPublisherPortal(value) {
  const host = publisherHost(value);
  return portals.has(clean(value).toLowerCase()) || registry.portal_domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function validName(value) {
  const raw = clean(value);
  const name = registry.name_aliases[raw] || raw;
  if (!name || isPublisherPortal(name) || [UNKNOWN_PUBLISHER, "언론사 확인", "미확인", "출처 확인"].includes(name)) return "";
  if (known.has(name)) return name;
  return publisherHost(name) || name.length > 40 || /[<>{}]|https?:\/\//.test(name) ? "" : name;
}

function fromDomain(value, mapping = registry.domains) {
  const host = publisherHost(value);
  if (!host || isPublisherPortal(host)) return "";
  return mapping[host] || (host.startsWith("m.") ? mapping[host.slice(2)] : "") || "";
}

function fromTitle(title) {
  const text = clean(title);
  const suffix = text.match(/\s[-–]\s([^-–\n|]{2,60})$/)?.[1];
  const candidates = suffix ? [suffix] : [];
  const bracket = text.match(/^\[([^\]]{2,30})\]/)?.[1];
  const bracketName = fromDomain(bracket) || registry.name_aliases[bracket] || bracket;
  if (known.has(bracketName)) candidates.push(bracketName);
  for (const candidate of candidates) {
    const mapped = fromDomain(candidate);
    if (mapped) return mapped;
    const name = validName(candidate);
    if (known.has(name)) return name;
    if (name && name.length <= 20 && !/기자|특파원|단독|종합|속보|기획/.test(name) && /(뉴스|신문|경제|일보|저널|매일|타임스|투데이|데일리|포스트|방송|스포츠|신보|이슈|프레스)$/.test(name)) return name;
  }
  return "";
}

export function resolvePublisher(article = {}, aliasRows = []) {
  const raw = article.raw || {};
  const source = article.source || raw.source || raw.source_raw || "";
  const sourceUrl = article.source_url || raw.source_url;
  const link = article.link || raw.link;
  const aliases = Object.fromEntries(aliasRows.map((row) => [publisherHost(row.host), validName(row.press_name || row.pressName)]).filter(([, name]) => name));
  for (const value of [sourceUrl, link, source]) {
    const name = fromDomain(value, aliases);
    if (name) return name;
  }
  for (const value of [sourceUrl, link, source]) {
    const name = fromDomain(value);
    if (name) return name;
  }
  return validName(article.rss_source_name || raw.rss_source_name) || validName(source) || fromTitle(article.title || raw.title) || UNKNOWN_PUBLISHER;
}
