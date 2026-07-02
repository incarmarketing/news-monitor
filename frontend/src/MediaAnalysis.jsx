import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, Building2, Gauge, LineChart, Newspaper } from "lucide-react";

let mediaHelpers = {};

function callHelper(name, fallback, ...args) {
  const fn = mediaHelpers?.[name];
  return typeof fn === "function" ? fn(...args) : fallback(...args);
}

function HelperComponent({ name, fallback: Fallback = "div", props = {}, children }) {
  const Component = mediaHelpers?.[name] || Fallback;
  return <Component {...props}>{children}</Component>;
}

function PageTitle(props) { return <HelperComponent name="PageTitle" props={props} />; }
function Panel(props) { return <HelperComponent name="Panel" fallback="section" props={props} />; }
function ToneTrend(props) { return <HelperComponent name="ToneTrend" fallback="div" props={props} />; }
function CategoryChart(props) { return <HelperComponent name="CategoryChart" fallback="div" props={props} />; }
function KeywordBrief(props) { return <HelperComponent name="KeywordBrief" fallback="div" props={props} />; }
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
  useEffect(() => {
    if (!latestDate || activeRange.start || activeRange.end || rangeDraft.start || rangeDraft.end) return;
    const start = addDaysToDateKey(latestDate, -29);
    const next = { start: start || latestDate, end: latestDate };
    setRangeDraft(next);
    setActiveRange(next);
  }, [activeRange.end, activeRange.start, latestDate, rangeDraft.end, rangeDraft.start]);
  const analysisArticles = useMemo(
    () => filterArticlesByDateRange(deferredMediaSourceArticles, activeRange.start, activeRange.end),
    [activeRange.end, activeRange.start, deferredMediaSourceArticles],
  );
  const deferredAnalysisArticles = useDeferredValue(analysisArticles);
  const analysisDays = dateRangeDayCount(activeRange.start, activeRange.end) || 30;
  const scopeLabel = activeRange.start && activeRange.end
    ? `${activeRange.start} ~ ${activeRange.end}`
    : "선택 기간";
  const mediaSummaryData = useMemo(
    () => composeMediaAnalysisData(data, deferredAnalysisArticles, scopeLabel),
    [data, deferredAnalysisArticles, scopeLabel],
  );
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const dailyTrend = useMemo(
    () => buildDateRangeToneTrend(deferredAnalysisArticles, activeRange.start, activeRange.end, Math.min(analysisDays, 90), data.toneTrend),
    [activeRange.end, activeRange.start, deferredAnalysisArticles, analysisDays, data.toneTrend],
  );
  const keywordRows = useMemo(
    () => buildKeywordFlow(deferredAnalysisArticles, selectedKeywords),
    [deferredAnalysisArticles, selectedKeywords],
  );
  const issueRows = useMemo(
    () => buildMediaAnalysisIssues(deferredAnalysisArticles, "custom").slice(0, 6),
    [deferredAnalysisArticles],
  );
  const observations = useMemo(
    () => buildPeriodObservations(mediaSummaryData, issueRows, "custom", scopeLabel),
    [issueRows, mediaSummaryData, scopeLabel],
  );
  const applyRange = (days = null) => {
    const fallbackEnd = latestDate || activeRange.end || rangeDraft.end;
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
    <main className="workspace">
      <PageTitle
        eyebrow={`${scopeLabel} 분석`}
        title="언론 동향 분석"
        description="보고서 형식과 분리해 원하는 기간의 트렌드, 언론사별 보도량, 키워드 흐름, 핵심 이슈를 확인합니다."
        right={(
          <div className="media-range-actions">
            {[7, 30, 90].map((days) => (
              <button key={days} type="button" className="ghost-button compact-button" onClick={() => applyRange(days)}>
                {days}일
              </button>
            ))}
          </div>
        )}
      />
      <section className="media-range-panel">
        <div>
          <span>분석 기간</span>
          <b>{scopeLabel}</b>
          <em>최대 90일 · 금융당국 공식 보도자료 제외</em>
        </div>
        <label>
          <span>시작 기준일</span>
          <input type="date" value={rangeDraft.start} onChange={(event) => setRangeDraft((current) => ({ ...current, start: event.target.value }))} />
        </label>
        <label>
          <span>종료 기준일</span>
          <input type="date" value={rangeDraft.end} onChange={(event) => setRangeDraft((current) => ({ ...current, end: event.target.value }))} />
        </label>
        <button type="button" className="primary-button" onClick={() => applyRange()}>
          분석 적용
        </button>
        {rangeNotice && <small>{rangeNotice}</small>}
      </section>
      <section className="media-analysis-layout media-intel-board">
        <div className="media-analysis-column">
          <Panel title="일별 논조 추이" icon={Activity} meta={`${Math.min(analysisDays, 90)}일 · 긍정/중립/주의/부정`}>
            <ToneTrend rows={dailyTrend} />
          </Panel>
          <Panel title="키워드별 기사량" icon={LineChart} meta="선정 키워드 10개">
            <CategoryChart rows={keywordRows} tall onOpenMonitoring={onOpenMonitoring} drillBy="keyword" labelWidth={132} />
            <KeywordBrief rows={keywordRows} />
          </Panel>
          <Panel title="관찰 코멘트" icon={Gauge} meta="핵심 흐름 요약">
            <InsightList insights={observations} />
          </Panel>
        </div>
        <div className="media-analysis-column">
          <Panel title="언론사별 보도량" icon={Building2} meta="선택 기간 기준">
            <PressInfluence rows={mediaSummaryData.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="핵심 이슈" icon={Newspaper} meta={periodIssueMeta("custom", issueRows)}>
            <MonthlyIssueDigest issues={issueRows} period="custom" />
          </Panel>
        </div>
      </section>
    </main>
  );
}
