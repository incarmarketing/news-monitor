import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Building2, Check, Download, Newspaper } from "lucide-react";
import { monitoringCsv } from "./monitoringPresentation.js";

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
function InsightList(props) { return <HelperComponent name="InsightList" fallback="div" props={props} />; }
function PressInfluence(props) { return <HelperComponent name="PressInfluence" fallback="div" props={props} />; }
function MonthlyIssueDigest(props) { return <HelperComponent name="MonthlyIssueDigest" fallback="div" props={props} />; }

function isOfficialRegulatorSource(...args) { return callHelper("isOfficialRegulatorSource", () => false, ...args); }
function latestArticleDate(...args) { return callHelper("latestArticleDate", () => "", ...args); }
function addDaysToDateKey(...args) { return callHelper("addDaysToDateKey", (key = "") => key, ...args); }
function filterArticlesByDateRange(...args) { return callHelper("filterArticlesByDateRange", (rows = []) => rows || [], ...args); }
function dateRangeDayCount(...args) { return callHelper("dateRangeDayCount", () => 0, ...args); }
function composeMediaAnalysisData(...args) { return callHelper("composeMediaAnalysisData", (base = {}) => base, ...args); }
function selectDashboardKeywords(...args) { return callHelper("selectDashboardKeywords", () => [], ...args); }
function buildDateRangeToneTrend(...args) { return callHelper("buildDateRangeToneTrend", () => [], ...args); }
function buildKeywordFlow(...args) { return callHelper("buildKeywordFlow", () => [], ...args); }
function buildMediaAnalysisIssues(...args) { return callHelper("buildMediaAnalysisIssues", () => [], ...args); }
function buildPeriodObservations(...args) { return callHelper("buildPeriodObservations", () => [], ...args); }
function normalizeAnalysisDateRange(...args) { return callHelper("normalizeAnalysisDateRange", (start = "", end = "") => ({ start, end, clamped: false }), ...args); }
function periodIssueMeta(...args) { return callHelper("periodIssueMeta", () => "", ...args); }

const mediaAnalysisCache = new Map();
const MEDIA_ANALYSIS_CACHE_LIMIT = 8;

function articleCacheToken(article = {}) {
  return article.url || article.link || article.id || article.title || "";
}

function mediaAnalysisCacheKey({ articles = [], start = "", end = "", selectedKeywords = [], scopeLabel = "" }) {
  const first = articleCacheToken(articles[0]);
  const last = articleCacheToken(articles[articles.length - 1]);
  return [start, end, scopeLabel, articles.length, first, last, selectedKeywords.join("|")].join("::");
}

function getCachedMediaAnalysis(input) {
  const key = mediaAnalysisCacheKey(input);
  if (mediaAnalysisCache.has(key)) return mediaAnalysisCache.get(key);
  const { data, articles, scopeLabel, selectedKeywords, start, end, analysisDays } = input;
  const mediaSummaryData = composeMediaAnalysisData(data, articles, scopeLabel);
  const issueRows = buildMediaAnalysisIssues(articles, "custom").slice(0, 6);
  const value = {
    mediaSummaryData,
    dailyTrend: buildDateRangeToneTrend(articles, start, end, Math.min(analysisDays, 90), data.toneTrend),
    keywordRows: buildKeywordFlow(articles, selectedKeywords),
    issueRows,
    observations: buildPeriodObservations(mediaSummaryData, issueRows, "custom", scopeLabel),
  };
  mediaAnalysisCache.set(key, value);
  if (mediaAnalysisCache.size > MEDIA_ANALYSIS_CACHE_LIMIT) {
    mediaAnalysisCache.delete(mediaAnalysisCache.keys().next().value);
  }
  return value;
}

export default function MediaAnalysis({ data, period, setPeriod, articles = [], allArticles, scraps, onOpenMonitoring, operations, helpers = {} }) {
  mediaHelpers = helpers;
  const mediaSourceArticles = useMemo(
    () => (allArticles?.length ? allArticles : articles).filter((article) => !isOfficialRegulatorSource(article.source)),
    [allArticles, articles],
  );
  const deferredMediaSourceArticles = useDeferredValue(mediaSourceArticles);
  const latestDate = useMemo(() => latestArticleDate(deferredMediaSourceArticles), [deferredMediaSourceArticles]);
  const [rangeDraft, setRangeDraft] = useState({ start: "", end: "" });
  const [activeRange, setActiveRange] = useState({ start: "", end: "" });
  const [rangeNotice, setRangeNotice] = useState("");
  const [detailTab, setDetailTab] = useState("keywords");
  const defaultRange = useMemo(() => {
    if (!latestDate) return { start: "", end: "" };
    const start = addDaysToDateKey(latestDate, -6);
    return { start: start || latestDate, end: latestDate };
  }, [latestDate]);
  const effectiveRange = useMemo(
    () => ({
      start: activeRange.start || defaultRange.start,
      end: activeRange.end || defaultRange.end,
    }),
    [activeRange.end, activeRange.start, defaultRange.end, defaultRange.start],
  );
  useEffect(() => {
    if (!latestDate || activeRange.start || activeRange.end || rangeDraft.start || rangeDraft.end) return;
    setRangeDraft(defaultRange);
    setActiveRange(defaultRange);
  }, [activeRange.end, activeRange.start, defaultRange, latestDate, rangeDraft.end, rangeDraft.start]);
  const analysisArticles = useMemo(
    () => {
      if (!effectiveRange.start || !effectiveRange.end) return [];
      return filterArticlesByDateRange(deferredMediaSourceArticles, effectiveRange.start, effectiveRange.end);
    },
    [effectiveRange.end, effectiveRange.start, deferredMediaSourceArticles],
  );
  const deferredAnalysisArticles = useDeferredValue(analysisArticles);
  const analysisDays = dateRangeDayCount(effectiveRange.start, effectiveRange.end) || 30;
  const scopeLabel = effectiveRange.start && effectiveRange.end
    ? `${effectiveRange.start} ~ ${effectiveRange.end}`
    : "선택 기간";
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const mediaAnalysis = useMemo(
    () => getCachedMediaAnalysis({
      data,
      articles: deferredAnalysisArticles,
      scopeLabel,
      selectedKeywords,
      start: effectiveRange.start,
      end: effectiveRange.end,
      analysisDays,
    }),
    [analysisDays, data, deferredAnalysisArticles, effectiveRange.end, effectiveRange.start, scopeLabel, selectedKeywords],
  );
  const { mediaSummaryData, dailyTrend, keywordRows, issueRows, observations } = mediaAnalysis;
  const maxKeywordCount = Math.max(1, ...keywordRows.map(row => Number(row.value) || 0));
  const downloadArticles = () => {
    const url = URL.createObjectURL(new Blob([monitoringCsv(deferredAnalysisArticles)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `media-analysis-${effectiveRange.start}-${effectiveRange.end}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const applyRange = (days = null) => {
    const fallbackEnd = latestDate || effectiveRange.end || rangeDraft.end;
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
      <button type="button" className="ghost-button media-export" onClick={downloadArticles} disabled={!deferredAnalysisArticles.length}><Download />다운로드</button>
      </header>
      {rangeNotice && <p className="media-range-notice" role="status">{rangeNotice}</p>}
      <section className="media-analysis-layout media-intel-board">
        <div className="media-main-trend">
          <section className="panel media-trend-panel">
            <header className="media-trend-heading"><h2>일별 논조 흐름</h2><span>{deferredAnalysisArticles.length.toLocaleString("ko-KR")}건</span><div className="newsroom-tone-legend"><span>긍정</span><span>중립</span><span>주의</span><span>부정</span></div></header>
            <ToneTrend rows={dailyTrend} />
          </section>
        </div>
        <div className="media-keywords">
          <div className="newsroom-content-tabs" role="tablist" aria-label="기사량 집계 기준"><button type="button" role="tab" aria-selected={detailTab === "keywords"} onClick={() => setDetailTab("keywords")}>주요 키워드</button><button type="button" role="tab" aria-selected={detailTab === "publishers"} onClick={() => setDetailTab("publishers")}>언론사별 보도량</button></div>
          {detailTab === "keywords" ? <div className="media-keyword-bars">
            {keywordRows.filter(row => Number(row.value) > 0).slice(0, 10).map(row => <button type="button" key={row.keyword || row.name} onClick={() => onOpenMonitoring?.({ keyword: row.keyword || row.name })}><b>{row.name}</b><span><i style={{ width: `${Math.max(1, Number(row.value) / maxKeywordCount * 100)}%` }} /></span><strong>{Number(row.value).toLocaleString("ko-KR")}건</strong></button>)}
            {!keywordRows.some(row => Number(row.value) > 0) && <p className="empty-list-note">해당 기간의 키워드 기사가 없습니다.</p>}
          </div> : <Panel title="언론사별 보도량" icon={Building2} meta="선택 기간 기준"><PressInfluence rows={mediaSummaryData.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} /></Panel>}
        </div>
        <div className="media-issues">
          <Panel title="주요 보도 이슈" icon={Newspaper} meta={periodIssueMeta("custom", issueRows)}>
            <MonthlyIssueDigest issues={issueRows} period="custom" />
          </Panel>
          <details className="media-observations"><summary>관찰 코멘트</summary><InsightList insights={observations} /></details>
        </div>
      </section>
    </main>
  );
}
