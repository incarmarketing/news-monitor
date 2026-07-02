import { navItems } from "./data";

export function readInitialRoute() {
  const fallback = { section: "overview", monitoringPreset: null };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("section") || params.get("view") || "";
  const monitoringPreset = buildMonitoringPresetFromParams(params);
  let section = navItems.some((item) => item.id === requested)
    ? requested
    : monitoringPreset
      ? "monitoring"
      : "overview";
  if (section === "reports" && isMobileReportViewport()) {
    section = "overview";
  }
  return { section, monitoringPreset };
}

export function articleMatchesDeepLink(article = {}, articleHash = "", articleLink = "", articleTitle = "") {
  const hash = String(articleHash || "").trim().toLowerCase();
  const link = normalizeDeepLinkArticleLink(articleLink);
  const title = normalizeComparableTitle(articleTitle);
  const articleHashes = [article.articleHash, article.article_hash, article.id]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (hash && articleHashes.includes(hash)) return true;
  if (link) {
    const articleLinks = [article.link, article.url]
      .map(normalizeDeepLinkArticleLink)
      .filter(Boolean);
    if (articleLinks.includes(link)) return true;
  }
  if (title) {
    const candidate = normalizeComparableTitle(article.title || article.headline || "");
    if (candidate && candidate === title) return true;
    if (candidate && title.length >= 18 && (candidate.includes(title) || title.includes(candidate))) return true;
  }
  return false;
}

function isMobileReportViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1240px)").matches;
}

function buildMonitoringPresetFromParams(params) {
  const articleHash = (params.get("article") || params.get("article_hash") || "").trim();
  const articleLink = (params.get("article_link") || params.get("link") || params.get("url") || "").trim();
  const rawQuery = params.get("query") || params.get("q") || "";
  const tone = normalizeDeepLinkTone(params.get("tone"));
  const category = normalizeDeepLinkCategory(params.get("category"));
  let query = normalizeDeepLinkQuery(rawQuery);
  let articleTitle = normalizeDeepLinkTitle(params.get("article_title") || params.get("title") || params.get("headline") || "");
  if (!articleTitle && (tone || category || articleHash || articleLink) && looksLikeArticleTitleQuery(query)) {
    articleTitle = query;
    query = "";
  }
  const source = (params.get("source") || "").trim();
  if (!query && !tone && !category && !source && !articleHash && !articleLink && !articleTitle) return null;
  return {
    query,
    articleHash,
    articleLink,
    articleTitle,
    tone: tone || "all",
    category: category || "all",
    source: source || "all",
    stamp: Date.now(),
  };
}

function normalizeDeepLinkQuery(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (looksLikeSummaryQuery(text)) return "";
  return text.length <= 80 ? text : `${text.slice(0, 79).trim()}…`;
}

function normalizeDeepLinkTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikeArticleTitleQuery(text) {
  if (!text) return false;
  if (text.length >= 24 && /[\s"'“”‘’·…%]/.test(text)) return true;
  return /기사|논란|피해|쟁탈|1200%|룰|부정|스캔들|검사|제재|금감원|금융당국/.test(text);
}

function looksLikeSummaryQuery(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length > 100 || words.length >= 12) return true;
  const sentenceMarks = (text.match(/[.!?。]|다\.|요\.|니다\.|입니다/g) || []).length;
  if (sentenceMarks >= 2) return true;
  return /확인해야 합니다|별도 추적|평판 영향|소비자 보호|영업 환경|기사입니다/.test(text);
}

function normalizeDeepLinkArticleLink(value) {
  return String(value || "").trim().split("#", 1)[0].replace(/\/$/, "").toLowerCase();
}

function normalizeComparableTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+[^-]{2,24}$/g, "")
    .trim()
    .toLowerCase();
}

function normalizeDeepLinkTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  return {
    negative: "부정",
    danger: "부정",
    caution: "주의",
    warning: "주의",
    positive: "긍정",
    neutral: "중립",
    exclude: "제외",
    noise: "제외",
    "부정": "부정",
    "주의": "주의",
    "긍정": "긍정",
    "중립": "중립",
    "제외": "제외",
  }[tone] || "";
}

function normalizeDeepLinkCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return {
    own: "당사",
    company: "당사",
    competitor: "GA",
    regulation: "정책/규제",
    industry: "보험사",
    sponsorship: "스폰서십",
    "당사": "당사",
    "ga": "GA",
    "보험사": "보험사",
    "정책/규제": "정책/규제",
    "브랜드/스폰서십": "스폰서십",
    "스폰서십": "스폰서십",
  }[category] || "";
}
