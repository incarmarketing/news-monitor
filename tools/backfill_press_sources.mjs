import fs from "node:fs";

const env = readEnv(".env");
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  "";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = Number(process.env.BACKFILL_LIMIT || 5000);

const portalHosts = new Set([
  "google",
  "google.com",
  "news.google.com",
  "news.google.co.kr",
  "naver",
  "naver.com",
  "news.naver.com",
  "n.news.naver.com",
  "m.news.naver.com",
  "m.naver.com",
  "sports.naver.com",
  "game.naver.com",
  "help.naver.com",
  "m.sports.naver.com",
  "sports.news.naver.com",
  "entertain.naver.com",
  "m.entertain.naver.com",
  "blog.naver.com",
  "v.daum.net",
  "news.daum.net",
  "daum.net",
  "sports.news.nate.com",
  "네이버뉴스",
  "네이버 블로그",
  "Naver Blog",
  "naver blog",
  "구글뉴스",
  "네이버",
  "구글",
  "다음뉴스",
  "다음",
  "네이트",
]);

const staticHosts = new Set([
  "ssl.pstatic.net",
  "static.naver.net",
  "static.news.naver.net",
  "www.gstatic.com",
  "fonts.gstatic.com",
  "fonts.googleapis.com",
  "lh3.googleusercontent.com",
  "angular.dev",
  "w3.org",
]);

const pressAliasMap = new Map([
  ["MHN포토", "MHN스포츠"],
  ["mhn포토", "MHN스포츠"],
  ["엠에이치앤포토", "MHN스포츠"],
]);

const nonPressTitleLabels = new Set([
  "포토", "단독", "속보", "인터뷰", "기획", "#금융톡톡", "Invest",
  "금융 HOT 뉴스", "금융지주 보험사 분석", "카드", "드림&CEO", "보험업계 소식",
]);

const domainPressMap = new Map(Object.entries({
  "insnews.co.kr": "보험매일",
  "fins.co.kr": "보험저널",
  "bohumnews.com": "보험신보",
  "thebell.co.kr": "더벨",
  "bizwnews.com": "비즈월드",
  "etoday.co.kr": "이투데이",
  "viva100.com": "브릿지경제",
  "fetv.co.kr": "FETV",
  "investchosun.com": "인베스트조선",
  "medicaltimes.com": "메디칼타임즈",
  "pointe.co.kr": "포인트경제",
  "srtimes.kr": "SR타임스",
  "thevaluenews.co.kr": "더밸류뉴스",
  "cbci.co.kr": "CBC뉴스",
  "ceoscoredaily.com": "CEO스코어데일리",
  "dailypop.kr": "데일리팝",
  "ekn.kr": "에너지경제",
  "enetnews.co.kr": "이넷뉴스",
  "financialpost.co.kr": "파이낸셜포스트",
  "fntimes.com": "한국금융신문",
  "hansbiz.co.kr": "한스경제",
  "joongangenews.com": "중앙이코노미뉴스",
  "lawissue.co.kr": "로이슈",
  "news.einfomax.co.kr": "연합인포맥스",
  "newspim.com": "뉴스핌",
  "pinpointnews.co.kr": "핀포인트뉴스",
  "seoulfn.com": "서울파이낸스",
  "tfmedia.co.kr": "조세금융신문",
  "tokenpost.kr": "토큰포스트",
  "wikileaks-kr.org": "위키리크스한국",
  "womaneconomy.co.kr": "여성경제신문",
  "ajunews.com": "아주경제",
  "asiaa.co.kr": "아시아에이",
  "asiatoday.co.kr": "아시아투데이",
  "biz.newdaily.co.kr": "뉴데일리경제",
  "businesskorea.co.kr": "비즈니스코리아",
  "consumernews.co.kr": "소비자가만드는신문",
  "cstimes.com": "컨슈머타임스",
  "daily.hankooki.com": "데일리한국",
  "dailysmart.co.kr": "데일리스마트",
  "dealsite.co.kr": "딜사이트",
  "dnews.co.kr": "대한경제",
  "ebn.co.kr": "EBN",
  "econonews.co.kr": "이코노뉴스",
  "econovill.com": "이코노믹리뷰",
  "energy-news.co.kr": "에너지경제",
  "epnc.co.kr": "테크월드뉴스",
  "finomy.com": "현대경제신문",
  "g-enews.com": "글로벌이코노믹",
  "getnews.co.kr": "글로벌경제신문",
  "ggilbo.com": "금강일보",
  "globalepic.co.kr": "글로벌에픽",
  "goodkyung.com": "굿모닝경제",
  "greened.kr": "녹색경제신문",
  "gukjenews.com": "국제뉴스",
  "hangyo.com": "한국교육신문",
  "huffingtonpost.kr": "허프포스트코리아",
  "ibabynews.com": "베이비뉴스",
  "ilyoseoul.co.kr": "일요서울",
  "industrynews.co.kr": "인더스트리뉴스",
  "inthenews.co.kr": "인더뉴스",
  "it.chosun.com": "IT조선",
  "joongboo.com": "중부일보",
  "klnews.co.kr": "물류신문",
  "kpenews.com": "한국정경신문",
  "lcnews.co.kr": "라이센스뉴스",
  "mediapen.com": "미디어펜",
  "medipana.com": "메디파나뉴스",
  "metroseoul.co.kr": "메트로신문",
  "mhnse.com": "MHN스포츠",
  "mhns.co.kr": "MHN스포츠",
  "mhnsports.com": "MHN스포츠",
  "naeil.com": "내일신문",
  "new.dailypharm.com": "데일리팜",
  "newdaily.co.kr": "뉴데일리",
  "news.mtn.co.kr": "머니투데이방송",
  "mtn.co.kr": "머니투데이방송",
  "news1.kr": "뉴스1",
  "newsdream.kr": "뉴스드림",
  "newsinside.kr": "뉴스인사이드",
  "newsis.com": "뉴시스",
  "newslock.co.kr": "뉴스락",
  "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제",
  "yna.co.kr": "연합뉴스",
  "mt.co.kr": "머니투데이",
  "biz.heraldcorp.com": "헤럴드경제",
  "heraldcorp.com": "헤럴드경제",
  "view.asiae.co.kr": "아시아경제",
  "asiae.co.kr": "아시아경제",
  "edaily.co.kr": "이데일리",
  "sedaily.com": "서울경제",
  "bloter.net": "블로터",
  "ziksir.com": "직썰",
  "segyebiz.com": "세계비즈",
  "sisaon.co.kr": "시사오늘",
  "ttlnews.com": "티티엘뉴스",
  "popcornnews.net": "팝콘뉴스",
  "4th.kr": "포쓰저널",
  "footballist.co.kr": "풋볼리스트",
  "nocutnews.co.kr": "노컷뉴스",
  "osen.co.kr": "OSEN",
  "chosun.com": "조선일보",
  "sports.chosun.com": "스포츠조선",
  "sportsworldi.com": "스포츠월드",
  "kookje.co.kr": "국제신문",
  "newsworks.co.kr": "뉴스웍스",
  "youthdaily.co.kr": "청년일보",
  "joseilbo.com": "조세일보",
  "sisafocus.co.kr": "시사포커스",
  "dailian.co.kr": "데일리안",
  "ngetnews.com": "뉴스저널리즘",
  "ftoday.co.kr": "파이낸셜투데이",
  "sateconomy.co.kr": "시장경제",
  "dt.co.kr": "디지털타임스",
  "pointdaily.co.kr": "포인트데일리",
  "m.maniareport.com": "마니아리포트",
  "maniareport.com": "마니아리포트",
  "kmib.co.kr": "국민일보",
  "m.sportsworldi.com": "스포츠월드",
  "m.hankookilbo.com": "한국일보",
  "starin.edaily.co.kr": "이데일리",
  "mbn.co.kr": "MBN",
  "m.nocutnews.co.kr": "노컷뉴스",
  "cnbnews.com": "CNB뉴스",
  "sports.hankooki.com": "스포츠한국",
  "m-i.kr": "매일일보",
  "efnews.co.kr": "파이낸셜신문",
  "newsprime.co.kr": "프라임경제",
  "breaknews.com": "브레이크뉴스",
  "safetimes.co.kr": "세이프타임즈",
  "xportsnews.com": "엑스포츠뉴스",
  "fnnews.com": "파이낸셜뉴스",
}));

const naverOfficeIdMap = new Map(Object.entries({
  "001": "연합뉴스",
  "005": "국민일보",
  "009": "매일경제",
  "015": "한국경제",
  "016": "헤럴드경제",
  "018": "이데일리",
  "057": "MBN",
  "079": "노컷뉴스",
  "396": "스포츠월드",
  "425": "마이데일리",
  "436": "풋볼리스트",
  "469": "한국일보",
}));

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY are required.");
  process.exit(1);
}

const rows = await supabaseGet(
  `news_articles?select=article_hash,title,link,source,raw&limit=${LIMIT}&order=report_date.desc`,
);

let changed = 0;
let linkChanged = 0;
const preview = [];

for (const row of rows) {
  const resolved = await resolveArticle(row);
  if (!resolved.source || resolved.source === row.source && (!resolved.link || resolved.link === row.link)) continue;

  const next = {
    source: resolved.source,
    raw: {
      ...(row.raw || {}),
      source: resolved.source,
      resolved_source_from: resolved.reason,
    },
  };
  if (resolved.link && resolved.link !== row.link) {
    next.link = resolved.link;
    next.raw.link = resolved.link;
    next.raw.original_portal_link = resolved.portalLink || row.raw?.original_portal_link || row.link;
    linkChanged += 1;
  }

  changed += 1;
  if (preview.length < 25) {
    preview.push({
      title: row.title,
      before: row.source,
      after: resolved.source,
      linkBefore: row.link,
      linkAfter: resolved.link || row.link,
      reason: resolved.reason,
    });
  }

  if (!DRY_RUN) {
    await supabasePatch(`news_articles?article_hash=eq.${encodeURIComponent(row.article_hash)}`, next);
  }
}

console.log(JSON.stringify({ dryRun: DRY_RUN, scanned: rows.length, changed, linkChanged, preview }, null, 2));

async function resolveArticle(row) {
  const titlePress = extractPressFromTitle(row.title || "");
  const rawSource = normalizePress(row.source || "");
  const sourceHost = canonicalHost(rawSource);
  const storedPortalLink = row.raw?.original_portal_link || row.raw?.portal_link || "";
  const currentLink = row.link || "";
  const linkForResolution = isStaticOrAssetUrl(currentLink) && storedPortalLink ? storedPortalLink : currentLink;
  const linkHost = getHost(linkForResolution);

  if (rawSource && !isBadPress(rawSource) && !looksLikeHost(rawSource)) {
    const restored = isStaticOrAssetUrl(currentLink) && storedPortalLink ? { link: storedPortalLink, portalLink: storedPortalLink } : {};
    return { source: rawSource, reason: restored.link ? "restore-portal-link" : "existing-clean", ...restored };
  }

  if (titlePress) {
    return { source: titlePress, reason: "title" };
  }

  if (sourceHost && domainPressMap.has(sourceHost)) {
    return { source: domainPressMap.get(sourceHost), reason: "source-domain" };
  }

  if (linkHost && domainPressMap.has(linkHost)) {
    return { source: domainPressMap.get(linkHost), link: linkForResolution, reason: "link-domain" };
  }

  if (linkHost && !portalHosts.has(linkHost) && !isBadPress(linkHost)) {
    return { source: domainPressMap.get(linkHost) || linkHost, link: linkForResolution, reason: "link-host" };
  }

  if (linkHost && portalHosts.has(linkHost)) {
    const page = await resolvePortalPage(linkForResolution);
    if (page.press || page.url) {
      return {
        source: page.press || titlePress || rawSource,
        link: page.url || linkForResolution,
        portalLink: linkForResolution,
        reason: page.reason,
      };
    }
  }

  if (rawSource && isBadPress(rawSource)) {
    const restored = isStaticOrAssetUrl(currentLink) && storedPortalLink ? { link: storedPortalLink, portalLink: storedPortalLink } : {};
    return { source: "언론사 확인", reason: "unresolved-portal", ...restored };
  }

  return { source: "", reason: "unresolved" };
}

function extractPressFromTitle(title) {
  const bracket = String(title || "").match(/^\s*\[([^\]]{2,20})\]/);
  if (bracket) {
    const candidate = normalizePress(bracket[1]);
    if (isLikelyPressLabel(candidate)) return candidate;
  }
  const dash = String(title || "").match(/\s[-\u2013]\s([^-\u2013]{2,24})$/);
  if (!dash) return "";
  const candidate = normalizePress(dash[1]);
  if (nonPressTitleLabels.has(candidate) || /기자|특파원|종합|속보/.test(candidate)) return "";
  if (isLikelyPressLabel(candidate)) return candidate;
  const host = canonicalHost(candidate);
  return domainPressMap.get(host) || "";
}

function isLikelyPressLabel(candidate) {
  if (!candidate || nonPressTitleLabels.has(candidate)) return false;
  if (pressAliasMap.has(candidate)) return true;
  if (candidate.length > 14) return false;
  if (/[<>{}0-9]|시대|명암|기획|브리핑|단독|특징주|투자|판례/.test(candidate)) return false;
  return /(뉴스|신문|경제|일보|저널|매일|타임스|투데이|데일리|포스트|방송|스포츠|신보|이슈|프레스)$/.test(candidate)
    || ["더벨", "EBN", "FETV", "CEO스코어데일리", "CBC뉴스", "MHN스포츠"].includes(candidate);
}

async function resolvePortalPage(link) {
  let html = "";
  let finalUrl = "";
  try {
    const response = await fetch(link, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 news-monitor/1.0" },
    });
    finalUrl = response.url || "";
    html = await response.text();
  } catch {
    return {};
  }

  const pressPatterns = [
    /property=["']og:article:author["']\s+content=["']([^"']+)["']/is,
    /content=["']([^"']+)["']\s+property=["']og:article:author["']/is,
    /class=["'][^"']*media_end_head_top_logo_img[^"']*["'][^>]+alt=["']([^"']+)["']/is,
    /alt=["']([^"']+)["'][^>]+class=["'][^"']*media_end_head_top_logo_img[^"']*["']/is,
    /class=["'][^"']*press_logo[^"']*["'][^>]+alt=["']([^"']+)["']/is,
    /alt=["']([^"']+)["'][^>]+class=["'][^"']*press_logo[^"']*["']/is,
    /data-office-name=["']([^"']+)["']/is,
    /"pressName"\s*:\s*"([^"]+)"/is,
    /"officeName"\s*:\s*"([^"]+)"/is,
    /"cpName"\s*:\s*"([^"]+)"/is,
  ];
  let press = "";
  for (const pattern of pressPatterns) {
    const match = html.match(pattern);
    if (match) {
      press = normalizePress(match[1]);
      if (press && !isBadPress(press)) break;
    }
  }

  const host = getHost(link);
  const originalUrl = host.startsWith("news.google.") ? "" : extractOriginalArticleUrl(html, finalUrl);
  if (!press && originalUrl) {
    const host = getHost(originalUrl);
    press = domainPressMap.get(host) || host;
  }
  if (!press) {
    const officeId = extractNaverOfficeId(html);
    press = naverOfficeIdMap.get(officeId) || "";
  }

  return {
    press,
    url: originalUrl && !portalHosts.has(getHost(originalUrl)) ? originalUrl : "",
    reason: originalUrl ? "portal-page-original-link" : "portal-page-press",
  };
}

function extractOriginalArticleUrl(html, finalUrl) {
  const candidates = [];
  const patterns = [
    /"orgUrl"\s*:\s*\{[\s\S]{0,1200}?"url"\s*:\s*"([^"]+)"/gis,
    /"officeOutlinkNews"\s*:\s*\[[\s\S]{0,1600}?"url"\s*:\s*"([^"]+)"/gis,
    /class=["'][^"']*media_end_head_origin_link[^"']*["'][^>]+href=["']([^"']+)["']/gis,
    /href=["']([^"']+)["'][^>]+class=["'][^"']*media_end_head_origin_link[^"']*["']/gis,
    /data-clk=["']are\.ori["'][^>]+href=["']([^"']+)["']/gis,
    /href=["']([^"']+)["'][^>]+data-clk=["']are\.ori["']/gis,
    /https?:\/\/[^"'<>\\\s]+/g,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = htmlDecode(match[1] || match[0]).replace(/\\\//g, "/");
      if (!value || !/^https?:\/\//.test(value)) continue;
      const host = getHost(value);
      if (isRejectedOriginalUrl(value)) continue;
      candidates.push(value);
    }
  }
  if (finalUrl && !isRejectedOriginalUrl(finalUrl)) candidates.unshift(finalUrl);
  return candidates[0] || "";
}

function normalizePress(value) {
  const press = htmlDecode(String(value || ""))
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s*(네이버|다음|구글|네이트).*$/i, "")
    .trim();
  const aliased = pressAliasMap.get(press) || press;
  return domainPressMap.get(canonicalHost(aliased)) || aliased;
}

function isBadPress(value) {
  const press = normalizePress(value);
  const host = canonicalHost(press);
  return !press || portalHosts.has(host) || staticHosts.has(host) || nonPressTitleLabels.has(press) || ["언론사 확인", "언론사", "미확인"].includes(press);
}

function looksLikeHost(value) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value || "").trim());
}

function canonicalHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function getHost(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractNaverOfficeId(html) {
  const match = String(html || "").match(/"officeId"\s*:\s*"(\d{3})"/);
  return match?.[1] || "";
}

function isRejectedOriginalUrl(value) {
  const host = getHost(value);
  if (!host || portalHosts.has(host) || staticHosts.has(host)) return true;
  if (host.includes("google.") || host.includes("googleapis.") || host.includes("gstatic.") || host.includes("googleusercontent.")) return true;
  return /(?:\/_next\/static\/|\/static\/|\.css(?:\?|$)|\.js(?:\?|$)|\.woff2?(?:\?|$)|\.ttf(?:\?|$)|\.otf(?:\?|$)|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.gif(?:\?|$)|\.svg(?:\?|$)|\.ico(?:\?|$)|\.webp(?:\?|$))/i.test(value);
}

function isStaticOrAssetUrl(value) {
  if (!value) return false;
  const host = getHost(value);
  return staticHosts.has(host) || isRejectedOriginalUrl(value);
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x3D;/gi, "=")
    .replace(/&#61;/g, "=")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readEnv(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.includes("="))
      .map(line => {
        const idx = line.indexOf("=");
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        return [key, value];
      }),
  );
}

async function supabaseGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Supabase GET failed ${response.status}: ${await response.text()}`);
  return response.json();
}

async function supabasePatch(path, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase PATCH failed ${response.status}: ${await response.text()}`);
}

function authHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}
