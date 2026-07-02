import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { periodData } from "./data";
import { A4BarList, A4MetricTable, A4Panel, A4PressRows } from "./reportComponents";
import { buildA4ReportStats, publicationMeta, reportPurposeConfig } from "./reportModel";

let reportHelpers = {};

function callHelper(name, fallback, ...args) {
  const fn = reportHelpers?.[name];
  return typeof fn === "function" ? fn(...args) : fallback(...args);
}

function PeriodControl(props) {
  const Component = reportHelpers?.PeriodControl;
  return Component ? <Component {...props} /> : null;
}

function Chip({ children, tone }) {
  const Component = reportHelpers?.Chip;
  return Component ? <Component tone={tone}>{children}</Component> : <span className="chip">{children}</span>;
}

function printCurrentView(...args) { return callHelper("printCurrentView", () => {}, ...args); }
function periodScopeLabel(...args) { return callHelper("periodScopeLabel", (period = "daily") => period, ...args); }
function availableReportMonths(...args) { return callHelper("availableReportMonths", () => [], ...args); }
function formatReportMonthOption(...args) { return callHelper("formatReportMonthOption", (month = "") => month, ...args); }
function filterRowsByMonth(...args) { return callHelper("filterRowsByMonth", () => [], ...args); }
function filterRowsByPeriod(...args) { return callHelper("filterRowsByPeriod", () => [], ...args); }
function composePeriodData(...args) { return callHelper("composePeriodData", (base = {}) => base, ...args); }
function buildReportPeriodScope(...args) { return callHelper("buildReportPeriodScope", () => ({}), ...args); }
function expandReportIssues(...args) { return callHelper("expandReportIssues", (issues = []) => issues || [], ...args); }
function buildReportToneTrend(...args) { return callHelper("buildReportToneTrend", () => [], ...args); }
function buildKeywordFlow(...args) { return callHelper("buildKeywordFlow", () => [], ...args); }
function selectDashboardKeywords(...args) { return callHelper("selectDashboardKeywords", () => [], ...args); }
function buildPressInfluence(...args) { return callHelper("buildPressInfluence", () => [], ...args); }
function isOfficialRegulatorSource(...args) { return callHelper("isOfficialRegulatorSource", () => false, ...args); }
function buildReportCategoryFlowRows(...args) { return callHelper("buildReportCategoryFlowRows", () => [], ...args); }
function isOwnArticle(...args) { return callHelper("isOwnArticle", () => false, ...args); }
function articleTimeValue(...args) { return callHelper("articleTimeValue", () => 0, ...args); }
function articlePrimarySummaryTopic(...args) { return callHelper("articlePrimarySummaryTopic", () => "", ...args); }
function groupArticles(...args) { return callHelper("groupArticles", () => [], ...args); }
function buildArticleSummaryLines(...args) { return callHelper("buildArticleSummaryLines", () => [], ...args); }
function compactArticleSummary(...args) { return callHelper("compactArticleSummary", () => "", ...args); }
function unique(...args) { return callHelper("unique", (values = []) => Array.from(new Set(values)), ...args); }
function isOwnSponsoredSportsArticle(...args) { return callHelper("isOwnSponsoredSportsArticle", () => false, ...args); }
function isOwnSponsoredSportsBrandArticle(...args) { return callHelper("isOwnSponsoredSportsBrandArticle", () => false, ...args); }
export default function Reports({ data, period, setPeriod, articles, allArticles = [], scraps, onOpenMonitoring, operations, helpers = {} }) {
  reportHelpers = helpers;
  const reportSourceArticles = allArticles.length ? allArticles : articles || [];
  const monthOptions = useMemo(() => availableReportMonths(reportSourceArticles), [reportSourceArticles]);
  const [reportMonth, setReportMonth] = useState("");
  useEffect(() => {
    if (period !== "monthly") return;
    if (!monthOptions.length) {
      setReportMonth("");
      return;
    }
    if (!reportMonth || !monthOptions.includes(reportMonth)) {
      setReportMonth(monthOptions[0]);
    }
  }, [period, monthOptions, reportMonth]);
  const selectedMonth = period === "monthly" ? reportMonth || monthOptions[0] || "" : "";
  const reportArticles = useMemo(() => (
    period === "monthly" && selectedMonth
      ? filterRowsByMonth(reportSourceArticles, selectedMonth)
      : articles || []
  ), [period, selectedMonth, reportSourceArticles, articles]);
  const reportRuns = useMemo(() => (
    period === "monthly" && selectedMonth
      ? filterRowsByMonth(operations?.reportRuns || [], selectedMonth)
      : filterRowsByPeriod(operations?.reportRuns || [], period)
  ), [period, selectedMonth, operations?.reportRuns]);
  const reportData = useMemo(() => (
    period === "monthly" && selectedMonth
      ? composePeriodData(periodData.monthly, reportArticles, reportRuns, true, "monthly")
      : data
  ), [period, selectedMonth, reportArticles, reportRuns, data]);
  const edition = publicationMeta(period, reportData);
  const reportSummary = reportData.summary || {};
  return (
    <main className="workspace report-workspace">
      <section className="report-command-panel no-print">
        <div className="report-command-copy">
          <span>{edition.kicker}</span>
          <h1>언론 동향 리포트</h1>
          <p>{periodScopeLabel(period)} 기준 핵심 기사와 분류·언론사 보도량만 압축해 한 장 보고서로 정리합니다.</p>
        </div>
        <div className="report-command-actions">
          <div className="report-period-picker">
            <span>보고서 유형</span>
            <PeriodControl period={period} setPeriod={setPeriod} compact />
          </div>
          {period === "monthly" && (
            <MonthSelect
              months={monthOptions}
              value={selectedMonth}
              onChange={setReportMonth}
            />
          )}
          <button className="primary-button" onClick={() => printCurrentView(`${edition.title} ${reportData.scope || ""}`)}>
            <Download />PDF 저장
          </button>
        </div>
        <div className="report-command-kpis">
          <span className={`risk ${String(reportSummary.risk || "LOW").toLowerCase()}`}><em>리스크</em><b>{reportSummary.risk || "LOW"}</b></span>
          <span><em>분석</em><b>{Number(reportSummary.analyzed || reportArticles.length || 0).toLocaleString("ko-KR")}</b></span>
          <span><em>당사</em><b>{Number(reportSummary.ownMentions || 0).toLocaleString("ko-KR")}</b></span>
          <span><em>부정</em><b>{Number(reportSummary.ownNegative || 0).toLocaleString("ko-KR")}</b></span>
          <span><em>주의</em><b>{Number(reportSummary.caution || 0).toLocaleString("ko-KR")}</b></span>
        </div>
      </section>
      <A4ReportStage
        data={reportData}
        period={period}
        articles={reportArticles || []}
        scraps={scraps}
        onOpenMonitoring={onOpenMonitoring}
      />
    </main>
  );
}

function MonthSelect({ months = [], value = "", onChange }) {
  return (
    <label className="month-select no-print">
      <span>기준월</span>
      <select value={value} onChange={(event) => onChange?.(event.target.value)} disabled={!months.length}>
        {!months.length && <option value="">월간 데이터 없음</option>}
        {months.map((month) => (
          <option key={month} value={month}>{formatReportMonthOption(month)}</option>
        ))}
      </select>
    </label>
  );
}

function A4ReportStage({
  data,
  period,
  articles = [],
  scraps = [],
  onOpenMonitoring,
  keywordRows,
  trendRows,
  embedded = false,
}) {
  const reportArticles = articles || [];
  const reportScope = buildReportPeriodScope(reportArticles.length ? reportArticles : [], period, data.scope);
  const edition = publicationMeta(period, { ...data, periodScope: reportScope });
  const expandedIssues = expandReportIssues(data.issues, reportArticles, period);
  const lead = buildReportLead(period, data, reportArticles, expandedIssues);
  const secondaryLimit = period === "daily" ? 4 : period === "monthly" ? 3 : 4;
  const secondary = expandedIssues
    .filter((issue) => !sameIssue(issue, lead))
    .slice(0, secondaryLimit);
  const reportTrend = trendRows?.length
    ? trendRows
    : buildReportToneTrend(reportArticles, period, data.toneTrend);
  const reportKeywords = keywordRows?.length
    ? keywordRows
    : buildKeywordFlow(reportArticles, selectDashboardKeywords()).slice(0, 10);

  return (
    <section className={`a4-report-stage ${embedded ? "embedded" : "standalone"}`}>
      <div className="a4-report-stage-head no-print">
        <span>PRINT PREVIEW</span>
        <b>{periodScopeLabel(period)} 보고서</b>
        <em>아래 지면 기준으로 PDF가 생성됩니다.</em>
      </div>
      <A4ReportSheet
        data={data}
        period={period}
        edition={edition}
        reportScope={reportScope}
        lead={lead}
        issues={secondary}
        articles={reportArticles}
        trendRows={reportTrend}
        keywordRows={reportKeywords}
        scraps={scraps}
        onOpenMonitoring={onOpenMonitoring}
      />
    </section>
  );
}

function A4ReportSheet({
  data,
  period,
  edition,
  reportScope,
  lead,
  issues = [],
  articles = [],
  trendRows = [],
  keywordRows = [],
  scraps = [],
  onOpenMonitoring,
}) {
  const summary = data.summary || {};
  const scope = reportScope || data.periodScope || buildReportPeriodScope(articles, period, data.scope);
  const stats = buildA4ReportStats(summary, articles, { isOwnArticle });
  const pressRows = (data.pressInfluence?.length ? data.pressInfluence : buildPressInfluence(articles))
    .filter((item) => !isOfficialRegulatorSource(item.source))
    .slice(0, 6);
  const categoryRows = buildReportCategoryFlowRows(articles, summary, 6)
    .filter((row) => Number(row.value || 0) > 0)
    .slice(0, 6);
  const issueGroups = buildA4IssueGroups(lead, issues, articles, period);
  const purpose = reportPurposeConfig(period);
  return (
    <article className={`a4-report-sheet ${period}`}>
      <header className="a4-masthead">
        <div className="a4-title-row">
          <div>
            <p>{edition.kicker}</p>
            <h2>{edition.title}</h2>
            <em>{scope.scopeLabel || data.scope || edition.issue} · {purpose.focus}</em>
          </div>
        </div>
        <A4MetricTable stats={stats} onOpenMonitoring={onOpenMonitoring} />
      </header>

      <section className="a4-report-body">
        <div className="a4-report-main-column">
          <A4Panel title={purpose.issueTitle} meta={purpose.issueMeta}>
            <A4PriorityArticleCards groups={issueGroups} period={period} />
          </A4Panel>
        </div>

        <div className="a4-report-side-column">
          <A4Panel title={purpose.categoryTitle} meta="기간 기준">
            <A4BarList rows={categoryRows} />
          </A4Panel>
          <A4Panel title={purpose.pressTitle} meta="상위 6개사">
            <A4PressRows rows={pressRows} onOpenMonitoring={onOpenMonitoring} />
          </A4Panel>
        </div>
      </section>

      <footer className="a4-footer">
        <span>집계 구간: {scope.scopeLabel || data.scope || "-"}</span>
        <span>{scope.ruleLabel}</span>
      </footer>
    </article>
  );
}

function A4PriorityArticleCards({ groups = [], period = "daily" }) {
  const limit = period === "daily" ? 5 : 6;
  const cards = [];
  const seen = new Set();
  groups.forEach((group) => {
    (group.items || []).forEach((issue) => {
      const key = issue.articleHash || issue.article_hash || issue.link || `${issue.source}-${issue.title}`;
      if (!issue?.title || seen.has(key)) return;
      seen.add(key);
      cards.push({ ...issue, bucketTitle: group.title });
    });
  });
  const visibleCards = cards.slice(0, limit);
  if (!visibleCards.length) return <p className="a4-empty">우선 확인할 기사가 없습니다.</p>;
  return (
    <div className="a4-priority-card-grid">
      {visibleCards.map((issue, index) => {
        const href = issue.link && issue.link !== "#" ? issue.link : "";
        return (
          <a
            key={`${issue.source}-${issue.title}-${issue.time || issue.date}-${index}`}
            className="a4-priority-card"
            href={href || "#"}
            target={href ? "_blank" : undefined}
            rel={href ? "noreferrer" : undefined}
            onClick={(event) => {
              if (!href) event.preventDefault();
            }}
          >
            <span className="a4-priority-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="a4-priority-main">
              <div className="a4-priority-meta">
                <Chip tone={issue.tone}>{issue.tone}</Chip>
                <Chip>{issue.category || issue.bucketTitle || "분류"}</Chip>
                <em>{formatA4ArticleMeta(issue)}</em>
              </div>
              <b>{issue.title}</b>
            </div>
            <span className="a4-priority-open">열기</span>
          </a>
        );
      })}
    </div>
  );
}

function buildA4IssueGroups(lead, issues = [], articles = [], period = "daily") {
  const pool = dedupeA4Issues([lead, ...issues, ...articles].filter((item) => item?.title && item.tone !== "제외"));
  const defs = [
    {
      key: "own",
      title: "당사",
      description: "직접 언급·평판·성과 보도",
      emptyText: "당사 직접 언급 기사는 없습니다.",
    },
    {
      key: "policy",
      title: "정책/감독",
      description: "감독·수수료·법안·제재",
      emptyText: "정책/규제성 핵심 기사는 없습니다.",
    },
    {
      key: "market",
      title: "시장 동향",
      description: "GA·보험사·경쟁사 동향",
      emptyText: "동향 핵심 기사는 없습니다.",
    },
  ];
  const limit = period === "daily" ? 2 : 3;
  return defs.map((def) => {
    const items = pool
      .filter((item) => classifyA4IssueBucket(item) === def.key)
      .map((item) => ({ item, score: scoreA4BucketArticle(item, def.key) }))
      .sort((a, b) => b.score - a.score || articleTimeValue(b.item) - articleTimeValue(a.item))
      .map(({ item }) => item);
    return {
      ...def,
      total: items.length,
      items: items.slice(0, limit),
    };
  });
}

function classifyA4IssueBucket(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.source || ""} ${item.category || ""}`;
  if (isOwnArticle(item)) return "own";
  if (
    item.category === "정책/규제"
    || isOfficialRegulatorSource(item.source)
    || /금감원|금융감독원|금융위|금융위원회|당국|감독|제재|법안|시행령|수수료|1200%|내부통제|불완전판매|부당승환|보험사기/.test(text)
  ) {
    return "policy";
  }
  return "market";
}

function scoreA4BucketArticle(item = {}, bucket = "market") {
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.category || ""}`;
  let score = reportFrontScore(item);
  if (bucket === "own") {
    if (item.tone === "부정") score += 900;
    if (item.tone === "긍정") score += 620;
    if (item.tone === "주의") score += 460;
    if (/성과|최다|우수인증|브랜드평판|수상|선정|매출|성장/.test(text)) score += 180;
  }
  if (bucket === "policy") {
    if (item.category === "정책/규제") score += 480;
    if (item.tone === "주의" || item.tone === "부정") score += 220;
    if (/수수료|1200%|금감원|금융위|불완전판매|부당승환|제재|감독/.test(text)) score += 160;
  }
  if (bucket === "market") {
    if (["경쟁사", "GA", "보험사", "업계동향", "업계 동향"].includes(item.category)) score += 360;
    if (/실적|제휴|인수|매각|브랜드평판|설계사|GA|보험사/.test(text)) score += 120;
  }
  score += Math.min(Number(item.relatedCount || item.clusterSize || 1) * 8, 120);
  return score;
}

function dedupeA4Issues(items = []) {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const key = item.link && item.link !== "#"
      ? item.link
      : normalizeIssueTitle(item.title || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function a4TopicLabel(article = {}) {
  const topic = articlePrimarySummaryTopic(article);
  if (topic === "own-performance") return "당사 성과성 보도";
  if (topic === "investment") return "시장 평가 변화";
  if (topic === "settlement-support") return "GA 정착지원금·조직력 경쟁";
  if (topic === "security") return "금융보안·예방 체계";
  if (topic === "insurance-loss") return "실손보험 손해율·민원 지표";
  if (topic === "insurance-fraud") return "보험사기 대응 이슈";
  if (article.tone === "부정") return "부정 리스크";
  if (article.tone === "주의") return "주의 관찰 이슈";
  if (article.tone === "긍정") return "우호 활용 후보";
  return article.category || "주요 보도";
}

function formatA4ArticleMeta(item = {}, fallback = "-") {
  if (!item) return fallback;
  const source = item.source || "INCAR Media Desk";
  const dateTime = [item.date, item.time].filter(Boolean).join(" ") || item.publishedAt || fallback;
  const related = Number(item.relatedCount || item.clusterSize || 1) > 1 ? ` · 관련 ${Number(item.relatedCount || item.clusterSize).toLocaleString("ko-KR")}건` : "";
  return `${source} · ${dateTime}${related}`;
}

function buildReportLead(period, data, articles, issues) {
  if (period === "daily") {
    return issues[0] || {
      tone: data.summary.risk === "LOW" ? "중립" : "주의",
      category: "데일리",
      source: data.label,
      title: data.summary.headline,
      summary: data.summary.headline,
      publishedAt: data.scope,
    };
  }
  const frontArticle = selectReportFrontArticle(articles, issues);
  const topCategories = groupArticles(articles, "category").slice(0, 2).map(([name]) => name).join("·") || "주요 보도";
  const riskText = data.summary.ownNegative > 0
    ? `당사 부정 ${data.summary.ownNegative}건은 별도 확인 대상으로 분리하고`
    : "당사 직접 부정은 제한적이며";
  const cadence = period === "weekly" ? "이번 주" : "이번 달";
  if (frontArticle) {
    const ownPositive = isOwnArticle(frontArticle) && frontArticle.tone === "긍정";
    const ownNeutral = isOwnArticle(frontArticle) && frontArticle.tone === "중립";
    const leadLines = buildArticleSummaryLines(frontArticle);
    return {
      ...frontArticle,
      category: frontArticle.category || "당사",
      source: frontArticle.source || "INCAR Media Desk",
      summary: compactArticleSummary(frontArticle),
      summaryLines: unique([
        ownPositive
          ? `${cadence} 당사 보도에서는 성과성 이슈가 대표 흐름으로 확인됩니다.`
          : ownNeutral
            ? `${cadence} 당사 직접 언급 보도가 대표 관찰 이슈로 확인됩니다.`
            : `${cadence} 핵심 이슈로 확인된 보도입니다.`,
        ...leadLines,
        `당사 언급 ${data.summary.ownMentions}건, 당사 부정 ${data.summary.ownNegative}건, 주의 ${data.summary.caution}건을 분리해 봅니다.`,
      ]).slice(0, 4),
      publishedAt: frontArticle.publishedAt || frontArticle.time || frontArticle.date || data.scope,
    };
  }
  const leadIssue = issues[0];
  return {
    tone: data.summary.risk === "LOW" ? "중립" : "주의",
    category: period === "weekly" ? "주간 종합" : "월간 종합",
    source: "INCAR Media Desk",
    title: leadIssue?.title || `${cadence} 언론 흐름은 ${topCategories} 중심으로 형성`,
    summary: `${riskText}, 직접 부정과 시장성 주의 이슈를 분리해 추적합니다. ${topCategories} 보도량이 기간 흐름을 만들었고, 당사 언급 ${data.summary.ownMentions}건은 보고서 근거로 우선 확인합니다.`,
    summaryLines: [
      `${cadence} 보도 흐름은 ${topCategories} 중심으로 형성됐습니다.`,
      riskText,
      `당사 언급 ${data.summary.ownMentions}건, 당사 부정 ${data.summary.ownNegative}건, 주의 ${data.summary.caution}건을 분리해 관리합니다.`,
      leadIssue?.title ? `대표 헤드라인은 "${leadIssue.title}"입니다.` : "대표 이슈는 기간 내 기사량과 논조를 기준으로 선정했습니다.",
    ],
    publishedAt: data.scope,
  };
}

function selectReportFrontArticle(articles = [], issues = []) {
  const candidates = [...articles, ...issues]
    .filter((item) => item && item.title && item.tone !== "제외");
  if (!candidates.length) return null;
  return candidates
    .map((item, index) => ({ item, index, score: reportFrontScore(item) }))
    .sort((a, b) => b.score - a.score || articleTimeValue(b.item) - articleTimeValue(a.item) || a.index - b.index)[0]?.item || null;
}

function reportFrontScore(item = {}) {
  const own = isOwnArticle(item);
  const sponsorship = isOwnSponsoredSportsArticle(item) || ["브랜드/스폰서십", "스폰서십"].includes(item.category);
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`;
  let score = 0;
  if (own && !sponsorship) score += 1000;
  if (own && !sponsorship && item.tone === "부정") score += 900;
  if (own && !sponsorship && item.tone === "긍정") score += 520;
  if (own && !sponsorship && item.tone === "중립") score += 360;
  if (own && !sponsorship && item.tone === "주의") score += 240;
  if (sponsorship) score += isOwnSponsoredSportsBrandArticle(item) ? 170 : 45;
  if (/우수인증|최다|성과|수상|배출|선정|1위|성장|매출|인증설계사/.test(text)) score += own ? 180 : 40;
  if (/사기|불법|제재|피해|사칭|개인정보|금융사고/.test(text)) score += own ? 220 : 80;
  if (item.category === "정책/규제") score += 45;
  if (item.tone === "주의") score += 35;
  if (item.tone === "부정") score += 80;
  if (item.tone === "긍정") score += 70;
  if (/브랜드평판|스포츠|골프|행사|문화센터|마이데이터 평판/.test(text) && !own) score -= 300;
  return score + Math.min(Number(item.score || 0), 100);
}

function sameIssue(a = {}, b = {}) {
  if (!a || !b) return false;
  const aKey = normalizeIssueTitle(a.title);
  const bKey = normalizeIssueTitle(b.title);
  return Boolean(aKey && bKey && aKey === bKey);
}

function normalizeIssueTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
