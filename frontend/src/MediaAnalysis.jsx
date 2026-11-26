import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, Download, Newspaper } from "lucide-react";
import { monitoringCsv } from "./monitoringPresentation.js";
import { loadMediaArticleRange } from "./mediaRange.js";
import MediaSkeleton from "./MediaSkeleton.jsx";
import MediaIssueDigest from "./MediaIssueDigest.jsx";
import { mediaIssuesMeta } from "./mediaIssueModel.js";

let mediaHelpers = {};

function callHelper(name, fallback, ...args) {
  const fn = mediaHelpers?.[name];
  return typeof fn === "function" ? fn(...args) : fallback(...args);
}

function HelperComponent({ name, fallback: Fallback = "div", props = {}, children }) {
  const Component = mediaHelpers?.[name] || Fallback;
  const componentProps = { ...props };
  // Lazy helper wrappers receive children through props; keep panel bodies alive.
  const resolvedChildren = children ?? componentProps.children;
  delete componentProps.children;
  return <Component {...componentProps}>{resolvedChildren}</Component>;
}

function Panel(props) { return <HelperComponent name="Panel" fallback="section" props={props} />; }
function ToneTrend(props) { return <HelperComponent name="ToneTrend" fallback="div" props={props} />; }
function PressInfluence(props) { return <HelperComponent name="PressInfluence" fallback="div" props={props} />; }

function isOfficialRegulatorSource(...args) { return callHelper("isOfficialRegulatorSource", () => false, ...args); }
function addDaysToDateKey(...args) { return callHelper("addDaysToDateKey", (key = "") => key, ...args); }
function filterArticlesByDateRange(...args) { return callHelper("filterArticlesByDateRange", (rows = []) => rows || [], ...args); }
function dateRangeDayCount(...args) { return callHelper("dateRangeDayCount", () => 0, ...args); }
function composeMediaAnalysisDataAsync(...args) { return callHelper("composeMediaAnalysisDataAsync", async (base = {}) => base, ...args); }
function selectDashboardKeywords(...args) { return callHelper("selectDashboardKeywords", () => [], ...args); }
function buildDateRangeToneTrend(...args) { return callHelper("buildDateRangeToneTrend", () => [], ...args); }
function buildKeywordFlow(...args) { return callHelper("buildKeywordFlow", () => [], ...args); }
function buildMediaAnalysisIssuesAsync(...args) { return callHelper("buildMediaAnalysisIssuesAsync", async () => [], ...args); }
function normalizeAnalysisDateRange(...args) { return callHelper("normalizeAnalysisDateRange", (start = "", end = "") => ({ start, end, clamped: false }), ...args); }

const mediaAnalysisCache = new Map();
const MEDIA_ANALYSIS_CACHE_LIMIT = 8;

function articleCacheToken(article = {}) {
  return article.url || article.link || article.id || article.title || "";
}

function mediaAnalysisCacheKey({ articles = [], start = "", end = "", selectedKeywords = [], scopeLabel = "", cacheVersion = "" }) {
  const first = articleCacheToken(articles[0]);
  const last = articleCacheToken(articles[articles.length - 1]);
  return [start, end, scopeLabel, cacheVersion, articles.length, first, last, selectedKeywords.join("|")].join("::");
}

async function getCachedMediaAnalysis(input) {
  const key = mediaAnalysisCacheKey(input);
  if (mediaAnalysisCache.has(key)) return mediaAnalysisCache.get(key);
  const { data, articles, scopeLabel, selectedKeywords, start, end, analysisDays, signal, onProgress } = input;
  const mediaSummaryData = await composeMediaAnalysisDataAsync(data, articles, scopeLabel, { signal });
  const baseValue = {
    mediaSummaryData,
    dailyTrend: buildDateRangeToneTrend(articles, start, end, Math.min(analysisDays, 90), []),
    keywordRows: buildKeywordFlow(articles, selectedKeywords),
    issueRows: [],
  };
  onProgress?.(baseValue);
  const issueRows = (await buildMediaAnalysisIssuesAsync(articles, "custom", { signal })).slice(0, 6);
  const value = {
    ...baseValue,
    issueRows,
  };
  mediaAnalysisCache.set(key, value);
  if (mediaAnalysisCache.size > MEDIA_ANALYSIS_CACHE_LIMIT) {
    mediaAnalysisCache.delete(mediaAnalysisCache.keys().next().value);
  }
  return value;
}

export default function MediaAnalysis({ data, onOpenMonitoring, operations, helpers = {} }) {
  mediaHelpers = helpers;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const [rangeDraft, setRangeDraft] = useState({ start: "", end: "" });
  const [activeRange, setActiveRange] = useState({ start: "", end: "" });
  const [rangeNotice, setRangeNotice] = useState("");
  const [detailTab, setDetailTab] = useState("keywords");
  const [rangeRead, setRangeRead] = useState({ status: "loading", articles: [], loadedAt: 0 });
  const [retry, setRetry] = useState(0);
  const [analysisRead, setAnalysisRead] = useState({ status: "loading", key: "" });
  const defaultRange = useMemo(() => {
    const start = addDaysToDateKey(today, -29);
    return { start: start || today, end: today };
  }, [today]);
  const effectiveRange = useMemo(
    () => ({
      start: activeRange.start || defaultRange.start,
      end: activeRange.end || defaultRange.end,
    }),
    [activeRange.end, activeRange.start, defaultRange.end, defaultRange.start],
  );
  useEffect(() => {
    if (activeRange.start || activeRange.end || rangeDraft.start || rangeDraft.end) return;
    setRangeDraft(defaultRange);
    setActiveRange(defaultRange);
  }, [activeRange.end, activeRange.start, defaultRange, rangeDraft.end, rangeDraft.start]);
  const revision = operations?.articlesGeneratedAt || "";
  useEffect(() => {
    if (!effectiveRange.start || !effectiveRange.end) return undefined;
    let active = true;
    const requestedRange = { startDate: effectiveRange.start, endDate: effectiveRange.end };
    setRangeRead({ ...requestedRange, status: "loading", articles: [], loadedAt: 0 });
    loadMediaArticleRange({ startDate: effectiveRange.start, endDate: effectiveRange.end, revision })
      .then(result => { if (active) setRangeRead({ ...result, status: "ready" }); })
      .catch(error => { if (active) setRangeRead({ ...requestedRange, status: "error", articles: [], loadedAt: 0,
        error: error.message === "article_range_limit_reached" ? "기사량이 조회 한도를 초과했습니다. 기간을 나누어 조회해 주세요." : "선택 기간의 기사를 불러오지 못했습니다." }); });
    return () => { active = false; };
  }, [effectiveRange.start, effectiveRange.end, revision, retry]);
  const mediaSourceArticles = useMemo(() => rangeRead.articles.filter(article => !isOfficialRegulatorSource(article.source)), [rangeRead.articles]);
  const analysisArticles = useMemo(
    () => {
      if (!effectiveRange.start || !effectiveRange.end) return [];
      return filterArticlesByDateRange(mediaSourceArticles, effectiveRange.start, effectiveRange.end);
    },
    [effectiveRange.end, effectiveRange.start, mediaSourceArticles],
  );
  const deferredAnalysisArticles = useDeferredValue(analysisArticles);
  const loadingArticles = rangeRead.startDate !== effectiveRange.start || rangeRead.endDate !== effectiveRange.end
    || rangeRead.status === "loading" || deferredAnalysisArticles !== analysisArticles;
  const analysisDays = dateRangeDayCount(effectiveRange.start, effectiveRange.end) || 30;
  const scopeLabel = effectiveRange.start && effectiveRange.end
    ? `${effectiveRange.start} ~ ${effectiveRange.end}`
    : "선택 기간";
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const analysisInput = useMemo(
    () => ({
      data,
      articles: deferredAnalysisArticles,
      scopeLabel,
      selectedKeywords,
      start: effectiveRange.start,
      end: effectiveRange.end,
      analysisDays,
      cacheVersion: rangeRead.loadedAt,
    }),
    [analysisDays, data, deferredAnalysisArticles, effectiveRange.end, effectiveRange.start, scopeLabel, selectedKeywords, rangeRead.loadedAt],
  );
  const analysisKey = mediaAnalysisCacheKey(analysisInput);
  useEffect(() => {
    if (loadingArticles || rangeRead.status !== "ready") return undefined;
    const controller = new AbortController();
    setAnalysisRead({ status: "loading", key: analysisKey });
    getCachedMediaAnalysis({ ...analysisInput, signal: controller.signal,
      onProgress: value => { if (!controller.signal.aborted) setAnalysisRead({ status: "partial", key: analysisKey, value }); },
    })
      .then(value => { if (!controller.signal.aborted) setAnalysisRead({ status: "ready", key: analysisKey, value }); })
      .catch(() => { if (!controller.signal.aborted) setAnalysisRead({ status: "error", key: analysisKey }); });
    return () => controller.abort();
  }, [analysisInput, analysisKey, loadingArticles, rangeRead.status]);
  const loadingRange = loadingArticles || (rangeRead.status === "ready" && (analysisRead.key !== analysisKey || analysisRead.status === "loading"));
  const issuesLoading = rangeRead.status === "ready" && analysisRead.key === analysisKey && analysisRead.status === "partial";
  const analysisError = rangeRead.status === "error" ? rangeRead.error
    : analysisRead.key === analysisKey && analysisRead.status === "error" ? "선택 기간의 기사 집계를 완료하지 못했습니다." : "";
  const mediaAnalysis = !loadingRange && !analysisError && analysisRead.key === analysisKey && ["partial", "ready"].includes(analysisRead.status)
    ? analysisRead.value : { mediaSummaryData: { pressInfluence: [] }, dailyTrend: [], keywordRows: [], issueRows: [] };
  const { mediaSummaryData, dailyTrend, keywordRows, issueRows } = mediaAnalysis;
  const maxKeywordCount = Math.max(1, ...keywordRows.map(row => Number(row.value) || 0));
  const openPeriodMonitoring = preset => onOpenMonitoring?.({
    ...preset, startDate: effectiveRange.start, endDate: effectiveRange.end,
    mediaScope: true, rangeRevision: revision,
  });
  const downloadArticles = () => {
    const url = URL.createObjectURL(new Blob([monitoringCsv(deferredAnalysisArticles)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `media-analysis-${effectiveRange.start}-${effectiveRange.end}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const retryRange = () => {
    setRangeRead(current => ({ ...current, status: "loading" }));
    setRetry(value => value + 1);
  };
  const applyRange = (days = null) => {
    const fallbackEnd = today;
    let nextStart = rangeDraft.start;
    let nextEnd = rangeDraft.end || fallbackEnd;
    if (days && fallbackEnd) {
      nextEnd = fallbackEnd;
      nextStart = addDaysToDateKey(fallbackEnd, -(days - 1)) || fallbackEnd;
    }
    const normalized = normalizeAnalysisDateRange(nextStart, nextEnd, 90);
    setRangeDraft(normalized);
    setActiveRange(normalized);
    setRangeNotice(normalized.clamped ? "최대 90일 기준으로 시작일을 조정했습니다." : "");
  };
  return (
    <main className="workspace media-page">
      <header className="page-title media-command-panel">
        <h1>언론동향</h1>
          <div className="media-range-actions">
            {[7, 30, 90].map((days) => (
              <button key={days} type="button" className={`ghost-button compact-button ${analysisDays === days ? "active" : ""}`} aria-pressed={analysisDays === days} onClick={() => applyRange(days)}>
                {days}일
              </button>
            ))}
          </div>
      <div className="media-range-panel">
        <label>
          <span className="sr-only">시작 기준일</span>
          <input type="date" value={rangeDraft.start} onChange={(event) => setRangeDraft((current) => ({ ...current, start: event.target.value }))} />
        </label>
        <span aria-hidden="true">~</span>
        <label>
          <span className="sr-only">종료 기준일</span>
          <input type="date" value={rangeDraft.end} onChange={(event) => setRangeDraft((current) => ({ ...current, end: event.target.value }))} />
        </label>
        <button type="button" className="primary-button" onClick={() => applyRange()}>
          <Check />적용
        </button>
      </div>
      <button type="button" className="ghost-button media-export" onClick={downloadArticles} disabled={loadingRange || Boolean(analysisError) || rangeRead.status !== "ready" || !deferredAnalysisArticles.length}><Download />다운로드</button>
      </header>
      {rangeNotice && <p className="media-range-notice" role="status">{rangeNotice}</p>}
      <section className="media-analysis-layout media-intel-board" aria-busy={loadingRange || issuesLoading}>
        {(loadingRange || issuesLoading) && <span className="sr-only" role="status">기사 데이터를 불러오는 중입니다.</span>}
        <div className="media-main-trend">
          <section className="panel media-trend-panel">
            <header className="media-trend-heading"><h2>일별 논조 흐름</h2><span>{loadingRange ? <MediaSkeleton kind="count" /> : analysisError ? "조회 실패" : `${deferredAnalysisArticles.length.toLocaleString("ko-KR")}건`}</span><small className="tone-axis-note">논조별 개별 눈금 · 기사 수(건)</small></header>
            {loadingRange ? <MediaSkeleton kind="trend" /> : analysisError ? <div className="media-trend-message" role="alert"><p>{analysisError}</p><button type="button" className="ghost-button" onClick={retryRange}>다시 조회</button></div> : <ToneTrend rows={dailyTrend} />}
          </section>
        </div>
        <div className="media-keywords">
          <div className="newsroom-content-tabs" role="tablist" aria-label="기사량 집계 기준"><button type="button" role="tab" id="media-keywords-tab" aria-controls="media-detail-panel" aria-selected={detailTab === "keywords"} onClick={() => setDetailTab("keywords")}>주요 키워드</button><button type="button" role="tab" id="media-publishers-tab" aria-controls="media-detail-panel" aria-selected={detailTab === "publishers"} onClick={() => setDetailTab("publishers")}>언론사별 보도량</button></div>
          <div className="media-keyword-content" id="media-detail-panel" role="tabpanel" aria-labelledby={`media-${detailTab}-tab`}>
          {detailTab === "keywords" ? loadingRange ? <MediaSkeleton kind="keywords" /> : <div className="media-keyword-bars">
            {keywordRows.filter(row => Number(row.value) > 0).slice(0, 10).map(row => <button type="button" key={row.keyword || row.name} onClick={() => openPeriodMonitoring({ query: row.keyword || row.name })}><b>{row.name}</b><span><i style={{ width: `${Math.max(1, Number(row.value) / maxKeywordCount * 100)}%` }} /></span><strong>{Number(row.value).toLocaleString("ko-KR")}건</strong></button>)}
            {!keywordRows.some(row => Number(row.value) > 0) && <p className="empty-list-note">{analysisError ? "선택 기간 조회를 완료하지 못했습니다." : "해당 기간의 키워드 기사가 없습니다."}</p>}
          </div> : loadingRange ? <MediaSkeleton kind="publishers" /> : analysisError ? <p className="empty-list-note">선택 기간 조회를 완료하지 못했습니다.</p> : <PressInfluence rows={mediaSummaryData.pressInfluence} onOpenMonitoring={openPeriodMonitoring} />}
          </div>
        </div>
        <div className="media-issues">
          <Panel title="주요 보도 이슈" icon={Newspaper} meta={loadingRange || issuesLoading ? "" : analysisError ? "조회 실패" : mediaIssuesMeta(issueRows)}>
            <div className="media-issue-content">
            <MediaIssueDigest issues={issueRows} loading={loadingRange || issuesLoading} error={analysisError} />
            </div>
          </Panel>
        </div>
      </section>
    </main>
  );
}
