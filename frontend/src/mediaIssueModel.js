import { collapsePortalArticleAliases } from "./articleAliases.js";
import { displayHeadline, resolvePublisher } from "./publisherIdentity.js";

export function mediaArticleUrl(article = {}) {
  try {
    const url = new URL(article.link || article.url || "");
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function mediaArticleKey(article = {}) {
  const href = mediaArticleUrl(article);
  if (href) {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.hash = "";
    url.searchParams.sort();
    return `${url.host.replace(/^www\./, "")}${url.pathname}${url.search}`;
  }
  return article.articleHash || article.article_hash || article.id || JSON.stringify([article.date, article.source, article.title]);
}

export function mediaIssueArticles(issue = {}) {
  const rows = issue.relatedArticles?.length ? issue.relatedArticles : [issue];
  const unique = new Map();
  for (const row of collapsePortalArticleAliases(rows)) {
    if (!row?.title) continue;
    const key = mediaArticleKey(row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export function mediaArticleDate(article = {}) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(article.date || "")) return [article.date, /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(article.time || "") ? article.time : ""].filter(Boolean).join(" ");
  const absolute = article.pubDate || article.pub_date;
  if (/(?:T|\s)\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(absolute || "") && Number.isFinite(Date.parse(absolute))) return new Date(absolute).toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false }).slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(absolute || "")) return absolute;
  return "날짜 미확인";
}

export function mediaIssuePage(rows, { query = "", sort = "latest", page = 1, size = 10 } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  const selected = rows.filter(row => !needle || `${displayHeadline(row)} ${resolvePublisher(row)}`.toLocaleLowerCase().includes(needle));
  selected.sort((a, b) => {
    const aDate = mediaArticleDate(a), bDate = mediaArticleDate(b);
    const missingA = aDate === "날짜 미확인", missingB = bDate === "날짜 미확인";
    if (missingA !== missingB) return missingA ? 1 : -1;
    const delta = aDate.localeCompare(bDate);
    return (sort === "oldest" ? delta : -delta) || mediaArticleKey(a).localeCompare(mediaArticleKey(b));
  });
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(size) || 10)));
  const pages = Math.max(1, Math.ceil(selected.length / limit));
  const current = Math.max(1, Math.min(pages, Number(page) || 1));
  return { rows: selected.slice((current - 1) * limit, current * limit), total: selected.length, pages, current, start: selected.length ? (current - 1) * limit + 1 : 0, end: Math.min(current * limit, selected.length) };
}

export function mediaIssuesMeta(issues = []) {
  const keys = new Set(issues.flatMap(issue => mediaIssueArticles(issue).map(mediaArticleKey)));
  return `이슈 ${issues.length}개 · 기사 ${keys.size.toLocaleString("ko-KR")}건`;
}

const names = [
  ["인카금융서비스", "인카금융서비스|인카금융|인카"], ["에이플러스에셋", "에이플러스에셋|에이플러스"],
  ["프라임에셋", "프라임에셋"], ["한화생명금융서비스", "한화생명금융서비스"],
  ["글로벌금융판매", "글로벌금융판매"], ["지에이코리아", "지에이코리아|GA코리아"],
];
const canonicalName = value => names.find(([, pattern]) => new RegExp(`^(?:${pattern})$`, "i").test(value))?.[0] || "";
const namePattern = names.map(([, pattern]) => pattern).join("|");
const rankPatterns = [1, 2, 3].map(rank => [new RegExp(`${rank}\\s*위\\s*(${namePattern})`, "i"), new RegExp(`(${namePattern})(?:(?![1-3]\\s*위).){0,28}?${rank}\\s*위`, "i")]);

function isSeparateBrandRisk(article = {}) {
  const title = String(article.title || "");
  return /브랜드\s*평판|GA\s*평판/i.test(title) && (["부정", "negative"].includes(article.tone)
    || /보험사기|횡령|제재|불법|과징금|영업정지|압수수색|기소|유출|논란|의혹|적자/.test(title));
}

export function brandEventEvidence(article = {}) {
  const title = displayHeadline(article).normalize("NFKC");
  const summary = String(article.summary || article.description || "").slice(0, 800).normalize("NFKC");
  if (isSeparateBrandRisk(article)) return null;
  if (!/브랜드\s*평판|GA\s*평판/i.test(title) || !/보험대리점|\bGA\b/i.test(title)) return null;
  const monthText = /\d{1,2}\s*월/.test(title) ? title : summary;
  const months = [...new Set([...monthText.matchAll(/(?:^|[^\d])(1[0-2]|0?[1-9])\s*월/g)].map(match => Number(match[1])))];
  if (months.length !== 1) return null;
  const month = months[0];
  const explicitYear = monthText.match(/(20\d{2})\s*년\s*\d{1,2}\s*월/)?.[1];
  const published = mediaArticleDate(article).match(/^(20\d{2})-(\d{2})/);
  if (!explicitYear && !published) return null;
  const year = Number(explicitYear || published[1]) - (!explicitYear && month > Number(published[2]) ? 1 : 0);
  const text = `${title} ${summary}`;
  const issuer = text.includes("한국기업평판연구소") ? "한국기업평판연구소" : text.match(/([가-힣A-Za-z]{2,24}(?:연구소|연구원|평가원))/)?.[1] || "";
  const ranks = rankPatterns.map(patterns => canonicalName(patterns.map(pattern => text.match(pattern)?.[1]).find(Boolean) || ""));
  const ordered = summary.split(/전체\s*순위는/)[1];
  if (ordered && ranks.filter(Boolean).length < 2) {
    const order = [...ordered.matchAll(new RegExp(namePattern, "g"))].map(match => canonicalName(match[0]));
    [...new Set(order)].slice(0, 3).forEach((name, index) => { if (!ranks[index]) ranks[index] = name; });
  }
  return { base: `ga-brand:${year}-${String(month).padStart(2, "0")}`, issuer, ranks, label: `${year}년 ${month}월 독립 보험대리점 브랜드평판` };
}

export function coalesceMediaEvents(groups = []) {
  const partitions = [];
  for (const group of groups) {
    const original = group.relatedArticles?.length ? group.relatedArticles : [group];
    const members = original.filter(member => !isSeparateBrandRisk(member));
    original.filter(isSeparateBrandRisk).forEach(member => partitions.push({ group: { ...member, relatedArticles: [member] } }));
    if (!members.length) continue;
    const evidence = members.map(brandEventEvidence);
    const bases = [...new Set(evidence.filter(Boolean).map(item => item.base))];
    if (!bases.length) { partitions.push({ group: members.length === original.length ? group : { ...group, relatedArticles: members } }); continue; }
    for (const base of bases) {
      const relatedArticles = members.filter((_, index) => evidence[index]?.base === base || (bases.length === 1 && !evidence[index]));
      const matching = evidence.filter(item => item?.base === base);
      const issuers = [...new Set(matching.map(item => item.issuer).filter(Boolean))];
      if (issuers.length > 1) {
        for (const issuer of issuers) partitions.push({ group: { ...group, relatedArticles: members.filter((_, index) => evidence[index]?.base === base && evidence[index].issuer === issuer) }, evidence: matching.filter(item => item.issuer === issuer) });
        const unknown = relatedArticles.filter(member => !brandEventEvidence(member)?.issuer);
        if (unknown.length) partitions.push({ group: { ...group, relatedArticles: unknown } });
      } else partitions.push({ group: { ...group, relatedArticles }, evidence: matching });
    }
    if (bases.length > 1) {
      const unknown = members.filter((_, index) => !evidence[index]);
      if (unknown.length) partitions.push({ group: { ...group, relatedArticles: unknown } });
    }
  }
  const anchors = new Map();
  for (const partition of partitions) for (const item of partition.evidence || []) {
    if (!item.issuer || !item.ranks[0] || !item.ranks[1]) continue;
    const key = JSON.stringify([item.base, ...item.ranks.slice(0, 2)]);
    if (!anchors.has(key)) anchors.set(key, new Map());
    const issuers = anchors.get(key);
    if (!issuers.has(item.issuer)) issuers.set(item.issuer, new Set());
    issuers.get(item.issuer).add(item.ranks[2]);
  }
  const merged = new Map();
  const output = [];
  for (const partition of partitions) {
    const evidence = partition.evidence || [];
    const issuers = [...new Set(evidence.map(item => item.issuer).filter(Boolean))];
    let issuer = issuers.length === 1 ? issuers[0] : "";
    if (!issuers.length && evidence.length) {
      // Missing issuer text can join only an unambiguous, explicitly sourced result with two matching ranks.
      const matches = new Set();
      for (const item of evidence) {
        const verified = anchors.get(JSON.stringify([item.base, ...item.ranks.slice(0, 2)]));
        for (const [name, thirdRanks] of verified || []) if (!item.ranks[2] || thirdRanks.has("") || thirdRanks.has(item.ranks[2])) matches.add(name);
      }
      const candidates = [...matches];
      if (candidates.length === 1) issuer = candidates[0];
    }
    if (!issuer || !evidence.length) { output.push(partition.group); continue; }
    const eventKey = `${evidence[0].base}:${issuer}`;
    const previous = merged.get(eventKey);
    if (previous) previous.relatedArticles.push(...partition.group.relatedArticles);
    else {
      const group = { ...partition.group, relatedArticles: [...partition.group.relatedArticles], eventKey, eventLabel: evidence[0].label };
      merged.set(eventKey, group); output.push(group);
    }
  }
  return output;
}
