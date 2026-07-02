import React, { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  ExternalLink,
  FilePenLine,
  FileText,
  Gauge,
  LayoutDashboard,
  LineChart,
  LogIn,
  Megaphone,
  Newspaper,
  Radar,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TrendingDown,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adRows,
  contextRules,
  gaCompetitorSeed,
  journalistRows,
  keywordGroups,
  navItems,
  periodData,
  periodTabs,
  pressInfluence,
  pressRegistry,
  watchJobs,
} from "./data";
import {
  generatePressReleaseWithGemini,
  generateScrapAnalysisWithGemini,
  loadOperationalData,
  saveArticleScrap,
  saveClassificationFeedback,
  saveScrapAnalysisReport,
  triggerNewsCollection,
  verifyDashboardLogin,
} from "./liveData";
import {
  buildOperationsHealth,
  HealthStatusPill,
  NEGATIVE_WATCH_CADENCE_LABEL,
  NEGATIVE_WATCH_SHORT_LABEL,
} from "./operationsHealth";
import { articleMatchesDeepLink, readInitialRoute } from "./routeUtils";
import "./styles.css";
import "./report.css";

const loadGACompetitorIntel = () => import("./GACompetitorIntel");
const loadManagement = () => import("./Management");
const loadMediaAnalysis = () => import("./MediaAnalysis");
const loadPressReleaseStudio = () => import("./PressReleaseStudio");
const loadReports = () => import("./Reports");
const loadRiskCenterV2 = () => import("./RiskCenterV2");
const loadStockMarketDashboard = () => import("./StockMarketDashboard");

const GACompetitorIntel = React.lazy(loadGACompetitorIntel);
const Management = React.lazy(loadManagement);
const MediaAnalysis = React.lazy(loadMediaAnalysis);
const PressReleaseStudio = React.lazy(loadPressReleaseStudio);
const Reports = React.lazy(loadReports);
const RiskCenterV2 = React.lazy(loadRiskCenterV2);
const StockMarketDashboard = React.lazy(loadStockMarketDashboard);

const featureModuleLoaders = {
  media: loadMediaAnalysis,
  reports: loadReports,
  risk: loadRiskCenterV2,
  management: loadManagement,
  stocks: loadStockMarketDashboard,
  gaIntel: loadGACompetitorIntel,
  pressRelease: loadPressReleaseStudio,
};

function preloadFeatureSection(sectionId) {
  const loader = featureModuleLoaders[sectionId];
  if (typeof loader === "function") loader();
}

function preloadFeatureSections(sectionIds = []) {
  sectionIds.forEach(preloadFeatureSection);
}

const navIcons = {
  overview: LayoutDashboard,
  monitoring: Search,
  regulators: FileText,
  media: LineChart,
  pressRelease: Megaphone,
  stocks: WalletCards,
  gaIntel: Building2,
  clipping: Bookmark,
  scraps: Bookmark,
  risk: ShieldCheck,
  reports: FileText,
  management: Settings,
};

const navSections = [
  { title: "언론·PR", ids: ["overview", "monitoring", "media", "regulators", "pressRelease", "clipping", "scraps", "risk", "reports"] },
  { title: "시장·공시", ids: ["stocks"] },
  { title: "GA·채널", ids: ["gaIntel"] },
  { title: "운영관리", ids: ["management"] },
];

const navItemMap = new Map(navItems.map((item) => [item.id, item]));

const chartColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];
const TONE_FILTER_OPTIONS = ["긍정", "중립", "주의", "부정", "제외"];
const TONE_SORT_WEIGHT = new Map(TONE_FILTER_OPTIONS.map((label, index) => [label, index]));
const GITHUB_REPO = "incarmarketing/news-monitor";
const PRESS_INFLUENCE_LIMIT = 6;
const WORKFLOW_HEALTH_TARGETS = [
  { id: "negative-watch.yml", label: "부정기사 감시" },
  { id: "news-briefing.yml", label: "보고서 생성·발송" },
  { id: "regulator-releases.yml", label: "금융당국 보도자료" },
  { id: "pages-dashboard.yml", label: "대시보드 배포" },
];

async function loadGithubWorkflowHealth() {
  if (typeof fetch === "undefined") return { status: "unsupported", workflows: [] };
  const workflows = await Promise.all(WORKFLOW_HEALTH_TARGETS.map(async (target) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${target.id}/runs?branch=main&per_page=5`;
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`github_${response.status}`);
      const payload = await response.json();
      const latest = Array.isArray(payload.workflow_runs) ? payload.workflow_runs[0] : null;
      const previousFailures = Array.isArray(payload.workflow_runs)
        ? payload.workflow_runs.filter((run) => ["failure", "timed_out", "action_required"].includes(run.conclusion)).length
        : 0;
      return {
        ...target,
        status: "live",
        previousFailures,
        latest: latest ? {
          id: latest.id,
          title: latest.display_title || latest.name || target.label,
          event: latest.event || "",
          status: latest.status || "",
          conclusion: latest.conclusion || "",
          createdAt: latest.created_at || "",
          updatedAt: latest.updated_at || latest.created_at || "",
          url: latest.html_url || "",
        } : null,
      };
    } catch (error) {
      return {
        ...target,
        status: "error",
        error: error?.message || "workflow_fetch_failed",
        latest: null,
        previousFailures: 0,
      };
    }
  }));
  return {
    status: workflows.some((item) => item.status === "live") ? "live" : "error",
    checkedAt: new Date().toISOString(),
    workflows,
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function operationsFingerprint(data = {}) {
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const latest = articles.slice(0, 8).map((article) => [
    article.articleHash || article.id || article.link || article.title || "",
    article.date || "",
    article.time || "",
    article.score || 0,
  ].join("|")).join(";");
  return `${articles.length}:${latest}`;
}

function workflowFinishedAfter(workflowHealth = {}, workflowId = "news-briefing.yml", startedAt = 0) {
  const workflow = (workflowHealth.workflows || []).find((item) => item.id === workflowId);
  const latest = workflow?.latest;
  if (!latest) return null;
  const updatedAt = new Date(latest.updatedAt || latest.createdAt || "").getTime();
  if (!Number.isFinite(updatedAt) || updatedAt < startedAt - 5000) return null;
  if (latest.status !== "completed") return null;
  return latest.conclusion || "unknown";
}

function App() {
  const initialRoute = useMemo(() => readInitialRoute(), []);
  const [activeSection, setActiveSection] = useState(initialRoute.section);
  const [period, setPeriod] = useState("daily");
  const [operations, setOperations] = useState({ status: "loading", message: "연결 확인 중", articles: [] });
  const [loginOpen, setLoginOpen] = useState(false);
  const [monitoringPreset, setMonitoringPreset] = useState(initialRoute.monitoringPreset);
  const [working, setWorking] = useState(false);
  const [workLabel, setWorkLabel] = useState("");
  const [workflowHealth, setWorkflowHealth] = useState({ status: "loading", workflows: [] });
  const workTimers = useRef([]);
  const refreshGeneration = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const preloadCoreScreens = () => preloadFeatureSections([
      "media",
      "reports",
      "risk",
      "stocks",
      "gaIntel",
      "management",
      "pressRelease",
    ]);
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preloadCoreScreens, { timeout: 1800 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timerId = window.setTimeout(preloadCoreScreens, 700);
    return () => window.clearTimeout(timerId);
  }, []);

  const clearWorkTimers = () => {
    workTimers.current.forEach((timer) => window.clearTimeout(timer));
    workTimers.current = [];
  };

  const finishWorkStatus = (label, message = "") => {
    setWorking(true);
    setWorkLabel(message || `${label} 완료`);
    clearWorkTimers();
    workTimers.current.push(window.setTimeout(() => {
      setWorking(false);
      setWorkLabel("");
    }, 7000));
  };

  const refreshOperations = async (options = {}) => {
    const trigger = options.trigger === true;
    const workflows = Array.isArray(options.workflows) && options.workflows.length
      ? options.workflows
      : options.workflow === "all"
        ? ["news-briefing.yml", "regulator-releases.yml"]
        : [options.workflow || "news-briefing.yml"];
    const label = options.label || (workflows.length > 1
      ? "전체 운영 갱신"
      : workflows[0] === "regulator-releases.yml"
        ? "금융당국 보도자료 갱신"
        : "뉴스 수집·분석 갱신");
    const startedAt = Date.now();
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    const beforeFingerprint = operationsFingerprint(operations);
    clearWorkTimers();
    setWorking(true);
    setWorkLabel(`${label} 작업 중`);
    setOperations((current) => ({
      ...current,
      status: trigger ? current.status : "loading",
      message: trigger ? `${label} 요청 중` : "연결 확인 중",
    }));
    let triggerMessage = "";
    let triggerFailed = false;
    if (trigger) {
      try {
        for (const workflow of workflows) {
          await triggerNewsCollection({
            workflow,
            period_reports: "none",
            send_slack: false,
            report_slot: "auto",
            source: options.source || "dashboard_manual_refresh",
          });
        }
        triggerMessage = `${label} 요청 완료`;
      } catch (error) {
        triggerMessage = `${label} 요청 실패: ${error?.message || "확인 필요"}`;
        triggerFailed = true;
      }
    }
    const next = await loadOperationalData();
    setOperations(triggerMessage ? { ...next, message: `${triggerMessage} · ${next.message}` } : next);
    if (trigger && triggerFailed) {
      setWorkLabel(triggerMessage);
      workTimers.current.push(window.setTimeout(() => {
        setWorking(false);
        setWorkLabel("");
      }, 10000));
      return;
    }
    if (trigger) {
      const maxAttempts = workflows.includes("news-briefing.yml") ? 24 : 12;
      const intervalMs = workflows.includes("news-briefing.yml") ? 15000 : 10000;
      let latestData = next;
      let changed = operationsFingerprint(next) !== beforeFingerprint;
      let finishedConclusion = "";
      for (let attempt = 1; attempt <= maxAttempts && refreshGeneration.current === generation; attempt += 1) {
        if (changed) break;
        setWorkLabel(`${label} 반영 확인 중 · ${attempt}/${maxAttempts}`);
        await wait(intervalMs);
        if (refreshGeneration.current !== generation) return;
        latestData = await loadOperationalData();
        setOperations({ ...latestData, message: `${label} 반영 확인 중 · ${latestData.message}` });
        changed = operationsFingerprint(latestData) !== beforeFingerprint;
        const nextWorkflowHealth = await loadGithubWorkflowHealth();
        setWorkflowHealth(nextWorkflowHealth);
        const workflowConclusions = workflows
          .map((workflow) => workflowFinishedAfter(nextWorkflowHealth, workflow, startedAt))
          .filter(Boolean);
        const failedConclusion = workflowConclusions.find((item) => item !== "success");
        finishedConclusion = failedConclusion || (workflowConclusions.length === workflows.length ? "success" : "");
        if (failedConclusion) break;
        if (finishedConclusion === "success" && attempt >= 2) break;
      }
      if (refreshGeneration.current !== generation) return;
      const finalData = await loadOperationalData();
      const finalChanged = operationsFingerprint(finalData) !== beforeFingerprint;
      const suffix = finalChanged
        ? "신규 데이터 반영 완료"
        : finishedConclusion === "success"
          ? "수집 완료 · 중복 제거 후 추가 기사 없음"
          : finishedConclusion
            ? `수집 종료 상태 확인 필요: ${finishedConclusion}`
            : "수집 요청 완료 · GitHub Actions 지연 가능";
      setOperations({ ...finalData, message: `${suffix} · ${finalData.message}` });
      finishWorkStatus(label, `${label} ${suffix}`);
      return;
    }
    finishWorkStatus(label);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await loadOperationalData();
      if (active) setOperations(next);
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await loadGithubWorkflowHealth();
      if (active) setWorkflowHealth(next);
    };
    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => () => clearWorkTimers(), []);

  useEffect(() => {
    const openLogin = () => setLoginOpen(true);
    window.addEventListener("news-monitor:login-required", openLogin);
    return () => window.removeEventListener("news-monitor:login-required", openLogin);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", activeSection);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeSection]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia("(max-width: 1240px)");
    const guardReportsOnMobile = () => {
      if (query.matches && activeSection === "reports") {
        setActiveSection("overview");
      }
    };
    guardReportsOnMobile();
    query.addEventListener?.("change", guardReportsOnMobile);
    return () => query.removeEventListener?.("change", guardReportsOnMobile);
  }, [activeSection]);

  const baseData = periodData[period];
  const needsPeriodData = activeSection === "reports";
  const needsRealtimeData = activeSection === "overview";
  const needsManagementData = activeSection === "management";
  const liveConnected = operations.status === "live";
  const allArticles = liveConnected ? operations.articles || [] : [];
  const scraps = liveConnected ? operations.scraps || [] : [];
  const needsScopedArticles = needsPeriodData || (needsManagementData && !liveConnected);
  const scopedArticles = useMemo(
    () => needsScopedArticles ? filterArticlesByPeriod(operations.articles || [], period) : [],
    [operations.articles, period, needsScopedArticles],
  );
  const scopedReportRuns = useMemo(
    () => needsPeriodData ? filterRowsByPeriod(operations.reportRuns || [], period) : [],
    [operations.reportRuns, period, needsPeriodData],
  );
  const data = useMemo(
    () => needsPeriodData ? composePeriodData(baseData, scopedArticles, scopedReportRuns, liveConnected, period) : baseData,
    [baseData, scopedArticles, scopedReportRuns, liveConnected, period, needsPeriodData],
  );
  const realtimeArticles = useMemo(
    () => needsRealtimeData ? selectRealtimeArticles(allArticles) : [],
    [allArticles, needsRealtimeData],
  );
  const realtimeData = useMemo(
    () => needsRealtimeData ? composeRealtimeData(periodData.daily, realtimeArticles, liveConnected) : periodData.daily,
    [realtimeArticles, liveConnected, needsRealtimeData],
  );
  const management = useMemo(
    () => needsManagementData ? composeManagementData(operations, liveConnected ? operations.articles || [] : scopedArticles) : {},
    [operations, scopedArticles, liveConnected, needsManagementData],
  );
  const notifications = liveConnected ? operations.notifications || [] : [];
  const jobs = liveConnected && operations.watchRuns?.length
    ? [
        {
          label: "부정기사 감시",
          cadence: NEGATIVE_WATCH_CADENCE_LABEL,
          latest: operations.watchRuns[0].latest,
          state: operations.watchRuns[0].state,
        },
        ...watchJobs.filter((job) => job.label !== "부정기사 감시"),
      ]
    : [];

  const openMonitoring = (preset = {}) => {
    setMonitoringPreset({ period, ...preset, stamp: Date.now() });
    setActiveSection("monitoring");
  };

  const handleClassificationFeedbackSaved = async (result, article, correction) => {
    const immediateFeedback = buildImmediateFeedbackRow(result, article, correction);
    setOperations((current) => ({
      ...current,
      articles: patchCorrectedArticles(current.articles || [], article, correction),
      feedback: immediateFeedback
        ? upsertFeedbackRows(current.feedback || [], immediateFeedback)
        : current.feedback || [],
      feedbackGeneratedAt: new Date().toISOString(),
    }));
    await refreshOperations({ label: "분류 수정 반영 확인" });
  };

  const handleArticleScrapSaved = async (article) => {
    const saved = await saveArticleScrap(article);
    const rows = Array.isArray(saved) ? saved : [];
    const normalized = rows.map(normalizeSavedScrapRow).filter(Boolean);
    if (!normalized.length) return;
    setOperations((current) => ({
      ...current,
      scraps: upsertScrapRows(current.scraps || [], normalized),
    }));
  };

  const handleScrapAnalysisSaved = (report) => {
    if (!report) return;
    setOperations((current) => ({
      ...current,
      scrapAnalysisReports: upsertScrapAnalysisReports(current.scrapAnalysisReports || [], report),
    }));
  };

  const dashboardHelpers = useMemo(() => ({
    ArticleSummaryBlock,
    ArticleDecisionNote,
    AdSpendChart,
    CategoryChart,
    Chip,
    DataSourcePill,
    Fact,
    InsightList,
    KeywordBrief,
    KeywordManagerTable,
    KeywordRuleValidation,
    MonthlyIssueDigest,
    PageTitle,
    Panel,
    PressInfluence,
    StatCard,
    ToneTrend,
    addDaysToDateKey,
    articleSelectionKey,
    buildRiskCenterFacts,
    buildRiskResponseDraft,
    buildRiskResponseIssue,
    extractFirstUrl,
    findArticleByUrl,
    makeManualRiskArticle,
    normalizeRiskUrl,
    openArticleLink,
    riskDraftArticlePayload,
    riskDraftMatchesArticle,
    riskDraftTypeLabel,
    selectRiskCenterArticles,
    PeriodControl,
    articlePrimarySummaryTopic,
    articleTimeValue,
    availableReportMonths,
    buildAdSpendData,
    buildArticleSummaryLines,
    buildFeedbackRuleCandidates,
    buildDateRangeToneTrend,
    buildKeywordFlow,
    buildKeywordRuleValidation,
    buildMediaAnalysisIssues,
    buildMediaCrmSignals,
    buildPeriodObservations,
    buildPressInfluence,
    buildReporterCrmSignals,
    buildReportCategoryFlowRows,
    buildReportPeriodScope,
    buildReportToneTrend,
    compactArticleSummary,
    composePeriodData,
    expandReportIssues,
    filterRowsByMonth,
    filterRowsByPeriod,
    formatReportMonthOption,
    formatFeedbackStamp,
    formatMoney,
    groupArticles,
    hideReporterLocal,
    isOfficialRegulatorSource,
    isOwnArticle,
    isOwnSponsoredSportsArticle,
    isOwnSponsoredSportsBrandArticle,
    keywordCategoryLabel,
    keywordCategoryRule,
    keywordCategoryTone,
    keywordDefaultToneLabel,
    keywordEntityTypeLabel,
    keywordMatchModeLabel,
    keywordMatchTargetLabel,
    keywordRowsFromGroups,
    keywordSubcategoryLabel,
    mergeKeywordRows,
    mergeMediaRows,
    mergeReporterRows,
    normalizeMediaDraft,
    normalizeReporterDraft,
    periodScopeLabel,
    printCurrentView,
    printAdReport,
    reporterDraftFromRemote,
    selectDashboardKeywords,
    splitKeywordTerms,
    upsertKeywordRow,
    upsertMediaLocal,
    upsertReporterLocal,
    unique,
    domainsForPressName,
    composeMediaAnalysisData,
    dateRangeDayCount,
    filterArticlesByDateRange,
    latestArticleDate,
    normalizeAnalysisDateRange,
    periodIssueMeta,
  }), []);

  const View = {
    overview: Overview,
    monitoring: Monitoring,
    regulators: Regulators,
    media: MediaAnalysis,
    pressRelease: PressReleaseStudio,
    stocks: StockMarketDashboard,
    gaIntel: GACompetitorIntel,
    clipping: Clipping,
    scraps: Scraps,
    risk: RiskCenterV2,
    reports: Reports,
    management: Management,
  }[activeSection] || Overview;

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="주요 메뉴">
        <Header working={working} workLabel={workLabel} />
        {navSections.map((section) => (
          <div className="side-group" key={section.title}>
            <div className="side-group-title">{section.title}</div>
            {section.ids.map((id) => navItemMap.get(id)).filter(Boolean).map((item) => {
              const Icon = navIcons[item.id] || FileText;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={activeSection === item.id ? "active" : ""}
                  data-section={item.id}
                  onMouseEnter={() => preloadFeatureSection(item.id)}
                  onFocus={() => preloadFeatureSection(item.id)}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </aside>
      <React.Suspense fallback={<main className="workspace"><section className="panel empty-state-panel"><h2>화면 불러오는 중</h2></section></main>}>
        <View
          data={activeSection === "overview" ? realtimeData : data}
          period={period}
          setPeriod={setPeriod}
          articles={
            activeSection === "monitoring" || activeSection === "regulators"
              ? allArticles
              : activeSection === "overview"
                ? realtimeArticles
                : scopedArticles
          }
          allArticles={allArticles}
          scraps={scraps}
          jobs={jobs}
          notifications={notifications}
          management={management}
          operations={operations}
          stockMarket={operations.stockMarket}
          gaIntel={operations.gaIntel || gaCompetitorSeed}
          workflowHealth={workflowHealth}
          isWorking={working}
          onRefreshOperations={refreshOperations}
          onFeedbackSaved={handleClassificationFeedbackSaved}
          onScrapSaved={handleArticleScrapSaved}
          onScrapAnalysisSaved={handleScrapAnalysisSaved}
          setActiveSection={setActiveSection}
          monitoringPreset={monitoringPreset}
          onOpenMonitoring={openMonitoring}
          helpers={dashboardHelpers}
        />
      </React.Suspense>
      <LoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={async () => {
          setLoginOpen(false);
          await refreshOperations();
        }}
      />
    </div>
  );
}

function Header({ working = false, workLabel = "" }) {
  const userText = "최진우 1611499 관리자";

  return (
    <div className="side-brand">
      <div className="side-brand-main">
        <img
          className="side-brand-logo"
          src={`${import.meta.env.BASE_URL || "./"}assets/incar-logo-white.png`}
          alt="인카금융서비스"
        />
        <strong>인카 모니터링 시스템</strong>
        <span>Monitoring Workspace</span>
      </div>
      <div className="side-brand-user">
        <span>{userText}</span>
        {working && <em>작업 중{workLabel ? ` · ${workLabel}` : ""}</em>}
      </div>
    </div>
  );
}

function PeriodControl({ period, setPeriod, compact = false }) {
  return (
    <div className={compact ? "period-control compact" : "period-control"} aria-label="기간 선택">
      {periodTabs.map((item) => (
        <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => setPeriod(item.id)}>
          <span className="desktop-only">{item.label}</span>
          <span className="mobile-only">{item.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function LoginDialog({ open, onClose, onLoggedIn }) {
  const [employeeNo, setEmployeeNo] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("운영 DB 확인 중");
    try {
      const result = await verifyDashboardLogin(employeeNo.trim(), password);
      if (!result?.ok) {
        setStatus(result?.message || "로그인 정보를 확인해 주세요.");
        return;
      }
      await onLoggedIn();
    } catch {
      setStatus("Supabase 설정 또는 로그인 정보를 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="login-panel" onSubmit={submit}>
        <button type="button" className="icon-button close" onClick={onClose} aria-label="닫기">
          <X />
        </button>
        <h2>운영 데이터 연결</h2>
        <p>기존 대시보드와 같은 사번 로그인으로 기사, 언론사, 기자, 광고비 데이터를 불러옵니다.</p>
        <label>
          <span>사번</span>
          <input value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} autoFocus />
        </label>
        <label>
          <span>비밀번호</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {status && <div className="login-status">{status}</div>}
        <button className="primary-button" disabled={submitting}>
          <LogIn />연결
        </button>
      </form>
    </div>
  );
}

function Overview({ data, articles, jobs, notifications, setActiveSection, onOpenMonitoring, operations, workflowHealth, isWorking, onRefreshOperations }) {
  const { summary } = data;
  const isLoading = operations?.status === "loading" || isWorking;
  const operationsHealth = useMemo(
    () => buildOperationsHealth({
      operations,
      notifications,
      watchRuns: operations?.watchRuns || [],
      reportRuns: operations?.reportRuns || [],
      jobRuns: operations?.jobRuns || [],
      workflowHealth,
    }),
    [operations, notifications, workflowHealth],
  );
  const watchHealth = operationsHealth.items.find((item) => item.title === "부정기사 감시");
  const reportHealth = operationsHealth.items.find((item) => item.title === "일일보고서");
  const notificationHealth = operationsHealth.items.find((item) => item.title === "슬랙");
  const actionsHealth = operationsHealth.items.find((item) => item.title === "GitHub Actions");
  const historyHealth = operationsHealth.items.find((item) => item.title === "Supabase 기록");
  return (
    <main className="workspace">
      <TerminalCommandBar
        data={data}
        summary={summary}
        operationsHealth={operationsHealth}
        notificationHealth={notificationHealth}
        reportHealth={reportHealth}
        onOpenMonitoring={onOpenMonitoring}
      />

      <nav className="dashboard-mobile-home" aria-label="모바일 대시보드 바로가기">
        <button type="button" onClick={() => setActiveSection("monitoring")}>모니터링</button>
        <button type="button" onClick={() => setActiveSection("clipping")}>클리핑</button>
        <button type="button" onClick={() => setActiveSection("risk")}>대응센터</button>
      </nav>

      <section className="terminal-dashboard-grid">
        <div className="terminal-main-stack">
          <RiskPriorityQueue issues={data.issues} onOpenMonitoring={onOpenMonitoring} />
          <section className="terminal-analysis-board">
            <Panel title="분류별 기사량" icon={LineChart} meta="기간 기준">
              <CategoryChart rows={data.categoryFlow} verticalBars />
            </Panel>
            <Panel title="언론사별 보도량" icon={Building2} meta="상위 6개사">
              <PressInfluence rows={data.pressInfluence} onOpenMonitoring={onOpenMonitoring} />
            </Panel>
          </section>
        </div>
        <OpsStatusRail
          jobs={jobs}
          summary={summary}
          operations={operations}
          watchHealth={watchHealth}
          notificationHealth={notificationHealth}
          reportHealth={reportHealth}
          actionsHealth={actionsHealth}
          historyHealth={historyHealth}
          notifications={notifications}
          isLoading={isLoading}
          onRefreshOperations={onRefreshOperations}
        />
      </section>

    </main>
  );
}

function DashboardClippingPanel({ candidates = [], scraps = [], onScrapSaved, onOpenMonitoring }) {
  return (
    <section className="dashboard-clipping-panel">
      <div className="clipping-panel-head">
        <div>
          <span>REPORT CLIPPING</span>
          <h2>AI 클리핑 후보</h2>
        </div>
        <button type="button" className="ghost-button compact-button" onClick={() => onOpenMonitoring?.({ clipping: true })}>
          후보 더보기
        </button>
      </div>
      <div className="dashboard-clipping-list">
        {candidates.length ? candidates.map((article, index) => {
          const scrapped = isArticleScrapped(article, scraps);
          return (
            <article className={`dashboard-clipping-card ${toneCssClass(article.tone)}`} key={`${articleSelectionKey(article)}-${index}`}>
              <div className="clipping-card-top">
                <div className="clipping-card-meta">
                  <Chip tone={article.tone}>{article.tone}</Chip>
                  <Chip>{article.category}</Chip>
                  <span>{formatIssueMeta(article)}</span>
                </div>
                <div className="clipping-card-actions">
                  <ArticleScrapButton article={article} scrapped={scrapped} onScrapSaved={onScrapSaved} />
                  {article.link && article.link !== "#" && (
                    <a href={article.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, article.link)}>
                      <ExternalLink /> 기사 열기
                    </a>
                  )}
                </div>
              </div>
              <h3>{article.title}</h3>
              <ArticleSummaryBlock item={article} dense />
              <ArticleDecisionNote item={article} hideClippingLabel />
            </article>
          );
        }) : (
          <article className="dashboard-clipping-empty">
            <b>현재 클리핑 후보가 없습니다.</b>
            <span>분석 근거가 충분한 기사만 보고서 후보로 표시합니다.</span>
          </article>
        )}
      </div>
    </section>
  );
}

function buildClippingCandidates(articles = [], scraps = [], limit = 12) {
  const pool = [];
  const seen = new Set();
  (articles || []).forEach((article) => {
    const key = articleSelectionKey(article);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pool.push(article);
  });
  const recommended = selectClippingRecommendations(pool, scraps).slice(0, limit);
  if (recommended.length) return recommended;
  return pool
    .filter((article) => ["부정", "주의", "긍정"].includes(article?.tone) || article?.category === "당사")
    .sort((a, b) => toneRank(b.tone) - toneRank(a.tone) || articleTimeValue(b) - articleTimeValue(a))
    .slice(0, limit)
    .map((article) => ({
      ...article,
      clippingRecommended: true,
      clippingReason: article.clippingReason || dashboardClippingFallbackReason(article),
    }));
}

function dashboardClippingFallbackReason(article = {}) {
  if (article.category === "당사" && article.tone === "긍정") {
    return "당사 평판 자산으로 활용 가능한 보도입니다. 노출 매체와 핵심 수치를 확인해 클리핑 후보로 검토합니다.";
  }
  if (article.category === "당사") {
    return "당사 직접 언급 기사입니다. 사실관계와 평판 영향을 우선 확인해야 합니다.";
  }
  if (article.tone === "부정") {
    return "부정 논조가 포함된 기사입니다. 당사 관련성, 반복 보도 여부, 대응 필요성을 분리해 확인합니다.";
  }
  if (article.tone === "주의" || article.category === "정책/규제") {
    return "시장·규제성 신호가 있는 기사입니다. 영업환경 또는 소비자 보호 기준 변화 가능성을 확인합니다.";
  }
  return "보고서 근거로 활용 가능한 관찰 기사입니다. 관련 이슈와 노출 맥락을 확인합니다.";
}


function TerminalCommandBar({ data, summary, operationsHealth, onOpenMonitoring }) {
  const risk = summary?.risk || operationsHealth?.statusLabel || "LOW";
  const negative = Number(summary?.ownNegative || 0);
  const caution = Number(summary?.caution || 0);
  const ownMentions = Number(summary?.ownMentions || 0);
  const latest = data?.generatedAt || summary?.watchTime || "-";
  return (
    <section className={`terminal-command-bar risk-${String(risk).toLowerCase()}`}>
      <div className="terminal-brief">
        <span className="terminal-command-kicker">MEDIA RISK COMMAND</span>
        <p className="terminal-command-meta">{data?.scope || "전체"} · 마지막 갱신 {latest}</p>
      </div>
      <div className="terminal-metrics">
        <button type="button" onClick={() => onOpenMonitoring?.({ ownOnly: true })}>
          <span>Risk</span>
          <b>{risk}</b>
          <em>당사 기준</em>
        </button>
        <button type="button" onClick={() => onOpenMonitoring?.({ tone: "부정" })}>
          <span>Negative</span>
          <b>{negative.toLocaleString("ko-KR")}</b>
          <em>즉시 확인</em>
        </button>
        <button type="button" onClick={() => onOpenMonitoring?.({ tone: "주의" })}>
          <span>Caution</span>
          <b>{caution.toLocaleString("ko-KR")}</b>
          <em>분리 관찰</em>
        </button>
        <button type="button" onClick={() => onOpenMonitoring?.({ ownOnly: true })}>
          <span>Own</span>
          <b>{ownMentions.toLocaleString("ko-KR")}</b>
          <em>당사 언급</em>
        </button>
      </div>
    </section>
  );
}

function RiskPriorityQueue({ issues = [], onOpenMonitoring }) {
  const ranked = buildDashboardIssueGroups(issues)
    .sort((a, b) => dashboardIssueScore(b) - dashboardIssueScore(a) || toneRank(b.tone) - toneRank(a.tone) || articleTimeValue(b) - articleTimeValue(a))
    .slice(0, 5);
  return (
    <section className="risk-priority-queue">
      <div className="queue-head">
        <div>
          <h2>주요 이슈</h2>
        </div>
        <button type="button" className="ghost-button compact-button" onClick={() => onOpenMonitoring?.({})}>
          전체 보기
        </button>
      </div>
      <div className="queue-list">
        {ranked.length ? ranked.map((issue, index) => (
          <article className={`queue-row ${toneCssClass(issue.tone)}`} key={`${issue.source}-${issue.title}-${index}`}>
            <div className="queue-rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="queue-body">
              <div className="queue-meta">
                <Chip tone={issue.tone}>{issue.tone}</Chip>
                <Chip>{issue.category}</Chip>
                <span>{formatIssueMeta(issue)}</span>
              </div>
              <h3>{issue.title}</h3>
              <div className="queue-stats">
                <span>대표 {issue.representativeSource || issue.source || "-"}</span>
                <span>관련 {Number(issue.relatedCount || 1).toLocaleString("ko-KR")}건</span>
                <span>매체 {Number(issue.relatedSourceCount || 1).toLocaleString("ko-KR")}곳</span>
              </div>
              <IssueGroupPreview issue={issue} />
            </div>
            <div className="queue-actions">
              <button type="button" className="ghost-button compact-button" onClick={() => onOpenMonitoring?.(issueMonitoringPreset(issue))}>
                묶음 보기
              </button>
              {issue.link && issue.link !== "#" && (
                <a href={issue.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, issue.link)}>
                  <ExternalLink /> 대표 기사
                </a>
              )}
            </div>
          </article>
        )) : (
          <article className="queue-empty">
            <b>표시할 주요 이슈가 없습니다.</b>
            <span>운영 DB 연결 후 오늘 기준 주요 이슈가 표시됩니다.</span>
          </article>
        )}
      </div>
    </section>
  );
}

function buildDashboardIssueGroups(issues = []) {
  const candidates = [];
  (issues || []).forEach((issue) => {
    const normalized = normalizeMajorIssueGroup(issue);
    const members = Array.isArray(normalized.relatedArticles) && normalized.relatedArticles.length
      ? normalized.relatedArticles
      : [normalized];
    members.map(normalizeArticleDisplay).forEach((member) => {
      if (!member?.title || !isMajorIssueCandidate(member)) return;
      candidates.push(member);
    });
  });

  const buckets = new Map();
  candidates.forEach((article) => {
    const key = majorIssueDedupeKey(article) || `title:${normalizeGroupTitle(article.title || "").slice(0, 80)}`;
    if (!key) return;
    const bucket = buckets.get(key) || [];
    bucket.push(article);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries()).map(([groupKey, members]) => {
    const relatedArticles = dedupeIssueMembers(members.map(normalizeArticleDisplay));
    const representative = [...relatedArticles]
      .sort((a, b) => dashboardIssueScore(b) - dashboardIssueScore(a) || articleTimeValue(b) - articleTimeValue(a))[0] || relatedArticles[0] || {};
    const sources = unique(relatedArticles.map((item) => item.source).filter(Boolean));
    return normalizeMajorIssueGroup({
      ...representative,
      groupKey,
      relatedArticles,
      relatedCount: relatedArticles.length,
      relatedSourceCount: sources.length,
      relatedSources: sources,
      representativeSource: representative.source || sources[0] || "",
    });
  });
}

function normalizeMajorIssueGroup(issue = {}) {
  const display = normalizeArticleDisplay(issue);
  const members = dedupeIssueMembers(
    (Array.isArray(display.relatedArticles) && display.relatedArticles.length ? display.relatedArticles : [display])
      .map(normalizeArticleDisplay),
  );
  const sources = unique(members.map((item) => item.source).filter(Boolean));
  return {
    ...display,
    relatedArticles: members,
    relatedCount: Math.max(Number(display.relatedCount || 0), members.length || 1),
    relatedSourceCount: Math.max(Number(display.relatedSourceCount || 0), sources.length || 1),
    relatedSources: display.relatedSources || sources,
    representativeSource: display.representativeSource || display.source || sources[0] || "",
  };
}

function IssueGroupPreview({ issue }) {
  const members = (Array.isArray(issue.relatedArticles) && issue.relatedArticles.length ? issue.relatedArticles : [issue])
    .map(normalizeArticleDisplay)
    .slice(0, 3);
  if (members.length <= 1) return null;
  return (
    <div className="queue-related-preview" aria-label="관련 기사 미리보기">
      {members.map((member, idx) => (
        <span key={`${member.link || member.title}-${idx}`}>
          <b>{member.source || "언론사 확인"}</b>
          <em>{shortenTitle(member.title, 44)}</em>
        </span>
      ))}
    </div>
  );
}

function shortenTitle(value = "", max = 48) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function issueMonitoringPreset(issue = {}) {
  const normalized = normalizeMajorIssueGroup(issue);
  const issueLinks = dedupeIssueMembers(normalized.relatedArticles || [normalized])
    .map((item) => normalizeRiskUrl(item.link || item.url || ""))
    .filter(Boolean);
  return {
    query: "",
    tone: "all",
    category: normalized.category || "all",
    source: "all",
    ownOnly: false,
    issueLinks,
    issueTitle: normalized.title || "",
  };
}

function toneRank(tone = "") {
  if (tone === "부정" || tone === "negative") return 4;
  if (tone === "주의" || tone === "caution") return 3;
  if (tone === "긍정" || tone === "positive") return 2;
  return 1;
}

function OpsStatusRail({
  jobs,
  summary,
  operations,
  watchHealth,
  notificationHealth,
  reportHealth,
  actionsHealth,
  historyHealth,
  notifications,
  isLoading,
  onRefreshOperations,
}) {
  return (
    <aside className="ops-status-rail">
      <div className="ops-rail-head">
        <div>
          <span>OPERATIONS</span>
          <b>운영 현황</b>
        </div>
        <button
          type="button"
          className="ghost-button compact-button ops-refresh-button"
          onClick={() => onRefreshOperations?.({ trigger: true, workflow: "all", source: "overview_operations", label: "전체 운영 갱신" })}
          disabled={isLoading}
        >
          <RefreshCw />갱신
        </button>
      </div>
      <OpsRuntimeStrip
        jobs={jobs}
        watchHealth={watchHealth}
        notificationHealth={notificationHealth}
        aiStatus={operations?.aiStatus}
      />
      <Panel title="슬랙 발송 이력" icon={Bell} meta={`최근 ${notifications.length.toLocaleString("ko-KR")}건`}>
        <NotificationList rows={notifications} />
      </Panel>
      <Panel title="보고서 자동화" icon={CalendarDays}>
        <ReportAutomationStatus reportHealth={reportHealth} actionsHealth={actionsHealth} historyHealth={historyHealth} />
      </Panel>
    </aside>
  );
}

function Monitoring({ data, articles, scraps = [], monitoringPreset, operations, isWorking, onRefreshOperations, onFeedbackSaved, onScrapSaved }) {
  const [isFilterPending, startFilterTransition] = useTransition();
  const regularArticles = useMemo(
    () => articles.filter((article) => !isOfficialRegulatorSource(article.source) && isUsableMonitoringArticle(article)),
    [articles],
  );
  const deferredRegularArticles = useDeferredValue(regularArticles);
  const latestDate = useMemo(() => latestArticleDate(deferredRegularArticles), [deferredRegularArticles]);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [tone, setTone] = useState("all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [ownOnly, setOwnOnly] = useState(false);
  const [viewMode, setViewMode] = useState("related");
  const [visible, setVisible] = useState(30);
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const sources = useMemo(() => unique(deferredRegularArticles.map((article) => article.source)).slice(0, 80), [deferredRegularArticles]);
  const categories = useMemo(() => unique(deferredRegularArticles.map((article) => article.category)).slice(0, 40), [deferredRegularArticles]);
  useEffect(() => {
    if (!latestDate || startDateInput || endDateInput || startDate || endDate) return;
    setStartDateInput(latestDate);
    setEndDateInput(latestDate);
    setStartDate(latestDate);
    setEndDate(latestDate);
  }, [endDate, endDateInput, latestDate, startDate, startDateInput]);
  useEffect(() => {
    if (!monitoringPreset) return;
    const presetQuery = Array.isArray(monitoringPreset.issueLinks) && monitoringPreset.issueLinks.length ? "" : (monitoringPreset.query || "");
    setQuery(presetQuery);
    setQueryInput(presetQuery);
    setTone(monitoringPreset.tone || "all");
    setCategory(monitoringPreset.category || "all");
    setSource(monitoringPreset.source || "all");
    setOwnOnly(Boolean(monitoringPreset.ownOnly));
    const range = resolveMonitoringDateRange(deferredRegularArticles, monitoringPreset);
    if (range.start || range.end) {
      setStartDateInput(range.start);
      setEndDateInput(range.end);
      setStartDate(range.start);
      setEndDate(range.end);
    }
    setVisible(30);
  }, [monitoringPreset, deferredRegularArticles]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const focusArticleHash = String(monitoringPreset?.articleHash || "").trim();
    const focusArticleLink = String(monitoringPreset?.articleLink || "").trim();
    const focusArticleTitle = String(monitoringPreset?.articleTitle || "").trim();
    const hasFocusTarget = Boolean(focusArticleHash || focusArticleLink || focusArticleTitle);
    const focusTargetAvailable = hasFocusTarget
      && deferredRegularArticles.some((article) => articleMatchesDeepLink(article, focusArticleHash, focusArticleLink, focusArticleTitle));
    const issueLinks = Array.isArray(monitoringPreset?.issueLinks)
      ? monitoringPreset.issueLinks.map((link) => normalizeRiskUrl(link)).filter(Boolean)
      : [];
    const issueLinkSet = new Set(issueLinks);
    const hasIssueTarget = issueLinkSet.size > 0;
    return deferredRegularArticles.filter((article) => {
      const text = `${article.title} ${article.source} ${article.keyword} ${article.summary}`.toLowerCase();
      const articleDate = article.date || "";
      const focusMatched = !focusTargetAvailable || articleMatchesDeepLink(article, focusArticleHash, focusArticleLink, focusArticleTitle);
      const issueMatched = !hasIssueTarget || issueLinkSet.has(normalizeRiskUrl(article.link || article.url || ""));
      return (
        issueMatched &&
        focusMatched &&
        (!needle || focusTargetAvailable || hasIssueTarget || text.includes(needle)) &&
        (!startDate || !articleDate || articleDate >= startDate) &&
        (!endDate || !articleDate || articleDate <= endDate) &&
        (hasIssueTarget || tone === "all" || article.tone === tone) &&
        (hasIssueTarget || category === "all" || article.category === category) &&
        (hasIssueTarget || !ownOnly || isOwnArticle(article)) &&
        (hasIssueTarget || source === "all" || article.source === source)
      );
    });
  }, [deferredRegularArticles, category, endDate, monitoringPreset, ownOnly, query, source, startDate, tone]);
  const applyDateFilter = () => {
    let nextStart = startDateInput;
    let nextEnd = endDateInput;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
      setStartDateInput(nextStart);
      setEndDateInput(nextEnd);
    }
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setVisible(30);
  };
  const deferredFiltered = useDeferredValue(filtered);
  const grouped = useMemo(
    () => viewMode === "related" ? buildRelatedArticleGroups(deferredFiltered) : [],
    [deferredFiltered, viewMode],
  );
  const visibleRows = viewMode === "related" ? grouped : deferredFiltered;
  const feedMeta = viewMode === "related"
    ? `${filtered.length.toLocaleString("ko-KR")}건 · 묶음 ${grouped.length.toLocaleString("ko-KR")}개`
    : `${filtered.length.toLocaleString("ko-KR")}건`;
  const isLoading = operations?.status === "loading" || isWorking || isFilterPending;
  const applyFilters = () => {
    startFilterTransition(() => {
      applyDateFilter();
      setQuery(queryInput);
      setVisible(30);
    });
  };

  return (
    <main className="workspace">
      <section className="filter-card monitoring-filter-card">
        <label>
          <span>시작 기준일</span>
          <input type="date" value={startDateInput} onChange={(event) => setStartDateInput(event.target.value)} />
        </label>
        <label>
          <span>종료 기준일</span>
          <input type="date" value={endDateInput} onChange={(event) => setEndDateInput(event.target.value)} />
        </label>
        <label className="tone-filter">
          <span>논조</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">전체</option>
            {TONE_FILTER_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="sort-filter">
          <span>정렬</span>
          <select value={viewMode} onChange={(event) => { setViewMode(event.target.value); setVisible(30); }}>
            <option value="related">관련순</option>
            <option value="latest">최신순</option>
          </select>
        </label>
        <label>
          <span>분류</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">전체</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>언론사</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">전체</option>
            {sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="wide-filter">
          <span>검색어</span>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setQuery(queryInput);
                setVisible(30);
              }
            }}
            placeholder="제목, 언론사, 키워드 검색"
          />
        </label>
        <div className="monitoring-filter-actions">
          <button className="primary-button filter-action" onClick={applyFilters}>
            조회/검색
          </button>
          <button className="ghost-button compact-button" onClick={() => {
            setQuery("");
            setQueryInput("");
            setTone("all");
            setCategory("all");
            setSource("all");
            setOwnOnly(false);
            setViewMode("related");
            setStartDateInput(latestDate);
            setEndDateInput(latestDate);
            setStartDate(latestDate);
            setEndDate(latestDate);
            setVisible(30);
          }}>
            초기화
          </button>
          <button type="button" className="primary-button compact-button"><Download />CSV 출력</button>
        </div>
      </section>
      <section className="monitoring-layout">
        <Panel title="수집 기사 피드" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed
            rows={visibleRows.slice(0, visible)}
            scraps={scraps}
            onFeedbackSaved={onFeedbackSaved}
            onScrapSaved={onScrapSaved}
          />
          {visibleRows.length > visible && (
            <button className="ghost-button full" onClick={() => setVisible((count) => count + 30)}>
              더보기
            </button>
          )}
        </Panel>
        <Panel title="문맥 필터 기준" icon={ShieldCheck} meta="키워드 컬럼별 해석">
          <RuleStack />
        </Panel>
      </section>
    </main>
  );
}

function Regulators({ articles = [], operations, isWorking, onRefreshOperations }) {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("all");
  const [source, setSource] = useState("all");
  const [tone, setTone] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const regulatorRows = useMemo(() => selectRegulatorRows(articles), [articles]);
  const keywords = useMemo(() => REGULATOR_KEYWORD_LABELS, []);
  const sources = useMemo(() => unique(regulatorRows.map((article) => article.source)).slice(0, 40), [regulatorRows]);
  const tones = useMemo(() => sortToneLabels(regulatorRows.map((article) => article.tone)).slice(0, 8), [regulatorRows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return regulatorRows.filter((article) => {
      const text = `${article.title || ""} ${article.source || ""} ${article.summary || ""} ${article.regulatorKeyword || ""}`.toLowerCase();
      return (
        (!needle || text.includes(needle)) &&
        (keyword === "all" || article.regulatorKeyword === keyword) &&
        (source === "all" || article.source === source) &&
        (tone === "all" || article.tone === tone)
      );
    });
  }, [keyword, query, regulatorRows, source, tone]);
  const selectedRows = useMemo(
    () => filteredRows.filter((article) => selected.has(articleSelectionKey(article))),
    [filteredRows, selected],
  );
  const analysisRows = selectedRows.length ? selectedRows : filteredRows.slice(0, 5);
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((article) => selected.has(articleSelectionKey(article)));
  const resetFilters = () => {
    setQuery("");
    setQueryInput("");
    setKeyword("all");
    setSource("all");
    setTone("all");
  };
  const toggleSelected = (article) => {
    const key = articleSelectionKey(article);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleVisibleSelection = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredRows.forEach((article) => next.delete(articleSelectionKey(article)));
      } else {
        filteredRows.forEach((article) => next.add(articleSelectionKey(article)));
      }
      return next;
    });
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Official Releases"
        title="금융당국 보도자료"
        description="금융감독원·금융위원회 보도자료를 5개 정책 키워드로 자동 분류해 확인합니다."
      />
      <section className="filter-card regulator-filter">
        <label className="wide-filter">
          <span>검색어</span>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setQuery(queryInput);
            }}
            placeholder="제목, 출처, 요약 검색"
          />
        </label>
        <label>
          <span>키워드</span>
          <select value={keyword} onChange={(event) => setKeyword(event.target.value)}>
            <option value="all">전체</option>
            {keywords.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>출처</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">전체</option>
            {sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>논조</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">전체</option>
            {tones.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className="primary-button filter-action" onClick={() => setQuery(queryInput)}>
          조회
        </button>
        <button className="ghost-button filter-action" onClick={resetFilters}>
          초기화
        </button>
      </section>
      <RegulatorDirectionPanel rows={analysisRows} selectedCount={selectedRows.length} totalCount={filteredRows.length} />
      <Panel title="보도자료 목록" icon={FileText} meta={`${filteredRows.length.toLocaleString("ko-KR")}건`}>
        <div className="regulator-list-actions">
          <button className="ghost-button compact-button" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? "선택 해제" : "현재 목록 선택"}
          </button>
          <span>{selectedRows.length ? `${selectedRows.length.toLocaleString("ko-KR")}건 선택` : "선택 기준 분류"}</span>
        </div>
        <RegulatorReleaseFeed rows={filteredRows} selected={selected} onToggle={toggleSelected} />
      </Panel>
    </main>
  );
}

function RegulatorDirectionPanel({ rows = [], selectedCount = 0, totalCount = 0 }) {
  const analysis = buildRegulatorDirectionAnalysis(rows);
  return (
    <section className="panel regulator-analysis-panel">
      <div className="panel-head">
        <h2><ShieldCheck />키워드 자동 분류</h2>
        <span>{selectedCount ? `${selectedCount.toLocaleString("ko-KR")}건 선택` : `최근 ${Math.min(totalCount, rows.length).toLocaleString("ko-KR")}건 기준`}</span>
      </div>
      <div className="regulator-keyword-board">
        <div className="regulator-keyword-summary">
          <b>{analysis.headline}</b>
          <span>{analysis.summary}</span>
        </div>
        <div className="regulator-theme-grid compact">
          {analysis.themes.map((theme) => (
            <article key={theme.label}>
              <span>{theme.label}</span>
              <b>{theme.count.toLocaleString("ko-KR")}건</b>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RegulatorReleaseFeed({ rows = [], selected, onToggle }) {
  return (
    <div className="regulator-release-list">
      {rows.map((row) => {
        const key = articleSelectionKey(row);
        const checked = selected.has(key);
        return (
          <article key={key} className={checked ? "regulator-release-row selected" : "regulator-release-row"}>
            <label>
              <input type="checkbox" checked={checked} onChange={() => onToggle(row)} />
              <span className="sr-only">보도자료 선택</span>
            </label>
            <div>
              <div className="feed-title-line">
                <Chip tone={row.tone}>{row.tone}</Chip>
                <span className="regulator-keyword-pill">{row.regulatorKeyword}</span>
                <b>{row.title}</b>
              </div>
              <span className="feed-meta">{formatFeedMeta(row, false)}</span>
            </div>
            {row.link && row.link !== "#" && (
              <a
                href={row.link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="보도자료 열기"
                onClick={(event) => openArticleLink(event, row.link)}
              >
                <ExternalLink />
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Clipping({ articles = [], allArticles = [], scraps = [], onOpenMonitoring, onScrapSaved }) {
  const sourceArticles = allArticles.length ? allArticles : articles;
  const candidates = useMemo(
    () => buildClippingCandidates(sourceArticles, scraps, 16),
    [sourceArticles, scraps],
  );
  const ownCount = candidates.filter((item) => item.category === "당사").length;
  const cautionCount = candidates.filter((item) => item.tone === "주의" || item.tone === "부정").length;
  const unsavedCount = candidates.filter((item) => !isArticleScrapped(item, scraps)).length;

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Report Clipping"
        title="클리핑"
        description="보고서와 임원 공유에 넣을 만한 기사 후보를 별도로 모아 검토합니다. 통합 대시보드는 현황판으로 두고, 클리핑 판단은 이 화면에서 처리합니다."
        right={(
          <button type="button" className="ghost-button" onClick={() => onOpenMonitoring?.({ clipping: true })}>
            <Search />모니터링에서 보기
          </button>
        )}
      />
      <section className="clipping-workspace">
        <div className="clipping-summary-grid">
          <article>
            <span>후보 기사</span>
            <b>{candidates.length.toLocaleString("ko-KR")}</b>
            <em>분석 근거 보유</em>
          </article>
          <article>
            <span>당사 관련</span>
            <b>{ownCount.toLocaleString("ko-KR")}</b>
            <em>직접 언급 우선</em>
          </article>
          <article>
            <span>주의/부정</span>
            <b>{cautionCount.toLocaleString("ko-KR")}</b>
            <em>리스크 검토 대상</em>
          </article>
          <article>
            <span>미스크랩</span>
            <b>{unsavedCount.toLocaleString("ko-KR")}</b>
            <em>검토 후 저장</em>
          </article>
        </div>
        <DashboardClippingPanel
          candidates={candidates}
          scraps={scraps}
          onScrapSaved={onScrapSaved}
          onOpenMonitoring={onOpenMonitoring}
        />
      </section>
    </main>
  );
}

function Scraps({ scraps, allArticles = [], operations = {}, onOpenMonitoring, onScrapSaved, onScrapAnalysisSaved }) {
  const [prompt, setPrompt] = useState("홍보 대응 관점에서 부정 이슈와 우호적으로 활용할 수 있는 기사 흐름을 나눠 분석해줘.");
  const [analysisReport, setAnalysisReport] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const grouped = groupArticles(scraps, "category").slice(0, 5).map(([name, value]) => ({ name, value }));
  const savedReports = Array.isArray(operations.scrapAnalysisReports) ? operations.scrapAnalysisReports : [];
  const activeReport = analysisReport || savedReports[0] || null;
  const activeReportBody = activeReport?.report || null;
  const canAnalyze = scraps.length > 0 && !analyzing;

  const handleAnalyze = async () => {
    if (!scraps.length) {
      setAnalysisError("먼저 분석할 기사를 스크랩해 주세요.");
      return;
    }
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysisStatus("Gemini Pro 분석 중");
    try {
      const payloadArticles = scraps.slice(0, 40).map(scrapAnalysisArticlePayload);
      const result = await generateScrapAnalysisWithGemini({
        prompt,
        articles: payloadArticles,
      });
      const localReport = buildLocalScrapAnalysisReport(result, prompt, scraps);
      setAnalysisReport(localReport);
      setAnalysisStatus("분석 완료 · 저장 중");
      try {
        const saved = await saveScrapAnalysisReport({
          prompt,
          articles: scraps,
          report: result.report || localReport.report,
          analysis: result.analysis || localReport.analysis,
          model: result.model || localReport.model,
          usageMetadata: result.usageMetadata || {},
          articleCount: result.articleCount || scraps.length,
        });
        const finalReport = saved || localReport;
        setAnalysisReport(finalReport);
        onScrapAnalysisSaved?.(finalReport);
        setAnalysisStatus("분석 보고서 저장 완료");
      } catch (saveError) {
        setAnalysisStatus("분석 완료 · DB 저장 확인 필요");
        setAnalysisError(`저장은 실패했지만 화면 보고서는 생성했습니다. ${saveError?.message || ""}`.trim());
      }
    } catch (error) {
      if (/session|invalid_session|missing_dashboard_session/i.test(error?.message || "")) {
        window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
      }
      setAnalysisError(`스크랩 분석 실패: ${error?.message || "Gemini 연결 확인 필요"}`);
      setAnalysisStatus("");
    } finally {
      setAnalyzing(false);
    }
  };

  const copyActiveReport = async (mode = "text") => {
    if (!activeReport) return;
    const text = mode === "json"
      ? JSON.stringify(activeReport.report || activeReport, null, 2)
      : formatScrapAnalysisText(activeReport.report || {}, activeReport);
    try {
      await navigator.clipboard.writeText(text);
      setAnalysisStatus(mode === "json" ? "JSON 복사 완료" : "분석 결과 복사 완료");
    } catch {
      setAnalysisError("클립보드 복사 권한을 확인해 주세요.");
    }
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Scrap File"
        title="주요 기사 스크랩"
        description="중요 기사를 모아 임원 보고, 홍보 대응, 동향 점검용으로 다시 분석하는 작업 공간입니다."
        right={(
          <button className="primary-button" disabled={!activeReport} onClick={() => openScrapAnalysisReport(activeReport)}>
            <FileText />HTML 보고서
          </button>
        )}
      />
      <section className="scrap-workspace-v2">
        <Panel title="스크랩 분석" icon={Bookmark} meta={`${scraps.length}건`}>
          <div className="scrap-preset-row-v2">
            {["임원 보고", "홍보 대응", "동향 점검"].map((label) => (
              <button key={label} className="ghost-button" onClick={() => setPrompt(`${label} 관점에서 스크랩 기사를 핵심 판단, 리스크, 후속 확인 포인트로 정리해줘.`)}>
                {label}
              </button>
            ))}
          </div>
          <textarea className="scrap-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <ScrapAnalysisPreview report={activeReportBody} fallbackCount={scraps.length} />
          {analysisStatus && <div className="scrap-analysis-status">{analysisStatus}</div>}
          {analysisError && <div className="scrap-analysis-status warning">{analysisError}</div>}
          <div className="scrap-actions-v2">
            <button className="primary-button" disabled={!canAnalyze} onClick={handleAnalyze}>
              {analyzing ? "분석 중" : "스크랩 분석"}
            </button>
            <button className="ghost-button" disabled={!activeReport} onClick={() => copyActiveReport("json")}>JSON 복사</button>
            <button className="ghost-button" disabled={!activeReport} onClick={() => copyActiveReport("text")}>결과 복사</button>
            <button className="ghost-button" disabled={!activeReport} onClick={() => openScrapAnalysisReport(activeReport)}>보고서 열기</button>
          </div>
          <ScrapAnalysisReportDigest report={activeReportBody} />
        </Panel>
        <div className="scrap-side-stack">
          <Panel title="최근 클리핑 보고서" icon={FileText} meta={`${savedReports.length}건`}>
            <div className="scrap-report-history">
              {savedReports.slice(0, 5).map((report) => (
                <button key={report.id} type="button" onClick={() => setAnalysisReport(report)}>
                  <span>{[report.date, report.time].filter(Boolean).join(" ") || "생성일 확인"} · {report.articleCount.toLocaleString("ko-KR")}건</span>
                  <b>{report.title}</b>
                  <em>{report.model || "Gemini"}</em>
                </button>
              ))}
              {!savedReports.length && <div className="risk-empty compact">저장된 클리핑 보고서가 아직 없습니다.</div>}
            </div>
          </Panel>
          <Panel title="스크랩 분류" icon={LineChart} meta="근거 구성">
            <CategoryChart rows={grouped.length ? grouped : [{ name: "스크랩", value: scraps.length }]} mini onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="스크랩 기사 목록" icon={Newspaper} meta={`${scraps.length}건`}>
            <ArticleFeed rows={scraps} scraps={scraps} onScrapSaved={onScrapSaved} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function ScrapAnalysisPreview({ report, fallbackCount = 0 }) {
  if (!report) {
    return (
      <div className="scrap-analysis-preview">
        <b>분석 대기</b>
        <p>스크랩 {fallbackCount.toLocaleString("ko-KR")}건을 기준으로 당사 이슈, 정책/규제, 업계 흐름, 활용 포인트를 한장 보고서로 정리합니다.</p>
      </div>
    );
  }
  return (
    <div className={`scrap-analysis-preview ${String(report.riskLevel || "LOW").toLowerCase()}`}>
      <span>{report.riskLevel || "LOW"}</span>
      <b>{report.title || "스크랩 기사 분석 보고서"}</b>
      <p>{report.executiveSummary || "분석 요약을 확인해 주세요."}</p>
    </div>
  );
}

function ScrapAnalysisReportDigest({ report }) {
  if (!report) return null;
  const findings = Array.isArray(report.keyFindings) ? report.keyFindings.slice(0, 3) : [];
  const risks = Array.isArray(report.risks) ? report.risks.slice(0, 2) : [];
  const followUps = Array.isArray(report.followUps) ? report.followUps.slice(0, 4) : [];
  return (
    <div className="scrap-report-digest">
      <section>
        <h3>핵심 판단</h3>
        {findings.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <b>{item.title}</b>
            <p>{item.body}</p>
            <em>{evidenceLabel(item.evidence)}</em>
          </article>
        ))}
      </section>
      <section>
        <h3>리스크 / 후속 확인</h3>
        {risks.map((item, index) => (
          <article key={`${item.title}-${index}`}>
            <b>{item.title}</b>
            <p>{item.body}</p>
            <em>{evidenceLabel(item.evidence)}</em>
          </article>
        ))}
        {!!followUps.length && (
          <ul>
            {followUps.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function scrapAnalysisArticlePayload(article = {}) {
  return {
    title: article.title || "",
    summary: compactArticleSummary(article) || article.summary || "",
    press: article.source || article.press || "",
    date: [article.date, article.time].filter(Boolean).join(" "),
    published_label: [article.date, article.time].filter(Boolean).join(" "),
    link: article.link || "",
    keyword: article.keyword || "",
    category_label: article.category || article.category_label || "",
    tone_label: article.tone || article.tone_label || "",
    risk: article.riskLevel || article.risk_level || "",
  };
}

function buildLocalScrapAnalysisReport(result = {}, prompt = "", articles = []) {
  const report = result.report && typeof result.report === "object"
    ? result.report
    : {
        title: "스크랩 기사 분석 보고서",
        subtitle: prompt,
        riskLevel: "LOW",
        executiveSummary: result.analysis || `스크랩 ${articles.length.toLocaleString("ko-KR")}건 기준으로 분석 결과를 정리했습니다.`,
        keyFindings: [],
        risks: [],
        opportunities: [],
        followUps: [],
        evidenceArticles: articles.slice(0, 5).map((article, index) => ({
          no: index + 1,
          press: article.source || "",
          title: article.title || "",
          summary: compactArticleSummary(article) || article.summary || "",
          tone: article.tone || "",
          link: article.link || "",
        })),
      };
  const now = new Date().toISOString();
  return {
    id: `local-${Date.now()}`,
    title: report.title || "스크랩 기사 분석 보고서",
    prompt,
    report,
    analysis: result.analysis || formatScrapAnalysisText(report),
    articleCount: Number(result.articleCount || articles.length || 0),
    articleHashes: articles.map((article) => article.articleHash || article.article_hash || article.id).filter(Boolean),
    model: result.model || "Gemini",
    usage: result.usageMetadata || {},
    status: "completed",
    createdAt: now,
    date: formatKstDateKey(new Date(now)),
    time: formatTime(now),
  };
}

function upsertScrapAnalysisReports(rows = [], row = null) {
  if (!row) return rows;
  const map = new Map(rows.map((item) => [String(item.id), item]));
  map.set(String(row.id), row);
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function evidenceLabel(values = []) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length ? `근거 ${rows.map((value) => `#${value}`).join(", ")}` : "근거 번호 확인";
}

function formatScrapAnalysisText(report = {}, meta = {}) {
  const lines = [
    report.title || meta.title || "스크랩 기사 분석 보고서",
    report.riskLevel ? `리스크 레벨: ${report.riskLevel}` : "",
    "",
    "핵심 요약",
    report.executiveSummary || meta.analysis || "",
    "",
    ...formatReportItemsForText("핵심 판단", report.keyFindings),
    "",
    ...formatReportItemsForText("리스크", report.risks),
    "",
    ...formatReportItemsForText("활용 포인트", report.opportunities),
    "",
    "후속 확인",
    ...(Array.isArray(report.followUps) ? report.followUps.map((item) => `- ${item}`) : []),
    "",
    "근거 기사",
    ...(Array.isArray(report.evidenceArticles) ? report.evidenceArticles.map((article) => (
      `- [${article.no || "-"}] ${article.press || "출처 확인"}: ${article.title || "제목 확인"}${article.summary ? ` / ${article.summary}` : ""}`
    )) : []),
  ];
  return lines.filter((line, index, array) => line || array[index - 1]).join("\n").trim();
}

function formatReportItemsForText(title, items = []) {
  const rows = Array.isArray(items) ? items : [];
  return [
    title,
    ...rows.map((item) => `- ${item.title || "확인"}: ${item.body || ""}${Array.isArray(item.evidence) && item.evidence.length ? ` (${evidenceLabel(item.evidence)})` : ""}`),
  ];
}

function openScrapAnalysisReport(row) {
  if (!row) return;
  openHtmlDocument(buildScrapAnalysisReportDocument(row));
}

function openHtmlDocument(html) {
  if (typeof window === "undefined") return;
  const target = window.open("", "_blank", "noopener,noreferrer");
  if (!target) return;
  target.document.open();
  target.document.write(html);
  target.document.close();
}

function buildScrapAnalysisReportDocument(row = {}) {
  const report = row.report || {};
  const evidence = Array.isArray(report.evidenceArticles) ? report.evidenceArticles.slice(0, 6) : [];
  const findings = Array.isArray(report.keyFindings) ? report.keyFindings.slice(0, 4) : [];
  const risks = Array.isArray(report.risks) ? report.risks.slice(0, 3) : [];
  const opportunities = Array.isArray(report.opportunities) ? report.opportunities.slice(0, 3) : [];
  const followUps = Array.isArray(report.followUps) ? report.followUps.slice(0, 5) : [];
  return `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.title || row.title || "스크랩 기사 분석 보고서")}</title>
    <style>
      @page { size: A4 portrait; margin: 11mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3f6fb; color: #0b163f; font-family: "Malgun Gothic", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; background: rgba(243, 246, 251, .92); border-bottom: 1px solid #dbe3ee; }
      .toolbar button { height: 36px; padding: 0 14px; border: 1px solid #c9d5e6; border-radius: 8px; background: #fff; color: #0b163f; font-weight: 900; cursor: pointer; }
      .sheet { width: min(850px, calc(100vw - 28px)); margin: 18px auto; padding: 24px 26px; background: #fff; border: 1px solid #d8e0ec; box-shadow: 0 18px 42px rgba(15, 23, 42, .12); }
      header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; padding-bottom: 18px; border-bottom: 4px double #18214a; }
      .eyebrow { color: #2855d9; font-size: 11px; font-weight: 950; letter-spacing: .04em; text-transform: uppercase; }
      h1 { margin: 8px 0 8px; font-family: Georgia, "Times New Roman", "Malgun Gothic", serif; font-size: 32px; line-height: 1.14; letter-spacing: 0; }
      .subtitle { margin: 0; color: #526179; font-size: 13px; font-weight: 850; line-height: 1.45; }
      .risk { display: grid; gap: 4px; min-width: 116px; padding: 12px 14px; border: 1px solid #cfdaf0; border-radius: 8px; text-align: center; }
      .risk span { color: #64748b; font-size: 10px; font-weight: 900; }
      .risk b { color: #0f7a45; font-size: 24px; line-height: 1; }
      .summary { margin: 16px 0; padding: 13px 15px; border-left: 4px solid #2855d9; background: #f8fbff; font-size: 15px; line-height: 1.65; font-weight: 850; }
      .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .95fr); gap: 12px; }
      section { min-width: 0; padding: 13px; border: 1px solid #dbe3ee; border-radius: 8px; background: #fff; }
      h2 { display: flex; justify-content: space-between; margin: 0 0 10px; font-size: 15px; }
      article { padding: 9px 0; border-top: 1px solid #eef2f7; }
      article:first-of-type { border-top: 0; padding-top: 0; }
      article b { display: block; color: #101a44; font-size: 13px; line-height: 1.35; }
      article p { margin: 5px 0 0; color: #2e3b55; font-size: 12px; line-height: 1.55; font-weight: 800; }
      article em { display: inline-block; margin-top: 6px; color: #2855d9; font-size: 10px; font-style: normal; font-weight: 950; }
      .evidence { grid-column: 1 / -1; }
      .evidence-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) 52px; gap: 10px; align-items: start; padding: 8px 0; border-top: 1px solid #eef2f7; }
      .evidence-row:first-of-type { border-top: 0; }
      .no { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: #edf3ff; color: #2855d9; font-size: 11px; font-weight: 950; }
      .source { color: #64748b; font-size: 10px; font-weight: 900; }
      .evidence-row h3 { margin: 3px 0 4px; font-size: 12.5px; line-height: 1.35; }
      .evidence-row p { margin: 0; color: #334155; font-size: 11px; line-height: 1.45; font-weight: 800; }
      .tone { justify-self: end; padding: 4px 7px; border: 1px solid #dbe3ee; border-radius: 999px; color: #0b163f; font-size: 10px; font-weight: 950; }
      ul { margin: 0; padding-left: 17px; }
      li { margin: 6px 0; color: #25324a; font-size: 12px; line-height: 1.5; font-weight: 850; }
      @media print {
        body { background: #fff; }
        .toolbar { display: none; }
        .sheet { width: 100%; margin: 0; padding: 0; border: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
    <main class="sheet">
      <header>
        <div>
          <div class="eyebrow">Executive Clipping Brief</div>
          <h1>${escapeHtml(report.title || row.title || "스크랩 기사 분석 보고서")}</h1>
          <p class="subtitle">${escapeHtml(report.subtitle || row.prompt || "")}</p>
        </div>
        <div class="risk"><span>리스크 레벨</span><b>${escapeHtml(report.riskLevel || "LOW")}</b><span>${escapeHtml([row.date, row.time].filter(Boolean).join(" "))}</span></div>
      </header>
      <div class="summary">${escapeHtml(report.executiveSummary || row.analysis || "")}</div>
      <div class="grid">
        <section><h2>핵심 판단</h2>${htmlReportItems(findings)}</section>
        <section><h2>리스크</h2>${htmlReportItems(risks)}</section>
        <section><h2>활용 포인트</h2>${htmlReportItems(opportunities)}</section>
        <section><h2>후속 확인</h2>${followUps.length ? `<ul>${followUps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>후속 확인 항목이 없습니다.</p>"}</section>
        <section class="evidence"><h2>근거 기사</h2>${evidence.length ? evidence.map(htmlEvidenceRow).join("") : "<p>근거 기사가 없습니다.</p>"}</section>
      </div>
    </main>
  </body>
  </html>`;
}

function htmlReportItems(items = []) {
  if (!items.length) return "<p>해당 항목이 없습니다.</p>";
  return items.map((item) => `
    <article>
      <b>${escapeHtml(item.title || "확인")}</b>
      <p>${escapeHtml(item.body || "")}</p>
      <em>${escapeHtml(evidenceLabel(item.evidence))}</em>
    </article>
  `).join("");
}

function htmlEvidenceRow(article = {}) {
  return `
    <div class="evidence-row">
      <span class="no">${escapeHtml(article.no || "-")}</span>
      <div>
        <span class="source">${escapeHtml(article.press || "출처 확인")}</span>
        <h3>${escapeHtml(article.title || "제목 확인")}</h3>
        <p>${escapeHtml(article.summary || "요약 확인")}</p>
      </div>
      <span class="tone">${escapeHtml(article.tone || "논조")}</span>
    </div>
  `;
}

function selectClippingRecommendations(articles = [], scraps = []) {
  const scrappedKeys = new Set(scraps.map((article) => articleSelectionKey(article)));
  return [...(articles || [])]
    .filter((article) => article?.clippingRecommended)
    .filter((article) => !scrappedKeys.has(articleSelectionKey(article)))
    .sort((a, b) => clippingScore(b) - clippingScore(a) || articleTimeValue(b) - articleTimeValue(a));
}

function clippingScore(article = {}) {
  const toneScore = { 부정: 80, 주의: 60, 긍정: 45, 중립: 25 }[article.tone] || 10;
  const categoryScore = article.category === "당사" ? 80 : article.category === "정책/규제" ? 45 : 25;
  const confidence = Math.round(Number(article.aiContext?.confidence || 0) * 20);
  return toneScore + categoryScore + confidence + Number(article.score || 0) / 10;
}

function selectRiskCenterArticles(articles = []) {
  const usable = articles
    .filter((article) => article?.title && article.link && article.link !== "#")
    .filter((article) => !isOfficialRegulatorSource(article.source));
  const ownRiskArticles = usable.filter((article) => isOwnArticle(article));
  const negative = ownRiskArticles.filter((article) => isDirectOwnNegativeArticle(article));
  const caution = ownRiskArticles.filter((article) => article.tone === "주의" || String(article.riskLevel || "").toUpperCase() === "MEDIUM");
  const selected = [...negative, ...caution];
  return buildRiskArticleGroups(dedupeRiskArticles(selected))
    .map((article) => {
      const relatedArticles = Array.isArray(article.relatedArticles) && article.relatedArticles.length
        ? article.relatedArticles
        : [article];
      const relatedSources = unique(relatedArticles.map((item) => item.source).filter(Boolean));
      return {
        ...article,
        relatedArticles,
        relatedCount: relatedArticles.length,
        relatedSourceCount: relatedSources.length,
        summaryLines: buildRiskGroupSummaryLines(relatedArticles),
      };
    })
    .sort((a, b) => articleTimeValue(b) - articleTimeValue(a) || compareArticleImportance(a, b))
    .slice(0, 20);
}

function isDirectOwnNegativeArticle(article = {}) {
  const target = String(article.aiContext?.negativeTarget || "").trim();
  if (target && target !== "own") return false;
  return article.tone === "부정" || String(article.riskLevel || "").toUpperCase() === "HIGH";
}

function dedupeRiskArticles(rows = []) {
  const map = new Map();
  rows.forEach((article) => {
    const key = riskArticleDedupeKey(article);
    const previous = map.get(key);
    if (!previous || articleTimeValue(article) > articleTimeValue(previous) || compareArticleImportance(article, previous) < 0) {
      map.set(key, article);
    }
  });
  return Array.from(map.values());
}

function riskArticleDedupeKey(article = {}) {
  const url = normalizeRiskUrl(article.link);
  if (url) return `url:${url}`;
  const title = normalizeGroupTitle(article.title || "");
  return `title:${article.date || ""}:${title.slice(0, 80)}`;
}

function buildRiskArticleGroups(articles = []) {
  const groups = [];
  articles.forEach((article, index) => {
    const seed = articleGroupSeed(article);
    const signature = riskIssueSignature(article);
    const target = groups.find((group) => (
      (signature && group.signature === signature)
      || areRelatedArticleSeeds(seed, group.seed)
      || areRiskRelatedArticleSeeds(seed, group.seed)
    ));
    if (target) {
      target.members.push(article);
      target.seed = mergeGroupSeed(target.seed, seed);
      target.signature = target.signature || signature;
    } else {
      groups.push({ seed, signature, members: [article], index });
    }
  });

  return groups
    .map((group) => {
      const sortedMembers = [...group.members].sort(compareArticleImportance);
      const representative = sortedMembers[0] || {};
      const members = dedupeIssueMembers(
        sortedMembers.filter((member) => articleBelongsToSameIssue(representative, member)),
      );
      if (!members.length && representative.title) members.push(representative);
      const sources = unique(members.map((item) => item.source).filter(Boolean));
      return {
        ...representative,
        relatedArticles: members,
        relatedCount: members.length,
        relatedSourceCount: sources.length,
        relatedSources: sources,
        clusterSize: Math.max(Number(representative.clusterSize || 1), members.length),
      };
    })
    .sort((a, b) => {
      if ((b.relatedCount || 1) !== (a.relatedCount || 1)) return (b.relatedCount || 1) - (a.relatedCount || 1);
      return compareArticleImportance(a, b);
    });
}

function riskIssueSignature(article = {}) {
  const text = normalizeKeywordText(`${article.title || ""} ${article.summary || ""} ${article.description || ""} ${article.keyword || ""}`);
  if (/전세사기/.test(text) && /청년/.test(text) && /지원|상환|학자금/.test(text)) return "risk:jeonse-youth-support";
  if (/보험설계사/.test(text) && /개인정보|처리자|판매 주체|판매주체/.test(text)) return "risk:planner-privacy-controller";
  if (/인카금융스캔들|보험 꺾기|보험꺾기|불법 사채|불법사채/.test(text)) return "risk:incar-scandal-illegal-sales";
  if (/인카금융/.test(text) && /관리 부실|관리부실|대리점|가로챈/.test(text)) return "risk:incar-agency-control";
  if (/사칭|고객 db|고객db|db 수집|디비 수집/.test(text) && /금융|저축은행|보험/.test(text)) return "risk:impersonation-customer-db";
  if (/개인정보|고객정보|정보유출|해킹/.test(text) && /보험|ga|설계사|대리점/.test(text)) return "risk:insurance-privacy-security";
  return "";
}

function areRiskRelatedArticleSeeds(a, b) {
  const overlap = tokenOverlapRatio(a.tokenSet, b.tokenSet);
  if (overlap >= 0.56) return true;
  const importantA = new Set((a.tokens || []).filter(isRiskGroupingToken));
  const importantB = new Set((b.tokens || []).filter(isRiskGroupingToken));
  const importantOverlap = tokenOverlapRatio(importantA, importantB);
  return importantOverlap >= 0.5 && sharedLongToken(a.tokens, b.tokens);
}

function isRiskGroupingToken(token = "") {
  return /전세사기|피해|청년|지원|학자금|상환|개인정보|처리자|보험설계사|판매주체|인카금융|스캔들|보험꺾기|사채|사칭|고객db|대리점|관리부실|해킹|정보유출/.test(token);
}

function buildRiskGroupSummaryLines(articles = []) {
  const ranked = [...articles].sort((a, b) => compareArticleImportance(a, b));
  const lines = [];
  const titleKeys = new Set(ranked.map((article) => normalizeRiskSummaryKey(article.title)).filter(Boolean));
  ranked.forEach((article) => {
    buildArticleSummaryLines(article).forEach((line) => lines.push(line));
  });
  const seen = new Set();
  const cleaned = lines.filter((line) => {
    const key = normalizeRiskSummaryKey(line);
    if (!key || titleKeys.has(key)) return false;
    if (isDuplicateRiskSummaryKey(key, seen)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  return cleaned.length ? cleaned : buildRiskFallbackSummaryLines(ranked);
}

function buildRiskFallbackSummaryLines(articles = []) {
  const representative = articles[0] || {};
  const text = summaryHaystack(representative);
  const count = articles.length;
  const lines = [];
  if (/전세사기/.test(text) && /청년/.test(text)) {
    lines.push("전세사기 피해 청년 지원과 관련된 보험업계 사회공헌 보도입니다.");
    lines.push("직접 부정 이슈보다는 피해·지원 키워드로 포착된 기사라 리스크 분류 재확인이 필요합니다.");
  } else if (/보험설계사/.test(text) && /개인정보|처리자|판매 주체|판매주체/.test(text)) {
    lines.push("보험설계사의 개인정보 처리 책임과 판매 주체별 법적 지위가 핵심 쟁점입니다.");
    lines.push("GA와 판매채널 운영 기준에 영향을 줄 수 있어 내부 기준 확인이 필요합니다.");
  } else if (/인카금융스캔들|보험 꺾기|보험꺾기|불법 사채|불법사채/.test(text)) {
    lines.push("GA 영업 관행과 불법 사채 의혹을 다룬 고위험 평판 이슈입니다.");
    lines.push("당사명 노출 여부와 사실관계, 추가 보도 확산 가능성을 우선 확인해야 합니다.");
  } else if (/사칭|고객 DB|고객DB|DB 수집|디비 수집/i.test(text)) {
    lines.push("금융사 사칭과 고객 DB 수집 의혹이 핵심인 소비자보호 리스크 기사입니다.");
    lines.push("당사 관련성, 피해 범위, 후속 보도 가능성을 분리해 확인해야 합니다.");
  } else if (/관리 부실|관리부실|대리점|가로챈/.test(text) && /인카금융/.test(text)) {
    lines.push("보험대리점 관리와 당사 언급이 함께 나온 평판 리스크 기사입니다.");
    lines.push("관리 책임, 피해 주장, 보도 근거를 나눠 사실관계를 확인해야 합니다.");
  } else {
    const topic = summarizeRiskTitleTopic(representative.title);
    lines.push(`${topic} 관련 리스크 기사로, 사실관계와 당사 관련성을 확인해야 합니다.`);
  }
  if (count > 1) lines.push(`같은 이슈로 묶인 관련 기사 ${count.toLocaleString("ko-KR")}건을 함께 확인합니다.`);
  return dedupeSummaryLines(lines, summaryTitleKeys({ ...representative, relatedArticles: articles })).slice(0, 3);
}

function summarizeRiskTitleTopic(title = "") {
  const clean = cleanSummaryText(title)
    .replace(/\s*[-–—]\s*[^-–—]{2,30}$/u, "")
    .replace(/^[\[【][^\]】]+[\]】]\s*/u, "");
  const tokens = articleTokens(clean).filter((token) => !/신문|뉴스|경제|일보|투데이|연합뉴스/.test(token));
  return tokens.slice(0, 5).join(" ") || "선택 기사";
}

function normalizeRiskSummaryKey(value = "") {
  return normalizeSummaryCompareKey(value);
}

function isDuplicateRiskSummaryKey(key, seen) {
  for (const previous of seen) {
    if (key === previous) return true;
    if (key.length >= 28 && previous.length >= 28 && (key.includes(previous) || previous.includes(key))) return true;
    const minLength = Math.min(key.length, previous.length);
    if (minLength >= 18 && commonPrefixLength(key, previous) >= Math.min(42, Math.floor(minLength * 0.82))) return true;
    const overlap = tokenOverlapRatio(new Set(articleTokens(key)), new Set(articleTokens(previous)));
    if (overlap >= 0.78) return true;
  }
  return false;
}

function findArticleByUrl(articles = [], value = "") {
  const target = normalizeRiskUrl(value);
  if (!target) return null;
  return articles.find((article) => normalizeRiskUrl(article.link) === target) || null;
}

function extractFirstUrl(value = "") {
  const match = String(value || "").match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[)\].,;]+$/g, "") : "";
}

function normalizeRiskUrl(value = "") {
  const raw = extractFirstUrl(value) || String(value || "").trim();
  if (!raw || raw === "#") return "";
  try {
    const url = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`.replace(/\/$/g, "").toLowerCase();
  } catch {
    return raw.replace(/\/$/g, "").toLowerCase();
  }
}

function makeManualRiskArticle(articleUrl = "") {
  const host = (() => {
    try {
      return new URL(articleUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return {
    title: articleUrl ? "URL 입력 기사" : "기사 선택 필요",
    link: articleUrl,
    source: host || "직접 입력",
    tone: articleUrl ? "주의" : "확인 필요",
    category: "외부 URL",
    summary: "",
  };
}

function buildRiskCenterFacts(article = {}, articleUrl = "") {
  const summaryLines = buildRiskDraftSummaryLines(article);
  const claim = summaryLines[0]
    || compactArticleSummary(article)
    || cleanSummaryText(article.title)
    || (articleUrl ? "URL 기준으로 기사 원문 확인이 필요합니다." : "최근 부정/주의 기사를 선택하세요.");
  const tone = article.tone && article.tone !== "확인 필요"
    ? article.tone
    : String(article.riskLevel || "").toUpperCase() === "HIGH"
      ? "부정"
      : articleUrl
        ? "주의"
        : "확인 필요";
  return {
    claim,
    relevance: buildRiskRelevance(article),
    tone,
    intensity: buildRiskIntensity(article, tone),
    issueType: buildRiskIssueType(article),
    summaryLines,
  };
}

function riskDraftMatchesArticle(draft = {}, article = {}) {
  const draftHash = String(draft.articleHash || draft.article_hash || "").trim();
  const articleHashes = [
    article.articleHash,
    article.article_hash,
    article.id,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (draftHash && articleHashes.includes(draftHash)) return true;

  const draftLink = normalizeRiskUrl(draft.link || "");
  const articleLink = normalizeRiskUrl(article.link || "");
  if (draftLink && articleLink && draftLink === articleLink) return true;

  const draftTitle = normalizeSummaryCompareKey(draft.title || "");
  const articleTitle = normalizeSummaryCompareKey(article.title || "");
  return Boolean(draftTitle && articleTitle && draftTitle === articleTitle && String(draft.source || "") === String(article.source || ""));
}

function riskDraftTypeLabel(value = "") {
  return value === "internal" ? "사내" : "언론";
}

function riskDraftArticlePayload(article = {}) {
  return {
    articleHash: article.articleHash || article.article_hash || article.id || "",
    title: article.title || "",
    link: article.link || "",
    source: article.source || "",
    tone: article.tone || "",
    riskLevel: article.riskLevel || article.risk_level || "",
    category: article.category || "",
    keyword: article.keyword || "",
    summary: compactArticleSummary(article) || buildRiskDraftSummaryLines(article).join(" "),
  };
}

function buildRiskResponseIssue(article = {}, facts = {}) {
  const lines = [
    `제목: ${cleanSummaryText(article.title || "확인 대상 기사")}`,
    `출처: ${cleanSummaryText(article.source || "출처 확인")}`,
    `분류: ${facts.tone || article.tone || "확인"} · ${facts.relevance || "관련성 확인"} · ${facts.issueType || buildRiskIssueType(article)}`,
    `핵심 주장: ${facts.claim || compactArticleSummary(article) || "원문 확인 필요"}`,
  ];
  const summaryLines = Array.isArray(facts.summaryLines) && facts.summaryLines.length
    ? facts.summaryLines
    : buildRiskDraftSummaryLines(article);
  summaryLines.slice(0, 4).forEach((line, index) => {
    lines.push(`요약 ${index + 1}: ${line}`);
  });
  if (article.link && article.link !== "#") lines.push(`링크: ${article.link}`);
  return lines.filter(Boolean).join("\n");
}

function buildRiskRelevance(article = {}) {
  if (!article?.title || article.title === "기사 선택 필요") return "확인 필요";
  if (isOwnArticle(article)) return "당사 직접 언급";
  if (article.category === "GA" || /GA|보험대리점|설계사|인카금융/i.test(`${article.title} ${article.summary} ${article.keyword}`)) {
    return "업계/GA 문맥";
  }
  return "간접 이슈";
}

function buildRiskIntensity(article = {}, tone = "") {
  if (tone === "부정" && isOwnArticle(article)) return "즉시 확인";
  if (tone === "부정") return "부정 후보 검토";
  if (tone === "주의") return "모니터링";
  return "대기";
}

function buildRiskResponseDraft(type, article = {}, facts = {}) {
  const title = cleanSummaryText(article.title || "확인 대상 기사");
  const source = cleanSummaryText(article.source || "언론");
  const tone = facts.tone || "확인 필요";
  const relevance = facts.relevance || "관련성 확인 필요";
  const issueType = facts.issueType || buildRiskIssueType(article);
  const issueDefinition = buildRiskIssueDefinition(article, facts);
  const related = Array.isArray(article.relatedArticles) ? article.relatedArticles : [];
  const relatedCount = Math.max(Number(article.relatedCount || 1), related.length || 1);
  const sourceCount = Math.max(Number(article.relatedSourceCount || 1), unique(related.map((item) => item.source).filter(Boolean)).length || 1);
  const summaryLines = buildRiskDraftSummaryLines(article).slice(0, 3);
  const evidenceLines = buildRiskDraftEvidenceLines(article, summaryLines);
  const checkItems = buildRiskCheckItems(article, facts);
  const actionItems = buildRiskActionItems(article, facts);
  const stanceLines = buildRiskStanceLines(article, facts, type);
  const meta = [
    source,
    article.date || "",
    article.time || "",
    relatedCount > 1 ? `관련 ${relatedCount}건` : "",
    sourceCount > 1 ? `매체 ${sourceCount}곳` : "",
  ].filter(Boolean).join(" · ");

  if (type === "internal") {
    return formatRiskDraft([
      ["상황 정의", [
        issueDefinition,
        `기사: ${title}`,
        meta ? `출처: ${meta}` : "",
        `분류: ${tone} · ${relevance} · ${issueType}`,
      ]],
      ["핵심 쟁점", evidenceLines],
      ["리스크 판단", buildRiskJudgementLines(article, facts, relatedCount, sourceCount)],
      ["확인 범위", checkItems],
      ["대응 액션", actionItems],
      ["내부 공유 문안", stanceLines],
    ]);
  }
  return formatRiskDraft([
    ["상황 정의", buildPressPositionLead(article, facts)],
    ["확인 범위", checkItems.slice(0, 4)],
    ["대응 원칙", stanceLines],
    ["언론 응대 문안", buildPressReplyLines(article, facts)],
  ]);
}

function buildRiskDraftSummaryLines(article = {}) {
  const related = Array.isArray(article.relatedArticles) && article.relatedArticles.length
    ? article.relatedArticles
    : [article];
  const lines = [
    ...(Array.isArray(article.summaryLines) ? article.summaryLines : []),
    ...related.flatMap((item) => buildArticleSummaryLines(item)),
    compactArticleSummary(article),
  ];
  const seen = new Set();
  return lines
    .map((line) => normalizeRiskDraftLine(line, article.title))
    .filter((line) => {
      const key = normalizeSummaryCompareKey(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function normalizeRiskDraftLine(line, title = "") {
  const clean = cleanSummaryText(line);
  if (!clean) return "";
  const titleKey = normalizeSummaryCompareKey(title);
  const lineKey = normalizeSummaryCompareKey(clean);
  if (lineKey && titleKey && (lineKey === titleKey || titleKey.includes(lineKey))) return "";
  if (/기준으로 분류된 기사입니다|관련 기사로.*확인해야 합니다/.test(clean)) return "";
  return clean.endsWith(".") ? clean : `${clean}.`;
}

function buildRiskDraftEvidenceLines(article = {}, summaryLines = []) {
  const lines = summaryLines.length ? summaryLines : [factsFallbackClaim(article)];
  const relatedCount = Number(article.relatedCount || 1);
  if (relatedCount > 1) {
    lines.push(`동일 쟁점으로 묶인 기사 ${relatedCount.toLocaleString("ko-KR")}건이 있어 확산 여부를 함께 봅니다.`);
  }
  return lines.slice(0, 4);
}

function factsFallbackClaim(article = {}) {
  const topic = summarizeRiskTitleTopic(article.title || "");
  return `${topic} 관련 보도로, 기사 원문 기준의 사실관계 확인이 필요합니다.`;
}

function buildRiskIssueType(article = {}) {
  const text = summaryHaystack(article);
  if (/보험\s*꺾기|불법\s*사채|사채놀이|금융사\s*사칭|고객\s*db|db\s*수집|디비\s*수집/i.test(text)) return "영업관리/소비자보호 고위험";
  if (/사칭|고객\s*db|db\s*수집|디비\s*수집|개인정보|정보유출|해킹/i.test(text)) return "소비자보호/정보보안";
  if (/보험\s*꺾기|불법\s*사채|수수료|정착지원금|리베이트|불완전판매|민원/i.test(text)) return "영업관리/판매채널";
  if (/투자의견|목표가|목표주가|주가|실적|손해율|자본|건전성/i.test(text)) return "시장평가/재무";
  if (/금감원|금융위|감독|제재|검사|제도|시행령|규제/i.test(text)) return "정책/규제";
  if (/사회공헌|후원|수상|우수인증|인증설계사/i.test(text)) return "평판/성과";
  return isOwnArticle(article) ? "당사 평판" : "업계 이슈";
}

function buildRiskIssueDefinition(article = {}, facts = {}) {
  const text = summaryHaystack(article);
  const issueType = facts.issueType || buildRiskIssueType(article);
  if (/보험\s*꺾기|불법\s*사채|사채놀이/i.test(text)) {
    return "보도 쟁점은 보험 꺾기·불법 사채 의혹처럼 영업관리와 소비자보호가 함께 걸린 고위험 사안입니다.";
  }
  if (/금융사\s*사칭|사칭|고객\s*db|db\s*수집|디비\s*수집|개인정보|정보유출|해킹/i.test(text)) {
    return "보도 쟁점은 금융사 사칭, 고객 정보, 개인정보 관리와 연결될 수 있는 소비자보호 사안입니다.";
  }
  if (/투자의견|목표가|목표주가|주가|실적|손해율|자본|건전성/i.test(text)) {
    return "보도 쟁점은 직접 부정 이슈보다 시장 평가와 재무 인식 변화에 가까운 주의 사안입니다.";
  }
  if (/금감원|금융위|감독|제재|검사|제도|시행령|규제/i.test(text)) {
    return "보도 쟁점은 정책·감독 변화가 영업 환경에 미칠 영향을 확인해야 하는 규제성 사안입니다.";
  }
  if (isOwnArticle(article)) {
    return `보도 쟁점은 당사 직접 언급이 포함된 ${issueType} 사안입니다.`;
  }
  return `보도 쟁점은 ${issueType} 관점에서 당사 관련성과 대응 필요성을 구분해야 하는 사안입니다.`;
}

function buildRiskJudgementLines(article = {}, facts = {}, relatedCount = 1, sourceCount = 1) {
  const lines = [];
  const own = isOwnArticle(article);
  const tone = facts.tone || article.tone || "확인 필요";
  const issueType = facts.issueType || buildRiskIssueType(article);
  if (tone === "부정" && own) {
    lines.push("당사명이 직접 포함된 부정성 보도라 단순 모니터링이 아니라 사실 주장별 근거 대조가 필요합니다.");
  } else if (tone === "부정") {
    lines.push("업계 부정 이슈지만 당사 직접 책임으로 보도된 것인지 별도 확인이 필요합니다.");
  } else if (tone === "주의") {
    lines.push("직접 부정보다는 시장성, 규제성, 영업환경 변화 신호로 관리하는 편이 적절합니다.");
  } else {
    lines.push("현 단계에서는 즉시 해명보다 모니터링과 근거 확보가 우선입니다.");
  }
  if (/고위험/.test(issueType)) {
    lines.push("소비자 피해, 영업관리, 개인정보 쟁점이 함께 보일 수 있어 원문 보존과 내부 확인 기록을 동시에 남깁니다.");
  }
  if (relatedCount > 1 || sourceCount > 1) {
    lines.push(`관련 보도가 ${relatedCount.toLocaleString("ko-KR")}건, 매체 ${sourceCount.toLocaleString("ko-KR")}곳으로 묶여 노출 강도 변화를 확인해야 합니다.`);
  }
  if (facts.issueType) lines.push(`주요 리스크 유형은 ${facts.issueType}입니다.`);
  return lines;
}

function buildRiskCheckItems(article = {}, facts = {}) {
  const text = summaryHaystack(article);
  const items = [
    "기사 제목과 본문에서 당사명, 계열/지점/설계사 등 직접 연결 표현이 있는지 확인",
    "보도 근거가 공시, 당국 자료, 제보, 업계 관계자 발언 중 무엇인지 분리",
  ];
  if (/보험\s*꺾기|불법\s*사채|사채놀이/i.test(text)) {
    items.push("보험 꺾기, 불법 사채, 대출·계약 유도 표현이 기사에서 사실 주장인지 인용인지 구분");
  }
  if (/피해|민원|소비자|고객|사칭|개인정보|해킹/i.test(text)) {
    items.push("소비자 피해 주장, 접수 민원, 고객 정보 관련 사실관계와 현재 조치 여부 확인");
  }
  if (/수수료|정착지원금|설계사|대리점|GA|보험대리점/i.test(text)) {
    items.push("GA/설계사/수수료 문맥이 당사 영업관리 기준과 직접 연결되는지 확인");
  }
  if (/투자의견|목표가|주가|실적|손해율|건전성|자본/i.test(text)) {
    items.push("시장평가성 표현인지, 실제 부정 사실 주장인지 구분");
  }
  if (/금감원|금융위|제재|검사|감독|규제/i.test(text)) {
    items.push("당국 발표 원문과 기사 해석 사이에 차이가 있는지 확인");
  }
  if (facts.relevance === "간접 이슈") {
    items.push("당사 직접 대응이 필요한 사안인지, 업계 모니터링으로 충분한 사안인지 판단");
  }
  return unique(items).slice(0, 5);
}

function buildRiskActionItems(article = {}, facts = {}) {
  const own = isOwnArticle(article);
  const tone = facts.tone || article.tone || "";
  const issueType = facts.issueType || buildRiskIssueType(article);
  const items = [];
  if (/고위험/.test(issueType)) {
    items.push("원문, URL, 캡처, 보도 시각을 보존하고 기사 주장별 사실 확인표를 작성");
    items.push("영업관리, 준법, 소비자보호, 개인정보 담당 확인을 같은 기준으로 취합");
    items.push("정정·반론·추가 설명 필요성을 사실 확인 결과와 보도 확산 정도로 판단");
  } else if (tone === "부정" && own) {
    items.push("원문 캡처와 URL을 보존하고, 기사 내 사실 주장별 담당 부서 확인 요청");
    items.push("정정 요청 가능성, 추가 설명자료 필요 여부, 기자 문의 대응 문구를 동시에 준비");
  } else if (tone === "부정") {
    items.push("당사 직접 언급 여부를 먼저 확정하고, 업계 부정 이슈로만 관리할지 판단");
  } else {
    items.push("추가 보도 확산 여부를 모니터링하고, 당사 관련 질문이 들어올 경우 사용할 핵심 문장만 준비");
  }
  items.push("대외 문구는 책임 인정이나 전면 부인으로 읽히지 않게 확인 범위와 조치 원칙 중심으로 통일");
  return items.slice(0, 4);
}

function buildRiskStanceLines(article = {}, facts = {}, type = "press") {
  const issueType = facts.issueType || buildRiskIssueType(article);
  const own = isOwnArticle(article);
  const lines = [];
  if (type === "press") {
    lines.push("기사 주장과 당사가 확인한 사실을 분리해 답변합니다.");
    if (own) {
      lines.push("당사 관련 부분은 원문 근거, 내부 기록, 고객 영향 여부를 기준으로 확인합니다.");
    } else {
      lines.push("당사 직접 사안으로 확인되지 않은 부분은 업계 동향과 별도 문의 대응으로 구분합니다.");
    }
    lines.push(`${issueType} 문의는 확인 범위, 확인 절차, 필요한 조치 원칙만 간결하게 설명합니다.`);
  } else {
    lines.push("내부 공유 시 기사 주장, 확인된 사실, 미확인 사항, 담당 부서를 분리해 전달합니다.");
    lines.push("대외 답변은 사실 확인 전 해명성 표현을 줄이고, 고객/이해관계자 영향 확인 기준으로 정리합니다.");
    lines.push("확인 결과에 따라 정정 요청, 반론 보도, 추가 설명자료 중 필요한 조치를 선택합니다.");
  }
  return lines;
}

function buildPressPositionLead(article = {}, facts = {}) {
  const claim = facts.claim || factsFallbackClaim(article);
  const issueDefinition = buildRiskIssueDefinition(article, facts);
  const source = cleanSummaryText(article.source || "");
  const sourceLine = source ? `${source} 보도 기준으로 원문과 사실관계를 대조합니다.` : "기사 원문 기준으로 사실관계를 대조합니다.";
  return [
    issueDefinition,
    claim,
    sourceLine,
  ];
}

function buildPressReplyLines(article = {}, facts = {}) {
  const issueType = facts.issueType || buildRiskIssueType(article);
  const own = isOwnArticle(article);
  return [
    `“해당 보도는 ${issueType} 관점에서 사실관계를 확인하고 있습니다.”`,
    own
      ? "“당사와 직접 연결된 내용은 원문 근거와 내부 확인 결과를 기준으로 설명드리겠습니다.”"
      : "“당사 직접 사안으로 확인되지 않은 부분은 업계 동향과 구분해 보겠습니다.”",
    "“고객 또는 이해관계자 영향이 확인되는 사안은 내부 기준에 따라 필요한 조치를 검토하겠습니다.”",
  ];
}

function formatRiskDraft(sections = []) {
  return sections
    .map(([title, lines]) => {
      const cleanLines = unique((Array.isArray(lines) ? lines : [lines])
        .map((line) => cleanSummaryText(line))
        .filter(Boolean));
      if (!cleanLines.length) return "";
      return [`[${title}]`, ...cleanLines.map((line) => `- ${line}`)].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function AdSpendChart({ rows, color = "#2855d9", compact = false }) {
  if (!rows.length) {
    return <div className="chart-empty">광고비 집행 데이터가 없습니다.</div>;
  }
  return (
    <div className={`ad-chart-box ${compact ? "compact" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 18, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis dataKey="name" type="category" width={compact ? 76 : 92} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 800 }} />
          <Tooltip formatter={(value) => formatMoney(value)} />
          <Bar dataKey="value" radius={[0, 7, 7, 0]}>
            {rows.map((row, index) => <Cell key={row.name} fill={index === 0 ? color : chartColors[index % chartColors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatFeedbackStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(/\s/g, "");
}

function PageTitle({ right }) {
  if (!right) return null;
  return (
    <div className="page-title-actions-only">
      {right}
    </div>
  );
}

function Panel({ title, icon: Icon = FileText, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2><Icon />{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function MonthlyIssueDigest({ issues, period = "monthly" }) {
  const [lead, ...rest] = issues;
  const meta = mediaDigestMeta(period);
  if (!lead) {
    return <div className="monthly-issue-empty">{meta.empty}</div>;
  }
  return (
    <div className="monthly-issue-digest">
      <article className="monthly-issue-lead">
        <div className="issue-meta">
          <Chip tone={lead.tone}>{lead.tone}</Chip>
          <Chip>{lead.category}</Chip>
          <span>{formatIssueMeta(lead)}</span>
        </div>
        <span className="monthly-issue-kicker">{meta.kicker}</span>
        <h3>{lead.title}</h3>
        {lead.link && lead.link !== "#" && (
          <a className="article-link-button" href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
            <ExternalLink />기사 열기
          </a>
        )}
        <RelatedIssueDetails issue={lead} />
      </article>
      <div className="monthly-issue-list">
        {rest.slice(0, 3).map((issue) => (
          <article key={`${issue.source}-${issue.title}`}>
            <div>
              <span>{formatIssueMeta(issue)}</span>
              <h4>{issue.title}</h4>
              <RelatedIssueDetails issue={issue} compact />
            </div>
            <Chip tone={issue.tone}>{issue.tone}</Chip>
            {issue.link && issue.link !== "#" && (
              <a href={issue.link} target="_blank" rel="noopener noreferrer" aria-label="기사 열기" onClick={(event) => openArticleLink(event, issue.link)}>
                <ExternalLink />
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function mediaDigestMeta(period) {
  return {
    daily: {
      kicker: "Daily Lead",
      empty: "당일 기준으로 표시할 핵심 이슈가 없습니다.",
    },
    weekly: {
      kicker: "Weekly Flow",
      empty: "주간 기준으로 표시할 반복 이슈가 없습니다.",
    },
    monthly: {
      kicker: "Monthly Desk",
      empty: "월간 기준으로 표시할 누적 핵심 이슈가 없습니다.",
    },
  }[period] || {
    kicker: "Media Desk",
    empty: "선택 기간 기준으로 표시할 핵심 이슈가 없습니다.",
  };
}

function formatIssueMeta(issue = {}) {
  const baseSource = issue.representativeSource || issue.source;
  const relatedSourceCount = Number(issue.relatedSourceCount || 1);
  const sourceLabel = baseSource && relatedSourceCount > 1
    ? `${baseSource} 외 ${relatedSourceCount - 1}곳`
    : issue.source || baseSource;
  const parts = [
    sourceLabel,
    issue.publishedAt || issue.time || issue.date,
  ].filter(Boolean);
  return parts.join(" · ");
}

function RelatedIssueDetails({ issue = {}, compact = false }) {
  const related = Array.isArray(issue.relatedArticles) ? issue.relatedArticles : [];
  if (related.length <= 1) return null;
  return (
    <details className={compact ? "issue-related-details compact" : "issue-related-details"}>
      <summary>관련 기사 {related.length.toLocaleString("ko-KR")}건 보기</summary>
      <div>
        {related.slice(0, compact ? 4 : 8).map((article) => (
          <a
            key={`${articleSelectionKey(article)}-${article.source}`}
            href={article.link && article.link !== "#" ? article.link : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => article.link && article.link !== "#" ? openArticleLink(event, article.link) : undefined}
          >
            <span>{article.source || "-"}</span>
            <b>{article.title}</b>
            <em>{[article.date, article.time].filter(Boolean).join(" ") || "-"}</em>
          </a>
        ))}
      </div>
    </details>
  );
}

function ArticleSummaryBlock({ item, dense = false }) {
  const lines = buildVisibleArticleSummaryLines(item).slice(0, dense ? 2 : 3);
  if (!lines.length) return null;
  return (
    <ul className={dense ? "summary-lines dense" : "summary-lines"}>
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function KeywordManagerTable({ rows = [], onEdit }) {
  const sortedRows = [...rows].sort((a, b) =>
    keywordCategoryLabel(a.category).localeCompare(keywordCategoryLabel(b.category), "ko-KR")
    || (Number(a.priority || 100) - Number(b.priority || 100))
    || String(a.keyword || "").localeCompare(String(b.keyword || ""), "ko-KR")
  );
  return (
    <div className="keyword-ledger-wrap">
      <table className="keyword-ledger-table">
        <colgroup>
          <col className="ledger-col-anchor" />
          <col className="ledger-col-entity" />
          <col className="ledger-col-search" />
          <col className="ledger-col-mention" />
          <col className="ledger-col-target" />
          <col className="ledger-col-mode" />
          <col className="ledger-col-tone" />
          <col className="ledger-col-exclude" />
          <col className="ledger-col-priority" />
          <col className="ledger-col-context" />
          <col className="ledger-col-context" />
          <col className="ledger-col-memo" />
        </colgroup>
        <thead>
          <tr>
            <th>분류 기준</th>
            <th>개체 유형</th>
            <th>검색어</th>
            <th>본문 등장</th>
            <th>매칭 대상</th>
            <th>매칭 방식</th>
            <th>기본 논조</th>
            <th>분석 제외</th>
            <th>우선순위</th>
            <th>포함 문맥</th>
            <th>제외 문맥</th>
            <th>운영 메모</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((item) => {
            const contextTerms = item.contextTerms?.length ? item.contextTerms.join(", ") : "-";
            const excludeTerms = item.excludeTerms?.length ? item.excludeTerms.join(", ") : "-";
            const subcategory = keywordSubcategoryLabel(item.subcategory);
            const entityType = keywordEntityTypeLabel(item.entityType);
            const matchTarget = keywordMatchTargetLabel(item.matchTarget);
            const matchMode = keywordMatchModeLabel(item.matchMode);
            const tone = keywordDefaultToneLabel(item.defaultTone);
            return (
              <tr key={`${item.category}-${item.keyword}`}>
                <td className="ledger-anchor-cell">
                  <div className="ledger-anchor-row">
                    <button className="keyword-ledger-edit" onClick={() => onEdit(item)}>수정</button>
                    <span className={`ledger-category tone-${keywordCategoryTone(item.category)}`}>{keywordCategoryLabel(item.category)}</span>
                    <span className="ledger-keyword-block" title={item.keyword}>
                      <b>{item.keyword}</b>
                      <em title={subcategory}>{subcategory}</em>
                    </span>
                  </div>
                </td>
                <td title={entityType}>{entityType}</td>
                <td><span className={`ledger-pill ${item.isSearchKeyword === false ? "muted" : "active"}`}>{item.isSearchKeyword === false ? "분류" : "검색"}</span></td>
                <td><span className={`ledger-pill ${item.requireArticleMention ? "active" : "muted"}`}>{item.requireArticleMention ? "필수" : "선택"}</span></td>
                <td title={matchTarget}>{matchTarget}</td>
                <td title={matchMode}>{matchMode}</td>
                <td><span className={`ledger-tone tone-${item.defaultTone || "neutral"}`}>{tone}</span></td>
                <td><span className={`ledger-pill ${item.analysisExcluded ? "danger" : "muted"}`}>{item.analysisExcluded ? "제외" : "포함"}</span></td>
                <td className="ledger-number">{item.priority || 100}</td>
                <td title={contextTerms}><span className="ledger-terms">{contextTerms}</span></td>
                <td title={excludeTerms}><span className="ledger-terms exclude">{excludeTerms}</span></td>
                <td title={item.memo || "-"}><span className="ledger-memo">{item.memo || "-"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KeywordRuleValidation({ validation }) {
  if (!validation?.articleCount) {
    return (
      <div className="keyword-validation-bar empty">
        <b>분류 검증</b>
        <span>검증할 기사 데이터가 아직 로드되지 않았습니다.</span>
      </div>
    );
  }
  const categoryOrder = ["own", "competitor", "industry", "regulation", "exclude", "other"];
  return (
    <div className="keyword-validation-bar">
      <div className="keyword-validation-head">
        <b>분류 검증</b>
        <span>AI 요약이 아닌 원문 근거 기준으로 누적 기사 {validation.articleCount.toLocaleString("ko-KR")}건에 적용한 미리보기입니다.</span>
      </div>
      <div className="keyword-validation-metrics">
        <span><strong>{validation.matched.toLocaleString("ko-KR")}</strong>매칭</span>
        <span><strong>{validation.unmatched.toLocaleString("ko-KR")}</strong>미매칭</span>
        {categoryOrder.map((category) => {
          const count = validation.byCategory[category] || 0;
          if (!count) return null;
          return <span key={category}><strong>{count.toLocaleString("ko-KR")}</strong>{keywordCategoryLabel(category)}</span>;
        })}
      </div>
    </div>
  );
}

function ArticleDecisionNote({ item, hideClippingLabel = false }) {
  const context = item?.aiContext || {};
  const reason = cleanDecisionNoteLine(item?.clippingReason || context.reason || "");
  const evidence = cleanDecisionNoteLine(context.evidence || "");
  const ownBasis = ownMentionBasis(item);
  const confidence = Number(context.confidence || 0);
  const chips = [];
  if (item?.clippingRecommended && !hideClippingLabel) chips.push("클리핑 후보");
  if (isOwnArticle(item)) chips.push("당사언급");
  if (context.negativeTarget && context.negativeTarget !== "none") chips.push(`대상 ${negativeTargetLabel(context.negativeTarget)}`);
  if (confidence > 0) chips.push(`신뢰도 ${Math.round(confidence * 100)}%`);
  if (!reason && !evidence && !ownBasis && !chips.length) return null;
  return (
    <div className={item?.clippingRecommended ? "article-decision-note recommended" : "article-decision-note"}>
      <div>
        <b>판단 근거</b>
        {chips.map((chip) => <span key={chip}>{chip}</span>)}
      </div>
      {(reason || ownBasis) && <p>{reason || ownBasis}</p>}
      {evidence && <em>{evidence}</em>}
    </div>
  );
}

function ownMentionBasis(item = {}) {
  if (!item || !isOwnArticle(item)) return "";
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const text = [
    item.title,
    item.summary,
    item.description,
    raw.title,
    raw.summary,
    raw.description,
    raw.content,
    raw.body,
  ].map((value) => String(value || "")).join(" ");
  if (/인카금융서비스/.test(text)) return "제목 또는 본문에 ‘인카금융서비스’가 직접 포함되어 당사언급으로 분류했습니다.";
  if (/인카금융/.test(text)) return "제목 또는 본문에 ‘인카금융’이 포함되어 당사언급으로 분류했습니다.";
  if (/인카/.test(text)) return "제목 또는 본문에 인카 관련 표현이 포함되어 당사언급으로 분류했습니다.";
  if (/인카/.test(String(item.keyword || ""))) return `검색 키워드 ‘${item.keyword}’ 기준으로 수집됐고 DB 당사언급 판정값으로 포함했습니다.`;
  if (item?.ownMentioned === true || item?.aiContext?.ownMentioned === true) return "DB의 당사언급 판정값으로 포함했습니다. 원문에서 직접 언급 위치를 추가 확인하세요.";
  return "";
}

function negativeTargetLabel(value = "") {
  return {
    own: "당사",
    industry: "업계",
    competitor: "경쟁사",
    policy: "정책",
  }[String(value).trim()] || String(value || "").trim();
}

function cleanDecisionNoteLine(value = "") {
  const text = normalizeSummaryLine(value);
  if (!text || isLowValueAnalysisLine(text)) return "";
  return text;
}

function ArticleFeed({ rows, compact = false, showTime = false, scraps = [], onFeedbackSaved, onScrapSaved }) {
  return (
    <div className={compact ? "feed-table compact" : "feed-table"}>
      {rows.map((row) => {
        const displayRow = normalizeArticleDisplay(row);
        const related = Array.isArray(displayRow.relatedArticles) ? displayRow.relatedArticles.map(normalizeArticleDisplay) : [];
        const hasRelated = related.length > 1;
        const scrapped = isArticleScrapped(displayRow, scraps);
        return (
          <article key={`${displayRow.id || displayRow.link || displayRow.title}-${displayRow.time}`} className={hasRelated ? "feed-row related" : "feed-row"}>
            <div className="feed-main">
              <div className="feed-title-line">
                <Chip tone={displayRow.tone}>{displayRow.tone}</Chip>
                <b>{displayRow.title}</b>
              </div>
              <span className="feed-meta">{formatFeedMeta(displayRow, hasRelated)}</span>
              {!compact && <ArticleSummaryBlock item={displayRow} dense />}
              {!compact && <ArticleDecisionNote item={displayRow} />}
              {!compact && hasRelated && (
                <details className="related-details">
                  <summary>묶인 기사 보기</summary>
                  <div>
                    {related.slice(0, 8).map((item) => (
                      <a
                        key={`${item.id || item.link || item.title}-${item.source}`}
                        href={item.link && item.link !== "#" ? item.link : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => item.link && item.link !== "#" ? openArticleLink(event, item.link) : undefined}
                      >
                        <span>{item.source}</span>
                        <b>{item.title}</b>
                        <em>{item.time || item.date || "-"}</em>
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </div>
            {!compact && (
              <div className="feed-actions">
                <ArticleCorrectionControl article={displayRow} onSaved={onFeedbackSaved} />
                <ArticleScrapButton article={displayRow} scrapped={scrapped} onScrapSaved={onScrapSaved} showLabel />
                {displayRow.link && displayRow.link !== "#" && (
                  <a
                    href={displayRow.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="기사 열기"
                    onClick={(event) => openArticleLink(event, displayRow.link)}
                  >
                    <ExternalLink /> 기사 열기
                  </a>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ArticleScrapButton({ article, scrapped = false, onScrapSaved, showLabel = false }) {
  const [saved, setSaved] = useState(scrapped);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSaved(scrapped);
  }, [scrapped]);

  if (!onScrapSaved) return null;

  const handleClick = async () => {
    if (saved || saving) return;
    setSaving(true);
    try {
      await onScrapSaved(article);
      setSaved(true);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("missing_dashboard_session") || message.includes("invalid_session")) {
        window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
      }
      window.alert(message.includes("missing_dashboard_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 스크랩해 주세요."
        : "스크랩 저장에 실패했습니다. 운영 DB 연결을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      className={saved ? "scrap-action saved" : "scrap-action"}
      title={saved ? "스크랩됨" : "스크랩"}
      aria-label={saved ? "스크랩됨" : "기사 스크랩"}
      onClick={handleClick}
      disabled={saving || saved}
    >
      <Bookmark />
      {showLabel && <span>{saved ? "스크랩됨" : "스크랩"}</span>}
    </button>
  );
}

function buildImmediateFeedbackRow(result = {}, article = {}, correction = {}) {
  const row = Array.isArray(result?.feedback) ? result.feedback[0] : result?.feedback;
  const createdAt = row?.created_at || new Date().toISOString();
  const createdDate = new Date(createdAt);
  const articleHash = row?.article_hash || article.article_hash || article.articleHash || article.id || "";
  return {
    id: row?.id || `immediate-${articleHash || article.link || Date.now()}`,
    articleHash,
    title: row?.title || article.title || "",
    link: row?.link || article.link || "",
    previousCategory: row?.previous_category || article.category || article.category_label || "",
    previousTone: row?.previous_tone || article.tone || article.tone_label || "",
    correctedCategory: row?.corrected_category || correction.category || "",
    correctedTone: row?.corrected_tone || correction.tone || "",
    reason: feedbackReasonDisplay(row?.reason || correction.reason),
    createdBy: row?.created_by || correction.createdBy || "dashboard",
    createdAt,
    date: Number.isNaN(createdDate.getTime()) ? String(createdAt).slice(0, 10) : formatKstDateKey(createdDate),
    time: formatFeedbackStamp(createdAt).slice(-5),
  };
}

function feedbackReasonDisplay(value) {
  return {
    dashboard_manual_correction: "수동 분류 수정",
  }[String(value || "").trim()] || String(value || "").trim();
}

function upsertFeedbackRows(rows = [], row = null) {
  if (!row) return rows;
  const map = new Map(rows.map((item) => [String(item.id || `${item.articleHash}-${item.createdAt}`), item]));
  map.set(String(row.id || `${row.articleHash}-${row.createdAt}`), row);
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function normalizeSavedScrapRow(row = {}) {
  const snapshot = row.article_snapshot || row.articleSnapshot || {};
  const id = row.article_hash || snapshot.article_hash || snapshot.id || snapshot.link || snapshot.title;
  if (!id || !snapshot.title) return null;
  return {
    id,
    articleHash: row.article_hash || snapshot.article_hash || "",
    title: snapshot.title || "",
    link: snapshot.link || "",
    source: snapshot.source || "",
    keyword: snapshot.keyword || "",
    summary: snapshot.summary || "",
    date: String(snapshot.report_date || snapshot.pub_date || snapshot.date || row.created_at || "").slice(0, 10),
    time: "",
    pubDate: snapshot.pub_date || "",
    slot: snapshot.report_slot || "",
    score: Number(snapshot.score || 0),
    category: displayCategory(snapshot.category || snapshot.category_label || ""),
    tone: displayTone(snapshot.tone || snapshot.tone_label || ""),
    riskLevel: String(snapshot.risk_level || snapshot.riskLevel || "").toUpperCase(),
    relatedCount: Number(snapshot.cluster_size || snapshot.clusterSize || 1),
    scrapedAt: row.created_at ? String(row.created_at).slice(0, 10) : "",
  };
}

function upsertScrapRows(rows = [], newRows = []) {
  const map = new Map(rows.map((row) => [articlePrimaryIdentity(row), row]));
  newRows.forEach((row) => {
    const key = articlePrimaryIdentity(row);
    if (key) map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => String(b.scrapedAt || b.date || "").localeCompare(String(a.scrapedAt || a.date || "")));
}

function isArticleScrapped(article = {}, scraps = []) {
  const targets = new Set(articleIdentityCandidates(article));
  return scraps.some((scrap) => articleIdentityCandidates(scrap).some((key) => targets.has(key)));
}

function articlePrimaryIdentity(article = {}) {
  return articleIdentityCandidates(article)[0] || "";
}

function articleIdentityCandidates(article = {}) {
  return [
    article.articleHash,
    article.article_hash,
    article.id,
    article.link && `link:${article.link}`,
    article.title && `${article.source || ""}:${article.title}`,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function displayCategory(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (canonical === "sponsorship" || /브랜드|스폰서|후원/.test(text)) return "스폰서십";
  if (canonical === "own" || /당사/.test(text)) return "당사";
  if (canonical === "regulation" || /정책|규제/.test(text)) return "정책/규제";
  if (canonical === "competitor" || /경쟁|GA|보험사/.test(text)) return "경쟁사";
  if (canonical === "industry" || /업계/.test(text)) return "업계동향";
  return text || "기타";
}

function buildCategoryFlowRows(articles = [], limit = 6) {
  return groupArticles(articles, "category").slice(0, limit).map(([category, value]) => ({
    name: categoryFlowLabel(category),
    category,
    value,
  }));
}

function buildReportCategoryFlowRows(articles = [], summary = {}, limit = 6) {
  const dedupedArticles = dedupeReportCategoryArticles(articles.filter(isUsableArticle));
  const analyzed = Number(summary?.analyzed || 0);
  const scopedArticles = analyzed > 0 && dedupedArticles.length > analyzed
    ? dedupedArticles.slice(0, analyzed)
    : dedupedArticles;
  return buildCategoryFlowRows(scopedArticles, limit);
}

function dedupeReportCategoryArticles(articles = []) {
  const seen = new Set();
  return articles.filter((article) => {
    const titleKey = normalizeKeywordText(article.title || "").slice(0, 96);
    const linkKey = normalizeKeywordText(article.link || article.url || "");
    const hashKey = normalizeKeywordText(article.articleHash || article.article_hash || article.hash || "");
    const key = hashKey || titleKey || linkKey;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function categoryFlowLabel(value) {
  const canonical = String(value || "").trim().toLowerCase();
  return {
    own: "당사",
    competitor: "GA",
    industry: "보험사",
    regulation: "정책/규제",
    sponsorship: "스폰서십",
    exclude: "제외",
    other: "기타",
  }[canonical] || displayCategory(value);
}

function displayTone(value) {
  const text = String(value || "").trim();
  const canonical = text.toLowerCase();
  if (canonical === "negative" || /부정/.test(text)) return "부정";
  if (canonical === "caution" || /주의/.test(text)) return "주의";
  if (canonical === "positive" || /긍정/.test(text)) return "긍정";
  if (canonical === "exclude" || /제외/.test(text)) return "제외";
  return text || "중립";
}

function normalizeArticleDisplay(row = {}) {
  if (!row || typeof row !== "object") return row;
  const cleanRelatedArticles = filterRelatedArticlesForRepresentative(row).map((article) => ({
    ...article,
    category: displayCategory(article.category),
    tone: displayTone(article.tone),
  }));
  const relatedSourceCount = unique(cleanRelatedArticles.map((item) => item.source).filter(Boolean)).length;
  const baseRow = {
    ...row,
    category: displayCategory(row.category),
    tone: displayTone(row.tone),
    relatedArticles: cleanRelatedArticles,
    relatedCount: cleanRelatedArticles.length,
    relatedSourceCount,
    clusterSize: Math.max(1, cleanRelatedArticles.length),
  };
  if (!isCompetitorBrandReputationAgainstOwn(row)) return baseRow;
  const relatedArticles = cleanRelatedArticles.map((item) => ({
    ...item,
    tone: item.tone === "긍정" || item.tone === "positive" ? "주의" : item.tone,
    summaryLines: buildBrandReputationDisplayLines(item),
  }));
  return {
    ...baseRow,
    category: row.category === "당사" || row.category === "긍정" ? "경쟁사" : row.category,
    tone: row.tone === "긍정" || row.tone === "positive" ? "주의" : row.tone || "주의",
    summary: "",
    summaryLines: buildBrandReputationDisplayLines(row),
    relatedArticles,
    relatedCount: relatedArticles.length,
    relatedSourceCount,
    clusterSize: Math.max(1, relatedArticles.length),
  };
}

function filterRelatedArticlesForRepresentative(row = {}) {
  const members = Array.isArray(row.relatedArticles) && row.relatedArticles.length ? row.relatedArticles : [row];
  const representative = row;
  const cleaned = [];
  const seen = new Set();
  members.forEach((member) => {
    if (!articleBelongsToSameIssue(representative, member)) return;
    const key = issueMemberKey(member);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    cleaned.push(member);
  });
  if (!cleaned.length) return [row];
  const representativeKey = issueMemberKey(row);
  if (representativeKey && !seen.has(representativeKey)) cleaned.unshift(row);
  return cleaned.sort(compareArticleImportance);
}

function articleBelongsToSameIssue(representative = {}, candidate = {}) {
  if (!representative || !candidate) return false;
  const ownSanctionRep = isOwnSupervisorySanctionArticle(representative);
  const ownSanctionCandidate = isOwnSupervisorySanctionArticle(candidate);
  if (ownSanctionRep || ownSanctionCandidate) {
    return ownSanctionRep && ownSanctionCandidate;
  }
  const repTopic = articleTopicSignature(representative);
  const candidateTopic = articleTopicSignature(candidate);
  if (repTopic || candidateTopic) {
    if (repTopic && candidateTopic) {
      if (repTopic !== candidateTopic) return false;
      if (requiresStrictSameIssueEvidence(repTopic)) {
        const repSeed = articleGroupSeed(representative);
        const candidateSeed = articleGroupSeed(candidate);
        return sharedTokenCount(repSeed.distinctiveTokens, candidateSeed.distinctiveTokens) >= 1
          || titleHasSharedNamedEntity(representative, candidate);
      }
      return true;
    }
    if (repTopic?.startsWith("브랜드평판-") || candidateTopic?.startsWith("브랜드평판-")) return false;
  }
  const repSeed = articleGroupSeed(representative);
  const candidateSeed = articleGroupSeed(candidate);
  return areRelatedArticleSeeds(repSeed, candidateSeed);
}

function requiresStrictSameIssueEvidence(topic = "") {
  return [
    "event:insurance-fraud-regulatory-general",
    "event:insurance-fraud-ai-medical-claim",
    "event:insurance-fraud-hospital-claims",
  ].includes(String(topic || ""));
}

function titleHasSharedNamedEntity(a = {}, b = {}) {
  const aText = normalizeGroupTitle(`${a.title || ""} ${a.summary || ""} ${a.source || ""}`);
  const bText = normalizeGroupTitle(`${b.title || ""} ${b.summary || ""} ${b.source || ""}`);
  const entities = [
    "인카금융서비스", "인카금융", "글로벌금융판매", "지에이코리아", "메가", "한화생명", "한화손해보험",
    "삼성생명", "삼성화재", "db손해보험", "DB손해보험", "kb손해보험", "KB손해보험", "롯데손해보험",
    "금융감독원", "금감원", "금융위원회", "금융위", "경찰청", "요양병원", "교통사고",
  ].map(normalizeGroupTitle);
  return entities.some((entity) => entity && aText.includes(entity) && bText.includes(entity));
}

function isOwnSupervisorySanctionArticle(article = {}) {
  const raw = article.raw && typeof article.raw === "object" ? article.raw : {};
  const text = [
    article.title,
    article.description,
    article.summary,
    article.content,
    article.body,
    raw.title,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
  ].map((value) => String(value || "")).join(" ");
  const own = /(?:\uC778\uCE74\uAE08\uC735\uC11C\uBE44\uC2A4|\uC778\uCE74\uAE08\uC735)/i;
  const agent = /(?:\uC804\uC9C1\s*)?\uC124\uACC4\uC0AC/i;
  const regulator = /(?:\uAE08\uAC10\uC6D0|\uAE08\uC735\uAC10\uB3C5\uC6D0|\uAE08\uC735\uB2F9\uAD6D)/i;
  const sanction = /(?:\uC81C\uC7AC|\uCC98\uBD84|\uB4F1\uB85D\s*\uCDE8\uC18C|\uC5C5\uBB34\s*\uC815\uC9C0)/i;
  const fraud = /(?:\uBCF4\uD5D8\uC0AC\uAE30|\uACE0\uC758\s*\uAD50\uD1B5\uC0AC\uACE0|\uBCF4\uD5D8\uAE08|\uD3B8\uCDE8|\uD5C8\uC704\s*\uC785\uC6D0|\uB0B4\uBD80\uD1B5\uC81C|\uAD00\uB9AC\s*\uAD6C\uBA4D)/i;
  return (
    (regulator.test(text) && own.test(text) && agent.test(text) && sanction.test(text))
    || (own.test(text) && agent.test(text) && sanction.test(text))
    || (own.test(text) && fraud.test(text))
    || (fraud.test(text) && own.test(text) && agent.test(text))
  );
}

function patchCorrectedArticles(rows = [], article = {}, correction = {}) {
  const targetKey = articleSelectionKey(article);
  const link = normalizeRiskUrl(article.link || "");
  return rows.map((row) => {
    const sameKey = articleSelectionKey(row) === targetKey;
    const sameLink = link && normalizeRiskUrl(row.link || "") === link;
    if (!sameKey && !sameLink) return row;
    return {
      ...row,
      category: correction.category || row.category,
      tone: correction.tone || row.tone,
      riskLevel: riskLevelFromTone(correction.tone || row.tone),
    };
  });
}

function riskLevelFromTone(tone = "") {
  if (tone === "부정") return "HIGH";
  if (tone === "주의") return "MEDIUM";
  return "LOW";
}

const FEEDBACK_CATEGORY_OPTIONS = ["당사", "스폰서십", "GA", "보험사", "정책/규제", "업계동향", "기타", "제외"];
const FEEDBACK_TONE_OPTIONS = ["긍정", "중립", "주의", "부정", "제외"];

function ArticleCorrectionControl({ article, onSaved }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(article.category || "기타");
  const [tone, setTone] = useState(article.tone || "중립");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setStatus("저장 중");
    const correction = {
      category,
      tone,
      reason: "dashboard_manual_correction",
      createdBy: "dashboard",
    };
    try {
      const result = await saveClassificationFeedback(article, correction);
      const patchNote = result?.patchError ? " · 원문 패치는 권한 확인 필요" : "";
      setStatus(`저장 완료${patchNote}`);
      window.setTimeout(() => setOpen(false), 900);
      await onSaved?.(result, article, correction);
    } catch (error) {
      setStatus(feedbackErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={open ? "article-correction open" : "article-correction"}>
      <button type="button" className="correction-toggle" onClick={() => setOpen((value) => !value)}>
        <FilePenLine />분류 수정
      </button>
      {open && (
        <div className="correction-editor">
          <label>
            <span>논조</span>
            <select value={tone} onChange={(event) => setTone(event.target.value)}>
              {FEEDBACK_TONE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>분류</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {FEEDBACK_CATEGORY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" className="primary-button compact-save" onClick={save} disabled={saving}>
            저장
          </button>
          <button type="button" className="ghost-button compact-cancel" onClick={() => setOpen(false)} disabled={saving}>
            취소
          </button>
          {status && <span className="correction-status">{status}</span>}
        </div>
      )}
    </div>
  );
}

function feedbackErrorMessage(error) {
  const message = error?.message || "";
  if (message.includes("missing_dashboard_session") || message.includes("invalid_session")) {
    window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
    return "운영 DB 세션이 필요합니다. 로그인창을 열었습니다.";
  }
  if (message.includes("write_not_allowed")) {
    return "수정 권한이 없습니다.";
  }
  return "저장 실패 · 연결을 확인해 주세요.";
}

function formatFeedMeta(row = {}, hasRelated = false) {
  const parts = [
    row.source,
    row.keyword || row.category,
    [row.date || row.slot || "", row.time || ""].filter(Boolean).join(" "),
  ].filter(Boolean);
  if (hasRelated) {
    const sourceCount = Number(row.relatedSourceCount || 0);
    const extraSources = Math.max(0, sourceCount - 1);
    const extraArticles = Math.max(0, Number(row.relatedCount || 0) - 1);
    const extra = extraSources || extraArticles;
    if (extra > 0) parts.push(`외 ${extra}곳`);
  }
  return parts.join(" · ");
}

function openArticleLink(event, url) {
  event.preventDefault();
  event.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}

function OpsRuntimeStrip({ jobs, watchHealth, notificationHealth, aiStatus }) {
  const watchJob = jobs.find((job) => job.label === "부정기사 감시") || jobs[0] || {};
  const watchStatus = watchHealth?.status || "unknown";
  const watchValue = watchHealth?.label || (watchStatus === "success" ? "정상" : watchStatus === "fail" ? "실패" : "확인");
  const watchDetail = watchHealth?.detail || (watchJob.latest ? `${watchJob.latest} 실행` : "최근 감시 대기");
  const sendStatus = notificationHealth?.status || "unknown";
  const sendValue = notificationHealth?.label || (sendStatus === "success" ? "정상" : sendStatus === "fail" ? "실패" : "확인");
  const sendDetail = notificationHealth?.detail || "슬랙 발송 이력 확인";
  const apiValue = "100%";
  const apiDetail = "Llama 잔량 기준";
  return (
    <section className="panel ops-runtime-strip">
      <OpsMiniStatus icon={Radar} label="감시" value={watchValue} detail={watchDetail} status={watchStatus} />
      <OpsMiniStatus icon={Bell} label="발송" value={sendValue} detail={sendDetail} status={sendStatus} />
      <OpsMiniStatus icon={Gauge} label="API" value={apiValue} detail={apiDetail} status="success" />
    </section>
  );
}

function OpsMiniStatus({ icon: Icon, label, value, detail, status = "unknown" }) {
  return (
    <article className={`ops-mini-status ${status}`}>
      <Icon className="ops-mini-bg-icon" aria-hidden="true" />
      <div>
        <span><Icon />{label}</span>
        <b>{value}</b>
      </div>
      <p>{detail}</p>
    </article>
  );
}

function WatchPanel({ jobs, risk = "LOW", health }) {
  const watchJob = jobs.find((job) => job.label === "부정기사 감시") || jobs[0] || {};
  const status = health?.status || "unknown";
  const heading = status === "fail"
    ? "감시 확인 필요"
    : status === "warn"
      ? "감시 지연 주의"
      : status === "pending"
        ? "감시 확인 중"
        : "정상 감시";
  const detail = health?.detail || (watchJob.latest ? `${watchJob.latest} 실행` : "최근 실행 확인 대기");
  const meta = health?.meta || `${watchJob.cadence || NEGATIVE_WATCH_SHORT_LABEL} · ${watchJob.state || "확인"}`;
  return (
    <section className="watch-panel">
      <div className="watch-title-row">
        <span><Radar />부정기사 탐색</span>
        <HealthStatusPill status={status} label={health?.label || risk} />
      </div>
      <div className="watch-top">
        <div className="radar-asset">
          <span className="radar-sweep" />
          <span className="radar-ring r1" />
          <span className="radar-ring r2" />
          <span className="radar-dot d1" />
          <span className="radar-dot d2" />
          <Radar />
        </div>
        <div className="watch-copy">
          <h2>{heading}</h2>
          <p>{detail}</p>
          <strong>{meta}</strong>
          <span>{NEGATIVE_WATCH_SHORT_LABEL}</span>
        </div>
      </div>
      <div className="watch-progress"><span /></div>
    </section>
  );
}

function AiUsagePanel({ status }) {
  const groqReserve = 100;
  return (
    <section className="ai-usage-panel llama-only">
      <div className="ai-usage-head">
        <span><Gauge />API</span>
        <b>잔량 기준</b>
      </div>
      <div className="ai-compact-value">
        <strong>{groqReserve}%</strong>
        <span>Llama 잔량</span>
      </div>
    </section>
  );
}

function AiMeterRow({ label, percent, value, mode = "remaining", emptyStatus = "미수신" }) {
  const fill = Number.isFinite(percent) ? percent : 0;
  const status = percent === null || percent === undefined
    ? emptyStatus
    : percent >= 70 ? "정상"
    : percent >= 35 ? "주의"
    : "낮음";
  return (
    <div className="ai-meter-row" style={{ "--bar-fill": `${fill}%` }}>
      <div>
        <span>{label}</span>
        <b>{status}</b>
      </div>
      <div className="ai-meter-track" aria-label={`${label} ${mode === "used" ? "사용량" : "잔량"}`}>
        <i />
      </div>
      <em>{value}</em>
    </div>
  );
}

function percentRemaining(remaining, limit) {
  const remainingNumber = toNumericLimit(remaining);
  const limitNumber = toNumericLimit(limit);
  if (!Number.isFinite(remainingNumber) || !Number.isFinite(limitNumber) || limitNumber <= 0) return null;
  return clampPercent(Math.round((remainingNumber / limitNumber) * 100));
}

function toNumericLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function formatLimitPair(remaining, limit, fallback = "응답 헤더 없음") {
  if (remaining === undefined && limit === undefined) return fallback;
  const left = remaining === undefined ? "-" : formatCompactNumber(remaining);
  const right = limit === undefined ? "-" : formatCompactNumber(limit);
  return `${left} / ${right}`;
}

function formatCompactNumber(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(number)) return String(value || "-");
  return number.toLocaleString("ko-KR");
}

function formatCompactDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatGeminiState(gemini = {}, report = {}) {
  const lastResponse = gemini.last_response || {};
  if (!gemini.has_key) return "키 없음";
  if (report.credit_depleted) return "크레딧 소진";
  if (report.quota_exhausted) return "쿼터 소진";
  if (lastResponse.status === "credit_depleted") return "크레딧 소진";
  if (lastResponse.status === "quota_error") return "쿼터 소진";
  if (gemini.circuit_open) return "차단 중";
  if (report.fallback_used) return "백업 전환";
  if (lastResponse.status === "success") return "정상";
  if (report.ai_model_used && report.primary_failed === false) return "정상";
  return "최근 기록 없음";
}

function formatGeminiDetail(gemini = {}, report = {}) {
  if (report.run_key) {
    const slot = report.report_slot ? `${report.report_slot}시 보고서` : "최근 보고서";
    const usageText = formatGeminiUsageText(report.usage);
    if (report.credit_depleted) return `${slot}에서 Gemini 크레딧 소진이 감지되어 Groq/규칙 백업을 사용했습니다.`;
    if (report.quota_exhausted) return `${slot}에서 Gemini 쿼터 한도가 감지되어 백업을 사용했습니다.`;
    if (report.fallback_used) return `${slot}에서 ${report.ai_model_used || "백업 모델"}로 전환했습니다.`;
    if (report.ai_model_used) return `${slot}에서 ${report.ai_model_used} 응답을 사용했습니다${usageText ? ` · ${usageText}` : ""}.`;
  }
  const lastUsageText = formatGeminiUsageText(gemini.last_response?.usage);
  if (lastUsageText) return `최근 Gemini 호출 ${lastUsageText}.`;
  if (gemini.circuit_open && gemini.blocked_until) return `${formatCompactDateTime(gemini.blocked_until)}까지 Gemini 호출을 쉬고 있습니다.`;
  if (gemini.circuit_reason) return gemini.circuit_reason;
  if (gemini.has_key) return "정확한 잔여 무료량은 Gemini API 응답으로 제공되지 않아, 최근 호출 결과와 오류로 상태를 판단합니다.";
  return "GEMINI_API_KEY가 설정되지 않았습니다.";
}

function formatGeminiUsageText(usage = {}) {
  const total = usage?.total_token_count;
  if (total === undefined || total === null || total === "") return "";
  const prompt = usage.prompt_token_count;
  const output = usage.candidates_token_count;
  const pieces = [`총 ${formatCompactNumber(total)}토큰`];
  if (prompt !== undefined) pieces.push(`입력 ${formatCompactNumber(prompt)}`);
  if (output !== undefined) pieces.push(`출력 ${formatCompactNumber(output)}`);
  return pieces.join(" · ");
}

function NotificationList({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const collapsedLimit = 3;
  const expandedLimit = 20;
  const displayLimit = showAll ? expandedLimit : collapsedLimit;
  const visibleRows = rows.slice(0, displayLimit);
  const hiddenCount = Math.max(0, rows.length - visibleRows.length);
  return (
    <>
      <div className="notification-list">
        {visibleRows.map((item) => (
          <button
            key={item.id || `${item.time}-${item.type}`}
            type="button"
            className="clickable"
            title={item.body || item.type}
            onClick={() => setSelected(item)}
          >
            <b>{item.time}</b>
            <span>{item.type}</span>
            <Chip tone={item.status}>{item.status}</Chip>
          </button>
        ))}
      </div>
      {rows.length > collapsedLimit && (
        <button className="ghost-button notification-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "접기" : `최근 ${Math.min(expandedLimit, rows.length)}건 보기`}
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <p className="notification-limit-note">화면에는 최근 {expandedLimit}건만 표시합니다. 전체 이력은 운영 DB 기준으로 보관됩니다.</p>
      )}
      {selected && <NotificationDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function NotificationStatusSummary({ health, total = 0 }) {
  return (
    <div className={`operation-status-summary ${health?.status || "unknown"}`}>
      <div>
        <HealthStatusPill status={health?.status || "unknown"} label={health?.label || "확인"} />
        <b>{health?.detail || "슬랙 이력 확인 대기"}</b>
      </div>
      <span>{health?.meta || `누적 ${Number(total || 0).toLocaleString("ko-KR")}건`}</span>
    </div>
  );
}

function NotificationDetail({ item, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="detail-panel">
        <button type="button" className="icon-button close" onClick={onClose} aria-label="닫기">
          <X />
        </button>
        <span className="detail-kicker">슬랙 발송 내역</span>
        <h2>{item.rawTitle || item.type || "슬랙"}</h2>
        <div className="detail-meta">
          <Chip tone={item.status}>{item.status}</Chip>
          <span>{item.time}</span>
        </div>
        <pre>{item.body || "저장된 발송 본문이 없습니다."}</pre>
        {item.link && (
          <a className="article-link-button" href={item.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, item.link)}>
            <ExternalLink />연결 링크 열기
          </a>
        )}
      </section>
    </div>
  );
}

function ReportAutomationStatus({ reportHealth, actionsHealth, historyHealth }) {
  const slots = Array.isArray(reportHealth?.slots) ? reportHealth.slots : [];
  return (
    <div className="report-automation-status">
      <div className={`operation-status-summary ${reportHealth?.status || "unknown"}`}>
        <div>
          <HealthStatusPill status={reportHealth?.status || "unknown"} label={reportHealth?.label || "확인"} />
          <b>{reportHealth?.detail || "일일보고서 스케줄 확인 대기"}</b>
        </div>
        <span>{reportHealth?.progress || reportHealth?.meta || "정기 발송 스케줄"}</span>
      </div>
      <div className="daily-slot-grid">
        {slots.map((slot) => (
          <span className={`daily-slot ${slot.status}`} key={slot.slot}>
            <b>{slot.slot}:00</b>
            <em>{slot.state}</em>
          </span>
        ))}
      </div>
      <div className="automation-foot">
        <span>
          <b>Actions</b>
          <em>{actionsHealth?.detail || "워크플로우 확인 대기"}</em>
        </span>
        <span>
          <b>DB 기록</b>
          <em>{historyHealth?.detail || "Supabase 기록 확인 대기"}</em>
        </span>
      </div>
    </div>
  );
}

function PressInfluence({ rows, detailed = false, compact = false, onOpenMonitoring }) {
  const pressRows = rows.filter((item) => !isOfficialRegulatorSource(item.source));
  const max = Math.max(1, ...pressRows.map((item) => item.total));
  const visibleRows = pressRows.slice(0, compact ? 5 : PRESS_INFLUENCE_LIMIT);
  return (
    <div className={detailed ? "press-list detailed" : "press-list"}>
      {visibleRows.map((item) => (
        <button className={`press-row ${onOpenMonitoring ? "clickable" : ""}`} key={item.source} onClick={() => onOpenMonitoring?.({ source: item.source })}>
          <b>{item.source}</b>
          <span className="press-bar"><span style={{ width: `${Math.max(6, (item.total / max) * 100)}%` }} /></span>
          <em>{item.total}건</em>
          {detailed && <small>전체 {item.total}건 · 당사 언급 {item.own}건 · 부정 논조 {item.negative}건</small>}
        </button>
      ))}
    </div>
  );
}

function CategoryChart({ rows, tall = false, mini = false, verticalBars = false, onOpenMonitoring, drillBy = "category", labelWidth = 86 }) {
  const className = ["chart-box", tall ? "tall" : "", mini ? "mini" : "", verticalBars ? "vertical-bars" : "", onOpenMonitoring ? "with-drill" : ""]
    .filter(Boolean)
    .join(" ");
  const openPreset = (row) => {
    if (!onOpenMonitoring) return;
    if (drillBy === "keyword") {
      onOpenMonitoring({ query: row.keyword || row.name });
      return;
    }
    onOpenMonitoring({ category: categoryPresetFor(row.category || row.name) });
  };
  return (
    <div className={className}>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          {verticalBars ? (
            <BarChart data={rows} margin={{ left: 4, right: 6, top: 26, bottom: 4 }} barCategoryGap={18}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11, fontWeight: 900 }} />
              <YAxis type="number" hide />
              <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString("ko-KR")}건`, "기사량"]} />
              <Bar dataKey="value" radius={[7, 7, 0, 0]} maxBarSize={46}>
                <LabelList dataKey="value" position="top" formatter={(value) => `${Number(value || 0).toLocaleString("ko-KR")}건`} fill="#0f1f3d" fontSize={11} fontWeight={900} />
                {rows.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={labelWidth} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`${Number(value || 0).toLocaleString("ko-KR")}건`, "기사량"]} />
              <Bar dataKey="value" radius={[0, 7, 7, 0]}>
                {rows.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {onOpenMonitoring && (
        <div className="chart-drill-buttons">
          {rows.slice(0, 5).map((row) => (
            <button key={row.name} onClick={() => openPreset(row)}>{row.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToneTrend({ rows, compact = false }) {
  return (
    <div className={compact ? "chart-box report-trend" : "chart-box tall"}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={rows} margin={{ left: 8, right: 12, top: 12, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={compact ? 8 : 14} tick={{ fontSize: compact ? 9 : 12, fontWeight: 800 }} />
          <YAxis hide />
          <Tooltip />
          <Line type="monotone" dataKey="positive" stroke="#14805f" strokeWidth={2.5} dot={false} name="긍정" />
          <Line type="monotone" dataKey="caution" stroke="#b45309" strokeWidth={2.5} dot={false} name="주의" />
          <Line type="monotone" dataKey="negative" stroke="#c92337" strokeWidth={2.5} dot={false} name="부정" />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightList({ insights = [] }) {
  return <div className="insight-list">{insights.map((text) => <p key={text}>{text}</p>)}</div>;
}

function KeywordBrief({ rows = [] }) {
  const leaders = rows.filter((row) => Number(row.value || 0) > 0).slice(0, 4);
  if (!leaders.length) return <div className="keyword-brief empty">선정 키워드 기준으로 관찰된 기사가 아직 없습니다.</div>;
  return (
    <div className="keyword-brief">
      {leaders.map((row, index) => (
        <span key={row.keyword || row.name}>
          <b>{index + 1}</b>
          {row.name} {Number(row.value || 0).toLocaleString("ko-KR")}건
        </span>
      ))}
    </div>
  );
}

function RuleStack() {
  return (
    <div className="rule-stack">
      {contextRules.map((rule) => (
        <article key={rule.label}>
          <Chip tone={rule.label}>{rule.label}</Chip>
          <b>{rule.action}</b>
          <p>{rule.body}</p>
        </article>
      ))}
    </div>
  );
}

function Fact({ label, value }) {
  return <div className="fact"><span>{label}</span><b>{value}</b></div>;
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <article className="stat-card">
      <Icon />
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}

function DataSourcePill({ operations }) {
  return <div className={`data-source-pill ${operations.status}`}>{operations.message || "샘플 데이터"}</div>;
}

function Chip({ children, tone }) {
  const cls = toneCssClass(tone);
  return <span className={`chip ${cls}`}>{children}</span>;
}

function toneCssClass(tone) {
  return {
    부정: "negative",
    주의: "caution",
    중립: "neutral",
    긍정: "positive",
    정상: "positive",
    성공: "positive",
    우호: "positive",
    예약: "neutral",
    제외: "muted",
  }[tone] || "plain";
}

function composePeriodData(base, articles, reportRuns = [], liveConnected = false, period = "daily") {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const runSummary = summarizeReportRuns(reportRuns);
  if (!articles.length && !reportRuns.length) {
    return buildDisconnectedPeriodData(base, "선택 기간 데이터가 없습니다.");
  }
  const usableArticles = articles.filter(isUsableArticle);
  const periodScope = buildReportPeriodScope(usableArticles.length ? usableArticles : reportRuns, period, base.scope);
  const ownMentions = usableArticles.filter(isOwnArticle).length;
  const ownNegative = usableArticles.filter((article) => isOwnArticle(article) && article.tone === "부정").length;
  const caution = usableArticles.filter((article) => article.tone === "주의").length;
  const gaInsurance = usableArticles.filter((article) => ["GA", "보험사"].includes(article.category)).length;
  const headlineOwnMentions = ownMentions;
  const headlineOwnNegative = ownNegative;
  const headlineCaution = caution;
  const summary = {
    ...base.summary,
    collected: runSummary.collected ?? usableArticles.length,
    analyzed: runSummary.analyzed ?? usableArticles.filter((article) => article.tone !== "제외").length,
    ownMentions: headlineOwnMentions,
    ownNegative: headlineOwnNegative,
    caution: headlineCaution,
    gaInsurance,
    risk: headlineOwnNegative >= 3 ? "HIGH" : headlineOwnNegative > 0 ? "MEDIUM" : "LOW",
    headline: buildHeadline(usableArticles, headlineOwnMentions, headlineOwnNegative, headlineCaution),
    watchTime: usableArticles[0]?.time || base.summary.watchTime,
  };
  return {
    ...base,
    summary,
    generatedAt: new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date()),
    scope: periodScope.scopeLabel || base.scope,
    periodScope,
    issues: usableArticles.length ? buildIssues(usableArticles, base.issues) : [],
    categoryFlow: buildCategoryFlowRows(usableArticles),
    toneTrend: buildToneTrend(usableArticles),
    pressInfluence: buildPressInfluence(usableArticles),
  };
}

function buildDisconnectedPeriodData(base, headline = "운영 DB 로그인 후 실제 수집/분석 수치가 표시됩니다.") {
  return {
    ...base,
    scope: "데이터 연결 필요",
    generatedAt: "-",
    summary: {
      ...base.summary,
      risk: "LOW",
      collected: 0,
      analyzed: 0,
      ownMentions: 0,
      ownNegative: 0,
      caution: 0,
      gaInsurance: 0,
      dispatchTime: "-",
      watchTime: "-",
      headline,
    },
    issues: [],
    categoryFlow: [],
    toneTrend: [],
    pressInfluence: [],
  };
}

function summarizeReportRuns(reportRuns) {
  if (!reportRuns.length) return {};
  const sums = reportRuns.reduce(
    (acc, row) => {
      const metrics = row.metrics || {};
      if (Object.prototype.hasOwnProperty.call(metrics, "total_collected")) acc.hasCollected = true;
      if (Object.prototype.hasOwnProperty.call(metrics, "total_after_cluster")) acc.hasAnalyzed = true;
      if (Object.prototype.hasOwnProperty.call(metrics, "own_total")) acc.hasOwnMentions = true;
      if (Object.prototype.hasOwnProperty.call(metrics, "own_negative")) acc.hasOwnNegative = true;
      if (metrics.by_tone && Object.prototype.hasOwnProperty.call(metrics.by_tone, "caution")) acc.hasCaution = true;
      acc.collected += numberOrZero(metrics.total_collected);
      acc.analyzed += numberOrZero(metrics.total_after_cluster);
      acc.ownMentions += numberOrZero(metrics.own_total);
      acc.ownNegative += numberOrZero(metrics.own_negative);
      acc.caution += numberOrZero(metrics.by_tone?.caution);
      if (row.riskLevel === "HIGH" || metrics.risk_level === "HIGH") acc.risk = "HIGH";
      else if (!acc.risk && (row.riskLevel === "MEDIUM" || metrics.risk_level === "MEDIUM")) acc.risk = "MEDIUM";
      return acc;
    },
    {
      collected: 0,
      analyzed: 0,
      ownMentions: 0,
      ownNegative: 0,
      caution: 0,
      risk: "",
      hasCollected: false,
      hasAnalyzed: false,
      hasOwnMentions: false,
      hasOwnNegative: false,
      hasCaution: false,
    },
  );
  return {
    collected: sums.hasCollected ? sums.collected : undefined,
    analyzed: sums.hasAnalyzed ? sums.analyzed : undefined,
    ownMentions: sums.hasOwnMentions ? sums.ownMentions : undefined,
    ownNegative: sums.hasOwnNegative ? sums.ownNegative : undefined,
    caution: sums.hasCaution ? sums.caution : undefined,
    risk: sums.risk || "",
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildHeadline(articles, ownMentions, ownNegative, caution) {
  const gaInsuranceCount = articles.filter((item) => ["GA", "보험사"].includes(item.category)).length;
  if (ownNegative > 0) {
    return `당사 부정 ${ownNegative}건 확인. 사실관계와 확산 가능성을 우선 점검합니다.`;
  }
  if (ownMentions > 0 && caution > 0) {
    return `당사 언급 ${ownMentions}건. 직접 부정보다는 시장성·영업환경 이슈로 봅니다.`;
  }
  if (ownMentions > 0) {
    return `당사 언급 ${ownMentions}건. 보도 맥락과 당사 노출 방향을 확인합니다.`;
  }
  if (caution > 0) {
    return `주의 이슈 ${caution}건. 규제·수수료·GA 운영 흐름을 확인합니다.`;
  }
  return `당사 직접 리스크는 낮습니다. GA·보험사 동향 ${gaInsuranceCount}건을 추적합니다.`;
}

function buildIssues(articles, fallback) {
  const usableArticles = articles.filter(isUsableArticle);
  const important = buildDashboardIssueGroups(usableArticles)
    .filter((article) => article?.title)
    .filter(isMajorIssueCandidate)
    .sort((a, b) => dashboardIssueScore(b) - dashboardIssueScore(a) || articleTimeValue(b) - articleTimeValue(a));
  const uniqueIssues = [];
  const seenIssueKeys = new Set();
  for (const article of important) {
    const displayArticle = normalizeArticleDisplay(article);
    const issueKey = majorIssueDedupeKey(displayArticle);
    if (!issueKey || seenIssueKeys.has(issueKey)) continue;
    seenIssueKeys.add(issueKey);
    const relatedArticles = dedupeIssueMembers(Array.isArray(displayArticle.relatedArticles) && displayArticle.relatedArticles.length
      ? displayArticle.relatedArticles.map(normalizeArticleDisplay)
      : [displayArticle]);
    const summaryLines = Array.isArray(displayArticle.summaryLines) && displayArticle.summaryLines.length
      ? displayArticle.summaryLines
      : buildArticleSummaryLines(displayArticle);
    uniqueIssues.push({
      tone: displayArticle.tone,
      category: displayArticle.category,
      source: displayArticle.source,
      representativeSource: displayArticle.representativeSource || displayArticle.source,
      title: displayArticle.title,
      summary: displayArticle.issueSummary || summaryLines.join(" "),
      summaryLines: displayArticle.issueSummary ? [displayArticle.issueSummary] : summaryLines,
      publishedAt: displayArticle.time || displayArticle.date || "-",
      link: displayArticle.link,
      issueSummary: displayArticle.issueSummary || "",
      relatedArticles,
      relatedCount: Number(displayArticle.relatedCount || relatedArticles.length || 1),
      relatedSourceCount: Number(displayArticle.relatedSourceCount || unique(relatedArticles.map((item) => item.source).filter(Boolean)).length || 1),
      relatedSources: displayArticle.relatedSources,
    });
    if (uniqueIssues.length >= 5) break;
  }
  return uniqueIssues.length ? uniqueIssues : [];
}

function majorIssueDedupeKey(article = {}) {
  const eventTopic = articleEventTopicSignature(article);
  if (eventTopic) return `event:${eventTopic}`;
  const primaryTopic = articlePrimarySummaryTopic(article);
  if (primaryTopic) return `topic:${primaryTopic}:${normalizeIssueEntityKey(article)}`;
  const related = Array.isArray(article.relatedArticles) && article.relatedArticles.length ? article.relatedArticles : [article];
  const tokenSource = related.map((item) => item.title || "").join(" ");
  const tokens = articleTokens(tokenSource).filter(isDistinctiveRelatedToken).slice(0, 6);
  if (tokens.length >= 3) return `tokens:${tokens.join("|")}`;
  const titleKey = normalizeGroupTitle(article.title || "");
  return titleKey ? `title:${titleKey.slice(0, 80)}` : "";
}

function normalizeIssueEntityKey(article = {}) {
  const text = normalizeGroupTitle(`${article.title || ""} ${article.summary || ""} ${article.keyword || ""}`);
  if (text.includes(normalizeGroupTitle("인카금융"))) return "incar";
  if (text.includes(normalizeGroupTitle("삼성생명"))) return "samsung-life";
  if (text.includes(normalizeGroupTitle("DB손해보험")) || text.includes(normalizeGroupTitle("db손해보험"))) return "db-insurance";
  if (text.includes(normalizeGroupTitle("KB손해보험")) || text.includes(normalizeGroupTitle("kb손해보험"))) return "kb-insurance";
  return "";
}

function dashboardIssueScore(issue = {}) {
  const members = Array.isArray(issue.relatedArticles) && issue.relatedArticles.length ? issue.relatedArticles : [issue];
  const sponsorship = members.some(isOwnSponsoredSportsArticle) || ["브랜드/스폰서십", "스폰서십"].includes(issue.category);
  const groupToneScore = Math.max(...members.map((item) => ({ 부정: 420, 주의: 280, 긍정: 170, 중립: 90, 제외: 0 }[item.tone] || 0)));
  const toneScore = Math.max(groupToneScore, { 부정: 420, 주의: 280, 긍정: 170, 중립: 90, 제외: 0 }[issue.tone] || 0);
  const priorityScore = majorIssuePriorityScore(issue);
  const ownScore = !sponsorship && members.some(isOwnArticle) ? 520 : 0;
  const relatedScore = Math.min(Number(issue.relatedCount || 1), 6) * 24;
  return priorityScore + ownScore + toneScore + relatedScore + Number(issue.score || 0);
}

function isMajorIssueCandidate(issue = {}) {
  const members = (Array.isArray(issue.relatedArticles) && issue.relatedArticles.length ? issue.relatedArticles : [issue])
    .filter(isUsableArticle)
    .filter((member) => !isOfficialRegulatorSource(member.source) || isOwnArticle(member));
  if (!members.length) return false;
  if (members.every(isNonInsuranceFinancialRegulatoryArticle)) return false;
  return members.some(isOwnArticle)
    || members.some(isGaInsuranceMajorIssueArticle)
    || members.some(isInsurancePolicyMajorIssueArticle);
}

function majorIssuePriorityScore(issue = {}) {
  const members = Array.isArray(issue.relatedArticles) && issue.relatedArticles.length ? issue.relatedArticles : [issue];
  if (members.some(isOwnArticle)) return 900;
  if (members.some(isGaInsuranceMajorIssueArticle)) return 650;
  if (members.some(isInsurancePolicyMajorIssueArticle)) return 460;
  return 0;
}

function isGaInsuranceMajorIssueArticle(article = {}) {
  return ["GA", "보험사", "경쟁사", "업계동향"].includes(article.category) && hasMaterialInsuranceGaContext(article);
}

function isInsurancePolicyMajorIssueArticle(article = {}) {
  if (isNonInsuranceFinancialRegulatoryArticle(article)) return false;
  const text = sourceEvidenceHaystack(article);
  const category = String(article.category || "");
  const source = String(article.source || "");
  const hasPolicySignal = category === "정책/규제"
    || /정책|규제|금감원|금융감독원|금융위|금융위원회|감독|제재|검사|제도|법안|시행령/.test(`${category} ${source} ${text}`);
  return hasPolicySignal && hasMaterialInsuranceGaContext(article);
}

function buildMediaAnalysisIssues(articles = [], period = "monthly") {
  const scoped = articles
    .filter((article) => article?.title && article.tone !== "제외")
    .filter((article) => !isPortalSource(article.source));
  const grouped = buildRelatedArticleGroups(scoped);
  const issues = grouped
    .map((group) => normalizeMediaIssueGroup(group, period))
    .filter((issue) => issue.title)
    .sort((a, b) => mediaIssueScore(b, period) - mediaIssueScore(a, period) || articleTimeValue(b) - articleTimeValue(a));
  return selectBalancedMediaIssues(issues, period, 12);
}

function selectBalancedMediaIssues(issues = [], period = "monthly", limit = 12) {
  const selected = [];
  const seen = new Set();
  const addBucket = (predicate, quota) => {
    let count = 0;
    for (const issue of issues.filter(predicate)) {
      if (count >= quota || selected.length >= limit) break;
      if (addIssueIfFresh(selected, seen, issue)) count += 1;
    }
  };

  if (period === "daily") {
    addBucket((issue) => isOwnArticle(issue) && !isOwnSponsoredSportsArticle(issue), 3);
    addBucket((issue) => ["부정", "주의"].includes(issue.tone), 3);
    addBucket((issue) => issue.category === "정책/규제", 2);
    addBucket((issue) => ["GA", "보험사"].includes(issue.category), 2);
    addBucket(() => true, limit);
    return selected.slice(0, limit);
  }

  addBucket((issue) => isOwnArticle(issue) && !isOwnSponsoredSportsArticle(issue) && issue.tone === "긍정", 3);
  addBucket((issue) => isOwnArticle(issue) && !isOwnSponsoredSportsArticle(issue) && ["부정", "주의", "중립"].includes(issue.tone), 4);
  addBucket((issue) => issue.category === "정책/규제", 4);
  addBucket((issue) => ["GA", "보험사"].includes(issue.category), 4);
  addBucket((issue) => Number(issue.relatedCount || 1) >= 3, 3);
  addBucket(() => true, limit);
  return selected.slice(0, limit);
}

function addIssueIfFresh(selected, seen, issue) {
  const keys = [
    normalizeGroupTitle(issue.title || ""),
    issueSemanticKey(issue),
  ].filter(Boolean);
  if (!keys.length || keys.some((key) => seen.has(key))) return false;
  selected.push(issue);
  keys.forEach((key) => seen.add(key));
  return true;
}

function issueSemanticKey(issue = {}) {
  const topic = articlePrimarySummaryTopic(issue);
  const tokens = articleTokens(normalizeGroupTitle(issue.title || ""))
    .filter((token) => token.length >= 3)
    .slice(0, 5)
    .join("-");
  return [topic, issue.category, tokens].filter(Boolean).join(":").slice(0, 120);
}

function periodIssueMeta(period, issues = []) {
  const related = issues.reduce((sum, issue) => sum + Math.max(0, Number(issue.relatedCount || 1) - 1), 0);
  const label = period === "daily" ? "당일" : period === "weekly" ? "주간" : period === "monthly" ? "월간" : "선택 기간";
  return related ? `${label} 대표 ${issues.length}건 · 관련 ${related}건` : `${label} 대표 ${issues.length}건`;
}

function normalizeMediaIssueGroup(group = {}, period = "monthly") {
  const members = dedupeIssueMembers(Array.isArray(group.relatedArticles) && group.relatedArticles.length ? group.relatedArticles : [group]);
  const representative = [...members]
    .sort((a, b) => mediaIssueScore(b, period) - mediaIssueScore(a, period) || articleTimeValue(b) - articleTimeValue(a))[0] || group;
  const relatedSources = unique(members.map((item) => item.source).filter(Boolean));
  const sourceLabel = relatedSources.length > 1
    ? `${relatedSources[0]} 외 ${relatedSources.length - 1}곳`
    : representative.source;
  return {
    ...representative,
    source: sourceLabel || representative.source,
    representativeSource: representative.source,
    relatedArticles: members,
    relatedCount: members.length,
    relatedSourceCount: relatedSources.length,
    relatedSources,
    category: representative.category || group.category || "이슈",
    tone: representative.tone || group.tone || "중립",
    title: representative.title || group.title,
    summary: representative.issueSummary || compactArticleSummary(representative),
    summaryLines: representative.issueSummary ? [representative.issueSummary] : buildMediaIssueSummaryLines(representative, members),
    publishedAt: representative.time || representative.date || group.time || group.date || "-",
    link: representative.link || group.link,
    issueSummary: representative.issueSummary || "",
  };
}

function dedupeIssueMembers(members = []) {
  const map = new Map();
  members.forEach((article) => {
    const key = issueMemberKey(article);
    const previous = map.get(key);
    if (!previous || articleTimeValue(article) > articleTimeValue(previous) || reportFrontScore(article) > reportFrontScore(previous)) {
      map.set(key, article);
    }
  });
  return Array.from(map.values()).sort((a, b) => mediaIssueScore(b) - mediaIssueScore(a) || articleTimeValue(b) - articleTimeValue(a));
}

function issueMemberKey(article = {}) {
  const url = normalizeRiskUrl(article.link || article.url || "");
  if (url) return `url:${url}`;
  return `title:${article.date || ""}:${normalizeGroupTitle(article.title || "").slice(0, 90)}`;
}

function mediaIssueScore(item = {}, period = "monthly") {
  const relatedBoost = Math.min(Number(item.relatedCount || item.clusterSize || 1), 8) * (period === "daily" ? 10 : 18);
  const ownBoost = isOwnArticle(item) ? 420 : 0;
  const performanceBoost = isOwnPerformanceArticle(item) ? 360 : 0;
  const riskBoost = isOwnArticle(item) && ["부정", "주의"].includes(item.tone) ? 220 : 0;
  return reportFrontScore(item) + relatedBoost + ownBoost + performanceBoost + riskBoost;
}

function isOwnPerformanceArticle(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`;
  return isOwnArticle(item) && isOwnPerformanceSummaryText(text);
}

function articlePrimarySummaryTopic(item = {}) {
  const title = cleanSummaryText(item.title || "");
  const text = originalArticleHaystack(item);
  const own = isOwnArticle(item);
  const eventTopic = articleEventTopicSignature(item);

  if (isExternalInsuranceNoiseArticle(item)) return "";
  if (isGeneralFinanceNoiseArticle(item)) return "";
  if (isAdminAgencyNoiseArticle(item)) return "";
  if (isPublicHealthInsuranceNoiseArticle(item)) return "";
  if (isNonInsuranceInvestmentMisconductNoiseArticle(item)) return "";
  if (isAmbiguousCompetitorHomonymNoiseArticle(item)) return "";
  if (isSportsOccupationInsuranceAgentNoiseArticle(item)) return "";
  if (isStockMarketSectorNoiseArticle(item)) return "";
  if (isEntertainmentMarketingNoiseArticle(item)) return "";
  if (isCelebInsuranceAgentNoiseArticle(item)) return "";
  if (isPoliticalMediaDigestNoiseArticle(item)) return "";
  if (isCommunityEventAttendeeNoiseArticle(item)) return "";
  if (isSportsSponsorshipIncidentalNoiseArticle(item)) return "";
  if (isOverseasLocalInsuranceNoiseArticle(item)) return "";
  if (isForeignMacroInsuranceIncidentalNoiseArticle(item)) return "";
  if (isExternalGeopoliticalShippingNoiseArticle(item)) return "";
  if (eventTopic) return eventTopic;
  if (own && isOwnPerformanceSummaryText(title)) return "own-performance";
  if (isStockVolatilitySummaryText(title)) return "stock-volatility";
  if (isInsuranceSalesConductSummaryText(title)) return "sales-conduct";
  if (isOwnConsultingProfileSummaryText(title)) return "own-consulting";
  if (isStockDisclosureSummaryText(title)) return "stock-disclosure";
  if (isCompetitorProductPerformanceSummaryText(title)) return "product-performance";
  if (isBrandReputationSummaryText(title)) return "brand-reputation";
  if (isInvestmentSummaryText(title)) return "investment";
  if (isSettlementSupportSummaryText(title)) return "settlement-support";
  if (isInsuranceLossSummaryText(title)) return "insurance-loss";
  if (isPreventiveSecuritySummaryText(title)) return "security";

  if (own && isOwnPerformanceSummaryText(text)) return "own-performance";
  if (isStockVolatilitySummaryText(text)) return "stock-volatility";
  if (isInsuranceSalesConductSummaryText(text)) return "sales-conduct";
  if (isOwnConsultingProfileSummaryText(text)) return "own-consulting";
  if (isStockDisclosureSummaryText(text)) return "stock-disclosure";
  if (isCompetitorProductPerformanceSummaryText(text)) return "product-performance";
  if (isBrandReputationSummaryText(text)) return "brand-reputation";
  if (isInvestmentSummaryText(text)) return "investment";
  if (isSettlementSupportSummaryText(text)) return "settlement-support";
  if (isInsuranceLossSummaryText(text)) return "insurance-loss";
  if (isPreventiveSecuritySummaryText(text)) return "security";
  return "";
}

function articleEventTopicSignature(item = {}) {
  const text = cleanSummaryText(`${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`);
  if (isOwnSponsoredSportsArticle(item)) return "incar-theheaven-masters";
  const ownSanctionTopic = ownGaAgentSanctionEventTopic(item);
  if (ownSanctionTopic) return ownSanctionTopic;
  const gaCommissionTopic = gaCommissionRuleEventTopic(text);
  if (gaCommissionTopic) return gaCommissionTopic;
  const insuranceFraudTopic = insuranceFraudEventTopic(text);
  if (insuranceFraudTopic) return insuranceFraudTopic;
  return "";
}

function gaCommissionRuleEventTopic(value = "") {
  const text = cleanSummaryText(value);
  const hasRuleSignal = /1200\s*%|1200\s*룰|1200\s*퍼센트|초년도\s*수수료|판매수수료|보험\s*판매수수료|수수료\s*(?:등급|순위|공개|공시|규제|개편|지급\s*한도|한도)/i.test(text);
  const hasGaSalesSignal = /GA|법인보험대리점|보험대리점|보험\s*대리점|보험설계사|설계사|보험\s*영업|보험업계|판매채널|모집채널/i.test(text);
  const hasPolicySignal = /시행|적용|의무화|공개|공시|등급|순위|다음달|내일부터|D-?\s*1|앞두고|제도|개편|금감원|금융감독원|금융위|금융위원회|금융당국/i.test(text);
  return hasRuleSignal && hasGaSalesSignal && hasPolicySignal ? "ga-1200-commission-rule" : "";
}

function ownGaAgentSanctionEventTopic(item = {}) {
  const text = originalArticleHaystack(item);
  const hasOwn = /인카금융(?:서비스)?|인카금융/.test(text);
  const hasGa = /GA|법인보험대리점|보험대리점|공룡\s*GA|대형\s*GA/.test(text);
  const hasAgent = /전직\s*설계사|보험설계사|설계사/.test(text);
  const hasSanction = /등록\s*취소|업무\s*정지|제재|처분|무더기\s*제재|금감원|금융감독원/.test(text);
  const hasFraud = /보험사기|고의\s*교통사고|보험금\s*편취|허위\s*입원|허위\s*진료|내부통제|관리\s*구멍/.test(text);
  if (hasOwn && hasGa && hasAgent && hasSanction && hasFraud) return "own-ga-agent-fraud-sanction";
  if (hasGa && hasAgent && hasSanction && hasFraud && /글로벌금융판매|메가|영진에셋|대형\s*GA/.test(text)) return "ga-agent-fraud-sanction";
  return "";
}

function insuranceFraudEventTopic(value = "") {
  const text = cleanSummaryText(value);
  const hasFraudSignal = /보험사기|고의\s*교통사고|진료비\s*조작|허위\s*진료|보험금\s*편취|사기\s*근절|사전예방|집중\s*홍보|신고\s*포상금/.test(text);
  const hasRegulatorSignal = /금감원|금융감독원|금융위|금융위원회|경찰청|수사|형사처벌|적발|대국민\s*교육|집중\s*홍보/.test(text);
  const hasInsuranceSignal = /보험|손해율|자동차보험|보험금|보험업계|손보|생보/.test(text);
  if (!hasFraudSignal || !hasRegulatorSignal || !hasInsuranceSignal) return "";
  if (/챗gpt|chatgpt|생성형\s*ai|ai\s*보험사기|진료비\s*조작|허위\s*진료|보험금\s*편취|의료비/.test(text)) {
    return "insurance-fraud-ai-medical-claim";
  }
  if (/요양병원|복지부|건강보험|건보|조직화|적발\s*한계|단절/.test(text)) {
    return "insurance-fraud-hospital-claims";
  }
  if (/고의\s*교통사고|교통사고|자동차보험|차\s*보험사기|신고\s*포상금|포상금\s*최대|대국민\s*교육|집중\s*홍보|사전예방/.test(text)) {
    return "insurance-fraud-traffic-prevention-campaign";
  }
  return "insurance-fraud-regulatory-general";
}

function isOwnPerformanceSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /우수인증|인증설계사|최다|배출|수상|성과|선정|1위|성장|매출|협약|CSR|사회공헌/.test(text);
}

function isInvestmentSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /투자의견|목표주가|목표가|증권가|리포트|주가/.test(text) && /하향|낮아|조정|중립|매도|약세|급락|하락/.test(text);
}

function isSettlementSupportSummaryText(value = "") {
  const text = cleanSummaryText(value);
  if (isInsuranceSalesConductSummaryText(text)) return false;
  return /정착지원금|1200%|수수료/.test(text) && /GA|보험대리점|설계사|공시/.test(text);
}

function isInsuranceSalesConductSummaryText(value = "") {
  const text = cleanSummaryText(value);
  const hasSalesRisk = /불완전판매|소비자 피해|소비자보호|생보협회|손보협회|설계사 쟁탈전|쟁탈전|판매채널|보험업계 긴장|해소가 관건/.test(text);
  const hasProductSalesRisk = /종신보험/.test(text) && /불완전판매|판매\s*관행|판매채널|해소가 관건|소비자\s*피해/.test(text);
  return (hasSalesRisk || hasProductSalesRisk)
    && /GA|보험|설계사|생보|손보|협회|대리점/.test(text);
}

function isStockVolatilitySummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /VI 발동|변동성완화장치|주가 급등|주가 급락|\+\d+(?:\.\d+)?%|-\d+(?:\.\d+)?%/.test(text)
    && /인카금융|주가|조선비즈|Chosunbiz|증시|코스닥/.test(text);
}

function isOwnConsultingProfileSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /Having사업단|이화정|맞춤형 온라인 금융 컨설팅|온라인 금융 컨설팅|노후/.test(text)
    && /인카금융|금융 컨설팅|사업단/.test(text);
}

function isStockDisclosureSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /주식시장 주요공시|주요공시|자사주|현금배당|중간배당|공시/.test(text)
    && /인카금융|주식시장|공시|자사주|배당/.test(text);
}

function isCompetitorProductPerformanceSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /누적 가입|가입\s*\d|돌파|특약|출시|판매/.test(text)
    && /DB손해보험|KB손해보험|삼성화재|현대해상|한화생명|교보생명|보험/.test(text);
}

function isBrandReputationSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /브랜드평판|평판 판도|소비자 평판|브랜드 경쟁/.test(text)
    && /보험|손해보험|생명보험|금융/.test(text);
}

function isCompetitorBrandReputationAgainstOwn(item = {}) {
  const text = summaryHaystack(item);
  if (!/브랜드평판|평판\s*랭킹|평판\s*순위/.test(text)) return false;
  if (!/인카금융/.test(text)) return false;
  const competitorNames = "한화생명금융서비스|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋";
  const competitorFirst = new RegExp(`(?:(${competitorNames})[^.。!?]{0,45}(?:1위|선두|탈환)|(?:1위|선두|탈환)[^.。!?]{0,45}(${competitorNames}))`, "i").test(text);
  if (/인카금융(?:서비스)?[^.。!?]{0,35}(?:1위|선두|최고|최상위)/.test(text) && !competitorFirst) return false;
  const ownFollow = /(?:인카금융(?:서비스)?[^.。!?]{0,45}(?:2위|뒤이어|초박빙|추격)|(?:2위|뒤이어|초박빙|추격)[^.。!?]{0,45}인카금융(?:서비스)?)/.test(text);
  return competitorFirst && (ownFollow || /인카금융/.test(text));
}

function brandReputationLeaderName(item = {}) {
  const text = summaryHaystack(item);
  const match = text.match(/(한화생명금융서비스|인카금융서비스|인카금융|에이플러스에셋|피플라이프|지에이코리아|글로벌금융판매|메가금융서비스|리치앤코|한국보험금융|프라임에셋)[^.。!?]{0,35}(?:1위|선두|탈환)/i);
  return match?.[1] || "";
}

function buildBrandReputationDisplayLines(item = {}) {
  const text = summaryHaystack(item);
  const leader = brandReputationLeaderName(item);
  const isGa = /GA|보험대리점|독립\s*보험대리점/.test(text);
  if (isCompetitorBrandReputationAgainstOwn(item)) {
    return [
      `${leader || "경쟁사"}가 ${isGa ? "GA" : "보험"} 브랜드평판 1위로 소개되고, 인카금융서비스는 후순위 경쟁사로 언급됐습니다.`,
      "인카 중심 성과 보도가 아니라 브랜드평판 순위 변화와 경쟁사 노출 흐름을 확인할 기사입니다.",
    ];
  }
  if (leader && !/인카금융/.test(leader)) {
    return [
      `${leader}가 ${isGa ? "GA" : "보험"} 브랜드평판 1위로 소개된 경쟁사 평판 보도입니다.`,
      "직접 리스크보다 경쟁사 브랜드 노출과 평판 추이를 관찰하는 자료입니다.",
    ];
  }
  if (/인카금융/.test(leader)) {
    return ["인카금융서비스가 브랜드평판 상위권으로 소개된 당사 평판 보도입니다."];
  }
  return [`${isGa ? "GA" : "보험"} 브랜드평판 순위 변화와 소비자 인식 흐름을 다룬 기사입니다.`];
}

function isInsuranceLossSummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /실손|손해율|적자폭|보험 민원|민원/.test(text) && /보험|손보|생보|계약/.test(text);
}

function isPreventiveSecuritySummaryText(value = "") {
  const text = cleanSummaryText(value);
  return /금융보안원/.test(text) && /가입|확대|예방|보안/.test(text) && /해킹|보안|침해|취약점/.test(text);
}

function summaryLineMatchesTopic(line = "", topic = "") {
  if (!topic) return true;
  const lineTopic = summarySemanticTopicKey(line);
  return !lineTopic || lineTopic === topic;
}

function buildMediaIssueSummaryLines(representative = {}, members = []) {
  const titleKeys = new Set(members.map((article) => normalizeRiskSummaryKey(article.title)).filter(Boolean));
  const representativeTopic = articlePrimarySummaryTopic(representative);
  const candidates = [];
  [...members].sort((a, b) => mediaIssueScore(b) - mediaIssueScore(a) || articleTimeValue(b) - articleTimeValue(a)).forEach((article) => {
    buildArticleSummaryLines(article).forEach((line) => candidates.push(line));
  });
  const seen = new Set();
  return candidates.filter((line) => {
    const key = normalizeRiskSummaryKey(line);
    if (!key || titleKeys.has(key)) return false;
    if (representativeTopic && !summaryLineMatchesTopic(line, representativeTopic)) return false;
    if (isDuplicateRiskSummaryKey(key, seen)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function buildArticleSummaryLines(item = {}) {
  if (isExternalInsuranceNoiseArticle(item)) return [];
  if (isGeneralFinanceNoiseArticle(item)) return [];
  if (isAdminAgencyNoiseArticle(item)) return [];
  if (isPublicHealthInsuranceNoiseArticle(item)) return [];
  if (isNonInsuranceInvestmentMisconductNoiseArticle(item)) return [];
  if (isAmbiguousCompetitorHomonymNoiseArticle(item)) return [];
  if (isSportsOccupationInsuranceAgentNoiseArticle(item)) return [];
  if (isStockMarketSectorNoiseArticle(item)) return [];
  if (isEntertainmentMarketingNoiseArticle(item)) return [];
  if (isCelebInsuranceAgentNoiseArticle(item)) return [];
  if (isPoliticalMediaDigestNoiseArticle(item)) return [];
  if (isCommunityEventAttendeeNoiseArticle(item)) return [];
  if (isSportsSponsorshipIncidentalNoiseArticle(item)) return [];
  if (isOverseasLocalInsuranceNoiseArticle(item)) return [];
  if (isForeignMacroInsuranceIncidentalNoiseArticle(item)) return [];
  if (isExternalGeopoliticalShippingNoiseArticle(item)) return [];
  const titleKeys = summaryTitleKeys(item);
  const cleanTitle = cleanSummaryText(item.title || "");
  const text = cleanSummaryText(originalArticleDescription(item) || item.summary || item.description || "");
  const sentences = splitSummarySentences(text)
    .map(normalizeSummaryLine)
    .filter((sentence) => sentence && sentence !== cleanTitle && !isGenericSummaryLine(sentence) && !isBrokenSummaryLine(sentence) && !isSummaryDuplicateOfTitle(sentence, titleKeys));
  const bodySentences = sentences.filter((line) => isHighSignalSummaryLine(line, item, titleKeys));
  const lines = dedupeSummaryLines(removeUnsupportedOwnReferences(item, bodySentences.filter(Boolean)), titleKeys)
    .slice(0, 3);
  if (lines.length) return lines;
  return [];
}

function buildVisibleArticleSummaryLines(item = {}) {
  return buildArticleSummaryLines(item)
    .filter((line) => isHighSignalSummaryLine(line, item, summaryTitleKeys(item)))
    .slice(0, 3);
}

function summaryTitleKeys(item = {}) {
  const titles = [
    item.title,
    ...(Array.isArray(item.relatedArticles) ? item.relatedArticles.map((article) => article.title) : []),
  ];
  return new Set(titles.map(normalizeSummaryCompareKey).filter(Boolean));
}

function dedupeSummaryLines(lines = [], titleKeys = new Set()) {
  const seen = new Set();
  const seenTopics = new Set();
  const accepted = [];
  return lines
    .map(normalizeSummaryLine)
    .filter(Boolean)
    .filter((line) => !isGenericSummaryLine(line) && !isBrokenSummaryLine(line) && !isSummaryDuplicateOfTitle(line, titleKeys))
    .filter((line) => {
      const key = normalizeSummaryCompareKey(line);
      if (!key || isDuplicateRiskSummaryKey(key, seen)) return false;
      const topicKey = summarySemanticTopicKey(line);
      if (topicKey && seenTopics.has(topicKey)) return false;
      if (isNearDuplicateSummaryLine(line, accepted)) return false;
      seen.add(key);
      if (topicKey) seenTopics.add(topicKey);
      accepted.push(line);
      return true;
    });
}

function isSummaryDuplicateOfTitle(line = "", titleKeys = new Set()) {
  const key = normalizeSummaryCompareKey(line);
  if (!key) return true;
  for (const titleKey of titleKeys) {
    if (!titleKey) continue;
    if (key === titleKey) return true;
    if (key.length >= 16 && titleKey.length >= 16 && (key.includes(titleKey) || titleKey.includes(key))) return true;
    const minLength = Math.min(key.length, titleKey.length);
    if (minLength >= 18 && commonPrefixLength(key, titleKey) >= Math.min(42, Math.floor(minLength * 0.82))) return true;
  }
  return false;
}

function normalizeSummaryCompareKey(value = "") {
  return cleanSummaryText(value)
    .toLowerCase()
    .replace(/\s*[-–—]\s*[\p{L}\p{N}._·\s]{2,30}$/u, "")
    .replace(/(?:\.com|\.co\.kr|\.kr)$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 130);
}

function summarySemanticTopicKey(value = "") {
  const text = cleanSummaryText(value);
  if (!text) return "";
  if (/제목과 본문 근거|세부 내용을 확인|핵심 내용을 확인/.test(text)) return "generic-fallback";
  if (/인카금융/.test(text) && /더\s*헤븐|더헤븐|마스터즈|KLPGA|골프/.test(text)) return "incar-theheaven-masters";
  if (/우수인증|인증설계사|최다|배출/.test(text) && /인카금융|당사|GA업계/.test(text)) return "own-performance";
  if (/VI 발동|변동성완화장치|주가 급등|주가 급락/.test(text)) return "stock-volatility";
  if (/1200%|불완전판매|소비자 피해|소비자보호|생보협회|손보협회|종신보험|판매채널/.test(text)) return "sales-conduct";
  if (/Having사업단|맞춤형 온라인 금융 컨설팅|이화정|노후/.test(text)) return "own-consulting";
  if (/주식시장 주요공시|주요공시|자사주|현금배당|중간배당/.test(text)) return "stock-disclosure";
  if (/누적 가입|특약|출시|돌파/.test(text) && /보험/.test(text)) return "product-performance";
  if (/브랜드평판|평판 판도|브랜드 경쟁/.test(text)) return "brand-reputation";
  if (/정착지원금|수수료|지급 규모|순위|공시/.test(text) && /GA|보험대리점|설계사/.test(text)) return "settlement-support";
  if (/GA 리포트|리포트성|조직 현황|운영 지표/.test(text)) return "ga-report";
  if (/투자의견|목표가|목표주가|주가|시장 평가|증권가/.test(text)) return "investment";
  if (/금융보안원|해킹|보안|피해 예방/.test(text)) return "security";
  if (/실손|손해율|적자폭|보험 민원|민원/.test(text)) return "insurance-loss";
  if (/보험사기|진단서|데이터 대응/.test(text)) return "insurance-fraud";
  if (/실손24|팩스 청구|종이 서류|전산화/.test(text)) return "claim-digital";
  if (/금융취약계층|사회공헌|포용금융|ESG|소비자보호/.test(text)) return "csr-consumer";
  return "";
}

function isNearDuplicateSummaryLine(line = "", accepted = []) {
  const tokens = summaryDedupTokens(line);
  if (tokens.size < 3) return false;
  return accepted.some((previous) => {
    const previousTokens = summaryDedupTokens(previous);
    if (previousTokens.size < 3) return false;
    const overlap = tokenOverlapRatio(tokens, previousTokens);
    if (overlap >= 0.62) return true;
    return overlap >= 0.48 && sharedLongToken(Array.from(tokens), Array.from(previousTokens));
  });
}

function summaryDedupTokens(value = "") {
  return new Set(articleTokens(cleanSummaryText(value)).filter(isSummaryMeaningfulToken));
}

function isSummaryMeaningfulToken(token = "") {
  return token.length >= 2 && !/기사|보도|내용|확인|기준|관련|이슈|자료|중심|비교|흐름|문맥|분류|근거/.test(token);
}

function commonPrefixLength(a = "", b = "") {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function compactArticleSummary(item = {}) {
  return buildArticleSummaryLines(item).join(" ");
}

function cleanSummaryText(value) {
  return String(value || "")
    .replace(/&nbsp;|&amp;nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\[[^\]]+\s+[^\]]*(?:기자|reporter)\]\s*/i, "")
    .replace(/^[^\s]+ (?:기자|reporter)\s*=\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/(\.\.\.|…)+$/g, "")
    .trim();
}

function splitSummarySentences(value) {
  const clean = cleanSummaryText(value);
  if (!clean) return [];
  const normalized = clean
    .replace(/([.!?。])\s+/g, "$1|")
    .replace(/(습니다|했습니다|합니다|됩니다|됐습니다|있습니다|없습니다|다|요|임|함|됨)\s+/g, "$1.|");
  return normalized
    .split("|")
    .map((sentence) => sentence.replace(/(\.\.\.|…)+$/g, "").trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 6);
}

function isGenericSummaryLine(value) {
  const text = cleanSummaryText(value);
  return (
    isClassifierTemplateSummaryLine(text) ||
    /키워드 기준으로 수집된 기사입니다/.test(text) ||
    /키워드로 수집됐습니다/.test(text) ||
    /기준 핵심만 요약했습니다/.test(text) ||
    /당사 직접 언급 기사/.test(text) ||
    /보고서와 리스크 점검 근거/.test(text) ||
    /정책·규제 변화가 영업 환경/.test(text) ||
    /직접 부정은 아니지만 시장 평가/.test(text) ||
    /시장 평가, 투자 의견, 규제성 신호/.test(text) ||
    /보험사·GA 시장 흐름/.test(text) ||
    /업계 동향 기사로 분리/.test(text) ||
    /제목과 본문 근거를 기준으로/.test(text) ||
    /세부 내용을 확인할 필요가 있습니다/.test(text) ||
    /핵심 내용을 확인합니다/.test(text) ||
    /분석 대상에서 제외한 노이즈성 기사/.test(text) ||
    /홍보 활용 가능성을 검토/.test(text) ||
    /소비자 피해, 제재, 사칭, 법적 분쟁/.test(text) ||
    isLowValueAnalysisLine(text)
  );
}

function isLowValueAnalysisLine(value = "") {
  const text = cleanSummaryText(value).replace(/[.。!?]+$/g, "").trim();
  if (!text) return true;
  return (
    isClassifierTemplateSummaryLine(text) ||
    /모니터링 후보/.test(text) ||
    /원문 근거와 키워드 문맥/.test(text) ||
    /원문 근거.*확인/.test(text) ||
    /정책[·\/]규제 흐름/.test(text) ||
    /영업 영향 여부/.test(text) ||
    /별도 확인/.test(text) ||
    /별도 추적/.test(text) ||
    /별도\s*분류/.test(text) ||
    /부정\s*리스크/.test(text) ||
    /브랜드\s*노출/.test(text) ||
    /스폰서십\s*성과/.test(text) ||
    /성과\s*트랙/.test(text) ||
    /리스크\s*기사/.test(text) ||
    /분리.*(?:보존|분류)/.test(text) ||
    /분리해.*봅니다/.test(text) ||
    /확인합니다$/.test(text) ||
    /확인해야 합니다$/.test(text) ||
    /필요성을 다룬 기사/.test(text) ||
    /흐름을 다룬 기사/.test(text) ||
    /내용을 다룬 기사/.test(text) ||
    /자료로 봅니다/.test(text) ||
    /기사입니다$/.test(text) ||
    /보도입니다$/.test(text)
  );
}

function isClassifierTemplateSummaryLine(value = "") {
  const text = cleanSummaryText(value);
  return (
    /경쟁 보험사의 특약이 출시 이후 누적 가입 성과/.test(text) ||
    /상품 경쟁력과 보장 수요 흐름/.test(text) ||
    /1200%룰 시행을 앞두고 설계사 영입 경쟁/.test(text) ||
    /판매수수료 운영 부담이 함께 거론/.test(text) ||
    /소비자 피해, 불완전판매, 종신보험 판매 관행/.test(text) ||
    /판매채널 관리 리스크를 확인/.test(text) ||
    /당사 직접 리스크보다 경쟁사 브랜드 노출/.test(text) ||
    /보험\/GA\/설계사\/감독 문맥 중심/.test(text)
  );
}

function isHighSignalSummaryLine(line = "", item = {}, titleKeys = new Set()) {
  const text = cleanSummaryText(line).replace(/[.。!?]+$/g, "").trim();
  if (!text || isGenericSummaryLine(text) || isBrokenSummaryLine(text) || isSummaryDuplicateOfTitle(text, titleKeys)) return false;
  if (text.length < 18 || text.length > 145) return false;
  if (!/[가-힣]/.test(text)) return false;
  if (!/(다|요|음|됨|함|예정|가능성|전망|방침|계획|기록|제재|발표|확대|상향|하락|상승|마무리)$/.test(text)) return false;
  const rawSource = cleanSummaryText(originalArticleDescription(item) || item.description || item.summary || "");
  const compare = normalizeSummaryCompareKey(text);
  const fromOriginal = compare && normalizeSummaryCompareKey(rawSource).includes(compare.slice(0, Math.min(compare.length, 55)));
  const hasConcreteSignal = /\d|%|원|명|건|억원|조원|분기|상반기|하반기|제재|해킹|수수료|민원|보험사기|불완전판매|정착지원금|브랜드평판|우수인증|공시/.test(text);
  return fromOriginal || hasConcreteSignal;
}

function normalizeSummaryLine(value) {
  const text = cleanSummaryText(value).replace(/[.。!?]+$/g, "").trim();
  if (!text || isGenericSummaryLine(text) || isBrokenSummaryLine(text)) return "";
  return `${text}.`;
}

function isBrokenSummaryLine(value) {
  const text = cleanSummaryText(value).replace(/[.。!?]+$/g, "").trim();
  if (!text) return true;
  if (text.length > 150) return true;
  return /(대폭|위해|통해|으로|로|및|또한|이어|했고|하며|밝혀|설명|전했|강조)$/.test(text);
}

function headlineBasedSummary(item = {}) {
  const title = cleanSummaryText(item.title || "");
  if (!title || isGenericSummaryLine(title)) return "";
  const topic = articlePrimarySummaryTopic(item);
  const text = summaryHaystack(item);
  if (topic === "own-performance") {
    return /2,?262|2262/.test(text)
      ? "인카금융서비스가 우수인증설계사 2,262명 배출로 GA업계 최다 기록을 알린 성과성 보도입니다."
      : "인카금융서비스의 우수인증설계사 배출 성과를 다룬 당사 성과성 보도입니다.";
  }
  if (topic === "security") {
    return "보도 초점은 해킹 사고 발생이 아니라 금융보안원 가입 확대와 보안 예방 체계 강화입니다.";
  }
  if (topic === "stock-volatility") {
    return "인카금융서비스 주가가 장중 변동성완화장치 발동 기준에 닿은 단기 주가 변동성 기사입니다.";
  }
  if (topic === "sales-conduct") {
    return "1200%룰 시행을 앞두고 설계사 영입 경쟁, 불완전판매, 소비자 피해 가능성이 함께 거론된 판매채널 규제 이슈입니다.";
  }
  if (topic === "own-consulting") {
    return "인카금융서비스 Having사업단의 맞춤형 온라인 금융 컨설팅 사례를 소개한 사업단 인터뷰성 보도입니다.";
  }
  if (topic === "stock-disclosure") {
    return "인카금융서비스의 자사주·배당 등 공시성 항목이 주식시장 주요공시 목록에 포함된 기사입니다.";
  }
  if (topic === "product-performance") {
    return "경쟁 보험사의 특약 출시 이후 누적 가입 성과와 상품 반응을 다룬 보도입니다.";
  }
  if (topic === "brand-reputation") {
    return buildBrandReputationDisplayLines(item)[0] || "보험·GA 브랜드평판 순위 변화를 통해 소비자 인식과 브랜드 경쟁 흐름을 다룬 기사입니다.";
  }
  if (topic === "investment") {
    return "투자의견, 목표가, 주가 흐름처럼 시장 평가 변화가 핵심입니다.";
  }
  if (topic === "settlement-support") {
    return "GA 정착지원금 공시에서 지급 규모와 순위가 비교된 내용입니다.";
  }
  if (topic === "insurance-loss") {
    return "실손보험 손해율과 적자 흐름을 다룬 보험업계 지표 기사입니다.";
  }
  return title;
}

function buildContextualSummaryLines(item = {}) {
  const lines = [];
  const text = summaryHaystack(item);
  const topic = articlePrimarySummaryTopic(item);
  if (topic === "own-performance") {
    lines.push(/2,?262|2262/.test(text)
      ? "인카금융서비스가 우수인증설계사 2,262명을 배출해 GA업계 최다 기록을 낸 성과성 기사입니다."
      : "인카금융서비스의 우수인증설계사 배출 성과를 다룬 당사 성과성 기사입니다.");
  } else if (topic === "security") {
    if (isOwnArticle(item)) {
      lines.push("인카금융서비스가 포함된 GA의 금융보안원 가입 확대 내용입니다.");
    }
    lines.push("핵심은 해킹 사고 보도가 아니라 보안 점검과 피해 예방 체계 확대입니다.");
  } else if (topic === "stock-volatility") {
    lines.push("인카금융서비스 주가가 장중 급등해 변동성완화장치가 발동된 단기 시장 신호입니다.");
    lines.push("직접 경영 이슈보다 거래량과 주가 변동성 관찰이 필요한 주가성 기사입니다.");
  } else if (topic === "sales-conduct") {
    lines.push("1200%룰 시행을 앞두고 설계사 영입 경쟁과 판매수수료 운영 부담이 함께 거론됐습니다.");
    lines.push("소비자 피해, 불완전판매, 종신보험 판매 관행처럼 판매채널 관리 리스크를 확인해야 하는 기사입니다.");
  } else if (topic === "own-consulting") {
    lines.push("인카금융서비스 Having사업단의 맞춤형 온라인 금융 컨설팅 사례를 소개한 인터뷰성 보도입니다.");
    lines.push("보장성 보험을 노후 준비와 연결한 영업·컨설팅 메시지가 중심입니다.");
  } else if (topic === "stock-disclosure") {
    lines.push("인카금융서비스의 자사주, 배당 등 공시성 항목이 주식시장 주요공시 목록에 포함됐습니다.");
    lines.push("주가 판단용으로는 공시 내용과 기준일, 규모를 별도 확인해야 하는 기사입니다.");
  } else if (topic === "product-performance") {
    lines.push("경쟁 보험사의 특약이 출시 이후 누적 가입 성과를 기록한 상품 반응 기사입니다.");
    lines.push("상품 경쟁력과 보장 수요 흐름을 확인할 수 있는 경쟁사 동향으로 봅니다.");
  } else if (topic === "brand-reputation") {
    lines.push(...buildBrandReputationDisplayLines(item));
  } else if (topic === "investment") {
    lines.push("증권가 투자의견이나 목표가 조정 등 시장 평가 변화가 기사 핵심입니다.");
  } else if (topic === "settlement-support") {
    lines.push("GA별 정착지원금 지급 규모와 순위를 비교한 공시성 기사입니다.");
  } else if (topic === "insurance-loss") {
    lines.push("실손보험 계약, 손해율, 적자폭 변화가 중심인 보험업계 지표 기사입니다.");
  }
  if (/한눈에보는GA리포트|GA리포트/i.test(text)) {
    if (isOwnArticle(item)) {
      lines.push("인카금융서비스의 GA 리포트성 보도로, 조직 현황과 운영 지표 확인에 쓰이는 자료성 기사입니다.");
    } else {
      lines.push("GA 리포트성 보도로, 해당 대리점의 조직 현황과 운영 지표를 확인할 수 있는 자료성 기사입니다.");
    }
  }
  if (/실손24|팩스\s*청구|종이\s*서류|전산화/i.test(text)) {
    lines.push("실손24 전산화 이후에도 팩스 청구가 병행되는 현장 불편과 제도 안착 과제를 다룬 기사입니다.");
  }
  if (/금융취약계층|사회공헌|포용금융|금융안심지원/i.test(text)) {
    lines.push("금융취약계층 보호와 사회공헌 활동을 다룬 경쟁사 ESG·소비자보호 보도입니다.");
  }
  return unique(lines.map(normalizeSummaryLine).filter(Boolean));
}

function buildLastResortSummaryLines(item = {}, titleKeys = new Set()) {
  const text = summaryHaystack(item);
  const line = normalizeSummaryLine(composeHeadlineSummary(item));
  return dedupeSummaryLines(removeUnsupportedOwnReferences(item, [line, headlineBasedSummary(item), text]), titleKeys).slice(0, 1);
}

function composeHeadlineSummary(item = {}) {
  const title = cleanSummaryText(item.title || "");
  const source = cleanSummaryText(item.source || "");
  const stripped = title
    .replace(/\s*-\s*[^-]{2,24}(?:\.com|\.co\.kr|\.kr)?$/i, "")
    .replace(/\s*-\s*(?:Chosunbiz|조선비즈|한국공공정책신문|뉴스|신문|일보)$/i, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  if (/^(포토|영상|인사|부고)\b/.test(stripped)) return `${source || "해당 매체"}의 단신성 기사로, 본문 근거 확인 후 모니터링 우선순위를 낮춰 봅니다.`;
  if (stripped.length <= 38) return `${stripped} 내용을 다룬 기사입니다.`;
  const compact = stripped
    .replace(/…/g, " ")
    .split(/[.!?。]/)[0]
    .slice(0, 72)
    .trim();
  return `${compact} 내용을 다룬 기사입니다.`;
}

function summaryHaystack(item = {}) {
  return cleanSummaryText(`${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`);
}

function originalArticleDescription(item = {}) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  return cleanSummaryText(item.description || raw.description || raw.summary || raw.content || raw.body || "");
}

function originalArticleHaystack(item = {}) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  return cleanSummaryText([
    item.title,
    item.summary,
    item.description,
    raw.title,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
    item.keyword,
    item.source,
  ].filter(Boolean).join(" "));
}

function sourceEvidenceHaystack(item = {}) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const summary = cleanSummaryText(item.summary || "");
  const usableSummary = summary && !isLowValueAnalysisLine(summary) && !isGenericSummaryLine(summary)
    ? summary
    : "";
  const originalDetail = [
    item.description,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
  ].filter(Boolean).join(" ");
  const fallbackSummary = originalDetail ? "" : usableSummary;
  return cleanSummaryText([
    item.title,
    item.description,
    raw.title,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
    fallbackSummary,
    item.source,
  ].filter(Boolean).join(" "));
}

function isExternalInsuranceNoiseArticle(item = {}) {
  const text = originalArticleHaystack(item);
  const hasExternalShippingSignal = /호르무즈|이란|통항|선박|해운|유조선|해협|중동|원유|해상 통항|해상|항만|항구|화물|물류|운임|항공|항로/.test(text);
  const hasInsuranceFeeSignal = /보험\s*수수료|보험증권|보험\s*증권|통항\s*수수료|수수료\s*부과|보험료|보험사|보험\s*가입\s*의무|유료\s*보험|보험\s*의무화|통항료|보험\s*제공|보험\s*업계/.test(text);
  const hasInsuranceBusinessSignal = /보험대리점|법인보험대리점|보험설계사|GA|인카금융|금융감독원|금감원|금융위원회|금융위|보험업법|불완전판매|보험사기|실손|손해율|보험금\s*지급|보험계약|정착지원금|1200%/.test(text);
  return hasExternalShippingSignal && hasInsuranceFeeSignal && !hasInsuranceBusinessSignal;
}

function isOwnSponsoredSportsArticle(item = {}) {
  const text = originalArticleHaystack(item);
  const hasOwnTournament = /인카금융(?:서비스)?\s*더\s*헤븐|인카금융(?:서비스)?\s*더헤븐|인카금융(?:서비스)?[^.。!?]{0,35}마스터즈|더헤븐CC|인카금융(?:서비스)?[^.。!?]{0,35}슈퍼볼링|슈퍼볼링[^.。!?]{0,35}인카금융/.test(text);
  const hasHostedContext = /인카금융서비스|인카금융/.test(text)
    && /KLPGA|골프|마스터즈|더헤븐|더\s*헤븐|슈퍼볼링|볼링|대회|라운드|티샷|버디|이글|스윙|언더파|타수|선수|프로암|갤러리|관람|협찬사/.test(text);
  return hasOwnTournament || hasHostedContext;
}

function isOwnSponsoredSportsBrandArticle(item = {}) {
  const text = originalArticleHaystack(item);
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const title = cleanSummaryText([item.title, raw.title].filter(Boolean).join(" "));
  return /기부|확정형\s*기부|사회공헌|브랜드|협약|후원|스폰서|주최|홍보|마케팅|ESG|파트너십/.test(title)
    || /기부|확정형\s*기부|사회공헌|ESG|브랜드\s*홍보|스포츠마케팅|파트너십/.test(text);
}

function isOwnSponsoredSportsNoiseArticle(item = {}) {
  return false;
}

function isOwnSponsoredSportsPreviewNoiseArticle(item = {}) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw : {};
  const title = cleanSummaryText([item.title, raw.title].filter(Boolean).join(" "));
  const text = originalArticleHaystack(item);
  const hasOwnTournament = /인카금융서비스|인카금융|인카금융(?:서비스)?\s*더\s*헤븐|인카금융(?:서비스)?\s*더헤븐|더헤븐CC/.test(text);
  if (!hasOwnTournament) return false;
  if (/인카금융|인카금융서비스/.test(title) && /후원|스폰서|주최|브랜드|마케팅|기부|사회공헌|ESG/.test(title)) return false;
  const hasSportsPreviewTitle = /KLPGA|골프|우승\s*후보|개막|디펜딩\s*챔피언|방어|노승희|안송이|400경기|금자탑|기념보드|꽃다발|선수|티샷|포토|청사진|액티브Shot|인생이야기|별들의\s*격돌|주차|셔틀|날씨|관람\s*정보|갤러리|프로암|이모저모|러프|웃음꽃|하루틴|팬심|협찬사|일상\s*침투|PREVIEW|프리뷰|3승\s*사냥|사냥|더헤븐리조트|커뮤니티\s*시설|샬롬\s*뷰|품격\s*높인다/.test(title);
  if (hasSportsPreviewTitle) return true;
  return /대회\s*주최사\s*인카금융서비스|타이틀스폰서로\s*합류|공동\s*주최사/.test(text)
    && /KLPGA|골프|우승\s*후보|개막|디펜딩\s*챔피언|방어|노승희|안송이|400경기|선수|티샷|라운드|주차|셔틀|날씨|관람\s*정보|갤러리|프로암|이모저모|하루틴|팬심|협찬사|일상\s*침투|PREVIEW|프리뷰|3승\s*사냥|사냥|더헤븐리조트|커뮤니티\s*시설|샬롬\s*뷰|품격\s*높인다/.test(text)
    && !/후원|브랜드|마케팅|기부|사회공헌|ESG/.test(title);
}

function isOwnSponsoredSportsScoreboardTitle(value = "") {
  const text = String(value || "");
  const hasOwnTournament = /인카금융(?:서비스)?\s*더\s*헤븐\s*마스터즈|인카금융(?:서비스)?\s*더헤븐\s*마스터즈|인카금융(?:서비스)?\s*더\s*헤븐|인카금융(?:서비스)?\s*더헤븐/.test(text);
  const hasSportsSignal = /KLPGA|골프|라운드|[0-9]R|티샷|버디|이글|스윙|선두|공동|순위|우승|상금|언더파|타수|홀|선수|청사진|포토/.test(text);
  const hasCompanyStory = /기부|확정형\s*기부|후원|사회공헌|브랜드|스폰서|주최|협약|인카금융서비스가|인카금융서비스는|인카금융이|인카금융은|홍보|마케팅|ESG/.test(text);
  return hasOwnTournament && hasSportsSignal && !hasCompanyStory;
}

function periodScopeLabel(period) {
  return { daily: "일간", weekly: "주간", monthly: "월간", custom: "선택 기간" }[period] || "기간";
}

function composeMediaAnalysisData(base = {}, articles = [], scopeLabel = "선택 기간") {
  const usableArticles = articles.filter(isUsableArticle);
  const ownMentions = usableArticles.filter(isOwnArticle).length;
  const ownNegative = usableArticles.filter((article) => isOwnArticle(article) && article.tone === "부정").length;
  const caution = usableArticles.filter((article) => article.tone === "주의").length;
  const gaInsurance = usableArticles.filter((article) => ["GA", "보험사"].includes(article.category)).length;
  return {
    ...base,
    scope: scopeLabel,
    summary: {
      ...(base.summary || {}),
      collected: usableArticles.length,
      analyzed: usableArticles.filter((article) => article.tone !== "제외").length,
      ownMentions,
      ownNegative,
      caution,
      gaInsurance,
      risk: ownNegative >= 3 ? "HIGH" : ownNegative > 0 ? "MEDIUM" : "LOW",
      headline: buildHeadline(usableArticles, ownMentions, ownNegative, caution),
    },
    pressInfluence: buildPressInfluence(usableArticles),
    categoryFlow: buildCategoryFlowRows(usableArticles),
    toneTrend: buildToneTrend(usableArticles),
  };
}

function buildPeriodObservations(data, issues = [], period = "monthly", customScopeLabel = "") {
  const summary = data.summary || {};
  const lead = issues[0];
  const topPress = data.pressInfluence?.[0];
  const scope = customScopeLabel || periodScopeLabel(period);
  const periodIntent = {
    daily: "일간 보고서는 신규 당사 언급과 즉시 확인할 리스크를 우선 배치합니다.",
    weekly: "주간 보고서는 반복 노출과 논조 변화가 있는 이슈를 우선 묶어 봅니다.",
    monthly: "월간 보고서는 누적 관리 대상, 언론사별 보도량, 키워드 흐름을 함께 봅니다.",
    custom: "선택 기간 안에서 당사 언급, 정책 신호, 반복 노출 이슈를 같은 기준으로 비교합니다.",
  }[period] || "선택 기간의 보도 흐름을 기준으로 핵심 이슈를 정리합니다.";
  const observations = [];
  observations.push(periodIntent);
  if (summary.ownNegative > 0) {
    observations.push(`당사 부정 이슈 ${summary.ownNegative}건이 확인돼 ${scope} 리스크 점검 대상으로 우선 배치했습니다.`);
  } else if (summary.ownMentions > 0) {
    observations.push(`당사 언급 ${summary.ownMentions}건은 직접 부정보다 시장 평가와 업계 흐름을 함께 확인하는 관찰 이슈로 봅니다.`);
  } else {
    observations.push(`${scope} 기준 당사 직접 부정 이슈는 확인되지 않았고, 업계성 이슈 중심으로 흐름을 추적합니다.`);
  }
  if (summary.caution > 0) {
    observations.push(`주의 이슈 ${summary.caution}건은 투자 의견, 수수료, 규제, GA 운영 이슈처럼 의사결정자가 확인할 만한 신호로 분리했습니다.`);
  }
  if (lead?.title) {
    const leadLine = buildArticleSummaryLines(lead)[0] || `${scope} 대표 이슈로 확인된 보도입니다.`;
    observations.push(`대표 이슈 "${lead.title}"은 ${leadLine.replace(/[.。!?]+$/g, "")}.`);
  }
  if (topPress?.source) {
    observations.push(`${topPress.source} 보도가 가장 많이 관찰돼 해당 매체의 반복 보도 흐름을 우선 확인하는 구성이 적절합니다.`);
  }
  return observations.slice(0, 4);
}

function buildToneTrend(articles) {
  const byDate = new Map();
  articles.forEach((article) => {
    const date = article.date || "미확인";
    if (!byDate.has(date)) byDate.set(date, { date: date.slice(5) || date, positive: 0, negative: 0, caution: 0, neutral: 0 });
    const bucket = byDate.get(date);
    if (article.tone === "긍정") bucket.positive += 1;
    else if (article.tone === "부정") bucket.negative += 1;
    else if (article.tone === "주의") bucket.caution += 1;
    else bucket.neutral += 1;
  });
  return Array.from(byDate.values()).slice(-7);
}

function buildDailyToneTrend(articles, days = 31, fallback = []) {
  const dated = articles.filter((article) => article.date);
  if (!dated.length) return ensureTrendHasTone(fallback);
  const latest = lastItem(dated.map((article) => article.date).sort());
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  if (Number.isNaN(latestTime)) return buildToneTrend(dated);
  const startTime = latestTime - (days - 1) * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startTime + index * 24 * 60 * 60 * 1000);
    const key = formatKstDateKey(date);
    buckets.set(key, { date: key.slice(5), positive: 0, negative: 0, caution: 0, neutral: 0 });
  }
  dated.forEach((article) => {
    const time = new Date(`${article.date}T00:00:00+09:00`).getTime();
    if (Number.isNaN(time) || time < startTime || time > latestTime) return;
    const bucket = buckets.get(article.date);
    if (!bucket) return;
    if (article.tone === "긍정") bucket.positive += 1;
    else if (article.tone === "부정") bucket.negative += 1;
    else if (article.tone === "주의") bucket.caution += 1;
    else bucket.neutral += 1;
  });
  const rows = Array.from(buckets.values());
  const hasSignal = rows.some((row) => row.positive || row.negative || row.caution || row.neutral);
  return hasSignal ? rows : ensureTrendHasTone(fallback);
}

function buildReportToneTrend(articles, period = "daily", fallback = []) {
  const dated = articles
    .map((article) => ({ article, dateKey: rowDateKey(article) }))
    .filter((row) => row.dateKey);
  if (!dated.length) return ensureTrendHasTone(fallback);
  const latest = lastItem(dated.map((row) => row.dateKey).sort());
  const scope = buildPeriodRangeFromLatest(latest, period);
  if (!scope.start || !scope.end) return ensureTrendHasTone(fallback);

  if (period === "daily") {
    const slots = [
      { id: "00-08", label: "00-08시", start: 0, end: 8 },
      { id: "08-13", label: "08-13시", start: 8, end: 13 },
      { id: "13-18", label: "13-18시", start: 13, end: 18 },
      { id: "18-24", label: "18-24시", start: 18, end: 24 },
    ];
    const buckets = new Map(slots.map((slot) => [slot.id, { date: slot.label, positive: 0, negative: 0, caution: 0, neutral: 0 }]));
    dated
      .filter((row) => row.dateKey === scope.start)
      .forEach(({ article }) => {
        const hour = Number(String(article.time || article.publishedAt || "").match(/(\d{1,2}):/)?.[1] || 0);
        const slot = slots.find((item) => hour >= item.start && hour < item.end) || slots[0];
        addToneToBucket(buckets.get(slot.id), article.tone);
      });
    const rows = Array.from(buckets.values());
    return rows.some(hasToneSignal) ? rows : ensureTrendHasTone(fallback);
  }

  const buckets = new Map();
  let cursor = scope.start;
  while (cursor && cursor <= scope.end) {
    const label = period === "monthly" ? `${monthWeekIndex(cursor)}주` : cursor.slice(5);
    if (!buckets.has(label)) buckets.set(label, { date: label, positive: 0, negative: 0, caution: 0, neutral: 0 });
    cursor = addDaysToDateKey(cursor, 1);
  }
  dated.forEach(({ article, dateKey }) => {
    if (dateKey < scope.start || dateKey > scope.end) return;
    const label = period === "monthly" ? `${monthWeekIndex(dateKey)}주` : dateKey.slice(5);
    const bucket = buckets.get(label);
    if (bucket) addToneToBucket(bucket, article.tone);
  });
  const rows = Array.from(buckets.values());
  return rows.some(hasToneSignal) ? rows : ensureTrendHasTone(fallback);
}

function addToneToBucket(bucket, tone) {
  if (!bucket) return;
  if (tone === "긍정") bucket.positive += 1;
  else if (tone === "부정") bucket.negative += 1;
  else if (tone === "주의") bucket.caution += 1;
  else bucket.neutral += 1;
}

function hasToneSignal(row = {}) {
  return Boolean(row.positive || row.negative || row.caution || row.neutral);
}

function formatKstDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function ensureTrendHasTone(rows = []) {
  if (!rows.length) return [];
  const fallback = rows.length ? rows : [
    { date: "1주", positive: 5, caution: 1, negative: 0 },
    { date: "2주", positive: 7, caution: 2, negative: 1 },
    { date: "3주", positive: 4, caution: 1, negative: 0 },
    { date: "4주", positive: 8, caution: 2, negative: 0 },
    { date: "5주", positive: 6, caution: 1, negative: 0 },
  ];
  return rows.map((row, index) => ({
    date: row.date || `${index + 1}주`,
    positive: Number(row.positive || 0),
    caution: Number(row.caution || 0),
    negative: Number(row.negative || 0),
    neutral: Number(row.neutral || 0),
  }));
}

function lastNDays(articles, days) {
  const dated = articles.filter((article) => article.date);
  if (!dated.length) return articles;
  const latest = lastItem(dated.map((article) => article.date).sort());
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const minTime = latestTime - (days - 1) * 24 * 60 * 60 * 1000;
  return dated.filter((article) => {
    const time = new Date(`${article.date}T00:00:00+09:00`).getTime();
    return time >= minTime && time <= latestTime;
  });
}

function selectRealtimeArticles(articles = []) {
  const recent = lastNDays(articles, 1);
  return [...(recent.length ? recent : articles)]
    .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
    .slice(0, 240);
}

function expandReportIssues(issues, articles, period) {
  const max = period === "daily" ? 6 : 10;
  const scoped = articles
    .filter((article) => article?.title && article.tone !== "제외")
    .filter(isUsableArticle);
  const rows = buildRelatedArticleGroups(scoped)
    .map((group) => normalizeMediaIssueGroup(group, period))
    .filter((issue) => issue.title && buildArticleSummaryLines(issue).length)
    .sort((a, b) => mediaIssueScore(b, period) - mediaIssueScore(a, period) || articleTimeValue(b) - articleTimeValue(a));
  const fallbackRows = rows.length ? [] : issues;
  const seen = new Set();
  return selectBalancedMediaIssues([...rows, ...fallbackRows], period, max).filter((item) => {
    const key = normalizeGroupTitle(item.title || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}

function buildPressInfluence(articles) {
  const pressArticles = articles.filter((article) => !isOfficialRegulatorSource(article.source) && !isPortalSource(article.source));
  return groupArticles(pressArticles, "source").slice(0, PRESS_INFLUENCE_LIMIT).map(([source, total]) => {
    const scoped = pressArticles.filter((article) => article.source === source);
    return {
      source,
      total,
      own: scoped.filter(isOwnArticle).length,
      negative: scoped.filter((article) => article.tone === "부정").length,
      type: scoped[0]?.category || "일반",
    };
  });
}

function isOfficialRegulatorSource(source) {
  return /금융감독원|금융위원회/.test(String(source || ""));
}

function isPortalSource(source) {
  return /^(google|naver|daum|bing)$/i.test(String(source || "").trim()) || /google\./i.test(String(source || ""));
}

const emptyReporterForm = {
  id: "",
  name: "",
  media: "",
  beat: "",
  status: "중립",
  contactDate: "",
  email: "",
  phone: "",
  request: "",
  memo: "",
};

const emptyMediaForm = {
  name: "",
  url: "",
  grade: "B",
  status: "중립",
  owner: "",
  contactDate: "",
  beat: "",
  leadReporter: "",
  email: "",
  phone: "",
  memo: "",
};

const keywordCategories = [
  { id: "own", label: "당사", rule: "당사명·브랜드·임직원 직접 언급만 당사로 분류합니다." },
  { id: "competitor", label: "GA", rule: "GA·보험대리점·설계사·정착지원금 문맥이 함께 있을 때 GA 이슈로 봅니다." },
  { id: "industry", label: "보험사", rule: "보험사·상품·판매채널·소비자 동향처럼 보험업계 흐름을 추적합니다." },
  { id: "regulation", label: "정책", rule: "금융당국·수수료·제도·법령 이슈를 정책/규제 관찰로 분리합니다." },
  { id: "other", label: "기타", rule: "일반 관심 키워드나 별도 문맥 분석 대상입니다." },
  { id: "exclude", label: "제외", rule: "동명이어·스포츠·비보험 금융처럼 분석에서 제외할 신호를 관리합니다." },
];

const keywordMatchModes = [
  { id: "keyword", label: "일반" },
  { id: "context", label: "문맥 필수" },
  { id: "strict", label: "정밀" },
  { id: "exact", label: "정확 일치" },
];

const keywordEntityTypes = [
  { id: "keyword", label: "키워드" },
  { id: "organization", label: "기관/회사" },
  { id: "person", label: "인물" },
  { id: "location", label: "장소" },
  { id: "topic", label: "주제" },
  { id: "noise", label: "제외 신호" },
];

const keywordMatchTargets = [
  { id: "title_summary", label: "제목+요약" },
  { id: "title_only", label: "제목" },
  { id: "summary_only", label: "요약" },
  { id: "source", label: "언론사" },
  { id: "keyword", label: "검색어" },
  { id: "all", label: "전체" },
];

const keywordDefaultTones = [
  { id: "positive", label: "긍정" },
  { id: "neutral", label: "중립" },
  { id: "caution", label: "주의" },
  { id: "negative", label: "부정" },
  { id: "exclude", label: "제외" },
];

function canonicalHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/^m\./, "")
      .split(/[/?#]/)[0]
      .trim();
  }
}

function normalizeAliasRow(row) {
  const host = canonicalHost(row?.host || row?.domain || row?.url);
  const pressName = String(row?.press_name || row?.pressName || row?.name || "").trim();
  if (!host || !pressName) return null;
  return { host, press_name: pressName, pressName };
}

function mergeAliasRows(remoteRows = [], localRows = []) {
  const map = new Map();
  [...remoteRows, ...localRows].forEach((row) => {
    const normalized = normalizeAliasRow(row);
    if (normalized) map.set(normalized.host, normalized);
  });
  return Array.from(map.values()).sort((a, b) => a.pressName.localeCompare(b.pressName, "ko-KR"));
}

function normalizeMediaDraft(row = {}) {
  return {
    name: String(row.name || "").trim(),
    url: String(row.url || "").trim(),
    grade: String(row.grade || "B").trim() || "B",
    status: String(row.status || "중립").trim() || "중립",
    owner: String(row.owner || "").trim(),
    contactDate: row.contactDate || row.contact_date || "",
    beat: String(row.beat || "").trim(),
    leadReporter: String(row.leadReporter || row.lead_reporter || "").trim(),
    email: String(row.email || "").trim(),
    phone: String(row.phone || "").trim(),
    memo: String(row.memo || "").trim(),
    total: Number(row.total || 0),
    own: Number(row.own || 0),
    negative: Number(row.negative || 0),
  };
}

function mediaKey(row = {}) {
  return String(row.name || "").trim();
}

function upsertMediaLocal(rows = [], row = {}) {
  const normalized = normalizeMediaDraft(row);
  if (!normalized.name) return rows;
  const map = new Map(rows.map((item) => [mediaKey(item), item]));
  map.set(normalized.name, normalized);
  return Array.from(map.values());
}

function upsertAliasRow(rows, row) {
  const normalized = normalizeAliasRow(row);
  if (!normalized) return rows;
  const map = new Map(rows.map((item) => [canonicalHost(item.host), item]));
  map.set(normalized.host, { host: normalized.host, press_name: normalized.pressName });
  return Array.from(map.values());
}

function domainsForPressName(pressName, aliases = []) {
  const clean = String(pressName || "").trim();
  return unique(aliases.filter((row) => row.pressName === clean).map((row) => row.host));
}

function mergeMediaRows(rows = [], aliases = [], localRows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const normalized = normalizeMediaDraft(row);
    if (normalized.name) map.set(normalized.name, { ...row, ...normalized });
  });
  localRows.forEach((row) => {
    const normalized = normalizeMediaDraft(row);
    if (normalized.name) map.set(normalized.name, { ...(map.get(normalized.name) || {}), ...normalized });
  });
  aliases.forEach((alias) => {
    if (!map.has(alias.pressName)) {
      map.set(alias.pressName, {
        name: alias.pressName,
        grade: "B",
        status: "중립",
        owner: "",
        contactDate: "",
        memo: `주소 보정: ${alias.host}`,
        total: 0,
        own: 0,
        negative: 0,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const ownDiff = Number(b.own || 0) - Number(a.own || 0);
    return ownDiff || a.name.localeCompare(b.name, "ko-KR");
  });
}

function reporterKey(row = {}) {
  return String(row.id || `${row.name || ""}-${row.outlet || row.media || ""}`).trim();
}

function normalizeReporterDraft(row = {}) {
  return {
    id: row.id || "",
    name: String(row.name || "").trim(),
    media: String(row.media || row.outlet || "").trim(),
    outlet: String(row.outlet || row.media || "").trim(),
    beat: String(row.beat || "").trim(),
    recent: row.recent || "-",
    status: String(row.status || "중립").trim() || "중립",
    contactDate: row.contactDate || row.contact_date || row.date || "",
    email: String(row.email || "").trim(),
    phone: String(row.phone || "").trim(),
    request: String(row.request || "").trim(),
    memo: String(row.memo || "").trim(),
    mediaArticleCount: Number(row.mediaArticleCount || 0),
    mediaOwnCount: Number(row.mediaOwnCount || 0),
    mediaNegativeCount: Number(row.mediaNegativeCount || 0),
  };
}

function reporterDraftFromRemote(row = {}) {
  return normalizeReporterDraft({
    id: row.id,
    name: row.name,
    media: row.media,
    beat: row.beat,
    status: row.status,
    contactDate: row.contact_date,
    email: row.email,
    phone: row.phone,
    request: row.request,
    memo: row.memo,
  });
}

function mergeReporterRows(rows = [], localState = {}) {
  const hidden = new Set(localState.hidden || []);
  const map = new Map();
  rows.forEach((row) => {
    const normalized = normalizeReporterDraft(row);
    const key = reporterKey(normalized);
    if (key && !hidden.has(key)) map.set(key, normalized);
  });
  (localState.rows || []).forEach((row) => {
    const normalized = normalizeReporterDraft(row);
    const key = reporterKey(normalized);
    if (key && !hidden.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => {
    const contactDiff = String(b.contactDate || "").localeCompare(String(a.contactDate || ""));
    return contactDiff || a.name.localeCompare(b.name, "ko-KR");
  });
}

function upsertReporterLocal(state = {}, row = {}, replaceId = "") {
  const normalized = normalizeReporterDraft(row);
  const key = reporterKey(normalized);
  const replaceKey = replaceId ? String(replaceId) : "";
  const map = new Map((state.rows || []).map((item) => [reporterKey(item), item]));
  if (replaceKey && map.has(replaceKey)) map.delete(replaceKey);
  map.set(key, normalized);
  const hidden = (state.hidden || []).filter((value) => value !== key && value !== replaceKey);
  return { rows: Array.from(map.values()), hidden };
}

function hideReporterLocal(state = {}, row = {}) {
  const key = reporterKey(row);
  const rows = (state.rows || []).filter((item) => reporterKey(item) !== key);
  return { rows, hidden: unique([...(state.hidden || []), key]) };
}

function keywordRowsFromGroups() {
  const categoryMap = {
    당사: "own",
    GA: "competitor",
    보험사: "industry",
    "정책/규제": "regulation",
    "제외 후보": "exclude",
  };
  return keywordGroups.flatMap((group) =>
    group.keywords.map((keyword) => {
      const category = categoryMap[group.group] || "other";
      return {
        keyword,
        category,
        subcategory: category === "own" ? "direct_company" : category === "competitor" ? "ga_competitor" : "",
        entityType: category === "own" || category === "competitor" ? "organization" : category === "exclude" ? "noise" : "keyword",
        enabled: true,
        isSearchKeyword: category !== "exclude",
        requireArticleMention: category === "own" || category === "competitor",
        matchTarget: "title_summary",
        matchMode: "keyword",
        defaultTone: category === "regulation" ? "caution" : category === "exclude" ? "exclude" : "neutral",
        analysisExcluded: category === "exclude",
      };
    }),
  );
}

function normalizeKeywordRow(row) {
  const keyword = String(row?.keyword || "").trim();
  if (!keyword) return null;
  const category = String(row?.category || "other").trim() || "other";
  const hasRequireFlag = row?.requireArticleMention !== undefined || row?.require_article_mention !== undefined;
  const hasSearchFlag = row?.isSearchKeyword !== undefined || row?.is_search_keyword !== undefined;
  const hasExcludeFlag = row?.analysisExcluded !== undefined || row?.analysis_excluded !== undefined;
  return {
    keyword,
    category,
    subcategory: String(row?.subcategory || row?.subCategory || "").trim(),
    entityType: normalizeKeywordEntityType(row?.entityType || row?.entity_type || (category === "own" || category === "competitor" ? "organization" : category === "exclude" ? "noise" : "keyword")),
    enabled: row?.enabled !== false,
    isSearchKeyword: hasSearchFlag ? row?.isSearchKeyword !== false && row?.is_search_keyword !== false : category !== "exclude",
    requireArticleMention: hasRequireFlag ? row?.requireArticleMention === true || row?.require_article_mention === true : category === "own" || category === "competitor",
    matchTarget: normalizeKeywordMatchTarget(row?.matchTarget || row?.match_target),
    matchMode: normalizeKeywordMatchMode(row?.matchMode || row?.match_mode),
    contextTerms: splitKeywordTerms(row?.contextTerms || row?.context_terms),
    excludeTerms: splitKeywordTerms(row?.excludeTerms || row?.exclude_terms),
    defaultTone: normalizeKeywordDefaultTone(row?.defaultTone || row?.default_tone || (category === "regulation" ? "caution" : category === "exclude" ? "exclude" : "neutral")),
    analysisExcluded: hasExcludeFlag ? row?.analysisExcluded === true || row?.analysis_excluded === true : category === "exclude",
    priority: normalizeKeywordPriority(row?.priority),
    memo: String(row?.memo || "").trim(),
  };
}

function keywordRowIdentity(row) {
  const normalized = normalizeKeywordRow(row);
  if (!normalized) return "";
  return `${normalized.category}:${normalizeKeywordText(normalized.keyword)}`;
}

function mergeKeywordRows(remoteRows = [], localRows = []) {
  const map = new Map();
  [...remoteRows, ...localRows].forEach((row) => {
    const normalized = normalizeKeywordRow(row);
    if (!normalized) return;
    const key = `${normalized.category}:${normalizeKeywordText(normalized.keyword)}`;
    if (normalized.enabled === false) {
      map.delete(key);
    } else {
      map.set(key, normalized);
    }
  });
  return Array.from(map.values());
}

function upsertKeywordRow(rows, row) {
  const normalized = normalizeKeywordRow(row);
  if (!normalized) return rows;
  const map = new Map(rows.map((item) => [`${item.category || "other"}:${normalizeKeywordText(item.keyword)}`, item]));
  map.set(`${normalized.category}:${normalizeKeywordText(normalized.keyword)}`, normalized);
  return Array.from(map.values());
}

function keywordCategoryLabel(category) {
  return keywordCategories.find((item) => item.id === category)?.label || "기타";
}

function keywordSubcategoryLabel(value) {
  const key = String(value || "").trim();
  if (!key) return "-";
  return {
    direct_company: "직접 언급",
    ga_competitor: "GA 경쟁",
    insurance_company: "보험사",
    market_trend: "시장 동향",
    policy_supervision: "정책 감독",
    noise: "제외 신호",
    general: "일반",
  }[key] || key;
}

function keywordCategoryRule(category) {
  return keywordCategories.find((item) => item.id === category)?.rule || "운영자가 지정한 문맥으로 분류합니다.";
}

function keywordCategoryTone(category) {
  return {
    own: "긍정",
    competitor: "중립",
    industry: "중립",
    regulation: "주의",
    exclude: "제외",
  }[category] || "중립";
}

function keywordMatchModeLabel(mode) {
  return keywordMatchModes.find((item) => item.id === mode)?.label || "일반";
}

function keywordEntityTypeLabel(type) {
  return keywordEntityTypes.find((item) => item.id === type)?.label || "키워드";
}

function keywordMatchTargetLabel(target) {
  return keywordMatchTargets.find((item) => item.id === target)?.label || "제목+요약";
}

function keywordDefaultToneLabel(tone) {
  return keywordDefaultTones.find((item) => item.id === tone)?.label || "중립";
}

function normalizeKeywordEntityType(value) {
  const item = String(value || "keyword").trim();
  return keywordEntityTypes.some((option) => option.id === item) ? item : "keyword";
}

function normalizeKeywordMatchTarget(value) {
  const item = String(value || "title_summary").trim();
  return keywordMatchTargets.some((option) => option.id === item) ? item : "title_summary";
}

function normalizeKeywordMatchMode(value) {
  const mode = String(value || "keyword").trim();
  return keywordMatchModes.some((item) => item.id === mode) ? mode : "keyword";
}

function normalizeKeywordDefaultTone(value) {
  const item = String(value || "neutral").trim();
  return keywordDefaultTones.some((option) => option.id === item) ? item : "neutral";
}

function normalizeKeywordPriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? Math.max(1, Math.min(999, Math.round(priority))) : 100;
}

function splitKeywordTerms(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,|\n]/);
  return items.map((item) => String(item || "").trim()).filter(Boolean);
}

function buildKeywordRuleValidation(rows = [], articles = []) {
  const enabledRows = rows
    .map(normalizeKeywordRow)
    .filter((row) => row?.enabled !== false && row.analysisExcluded !== true)
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));
  const summary = {
    articleCount: Array.isArray(articles) ? articles.length : 0,
    matched: 0,
    unmatched: 0,
    byCategory: {},
  };
  if (!summary.articleCount || !enabledRows.length) {
    summary.unmatched = summary.articleCount;
    return summary;
  }
  articles.forEach((article) => {
    const matched = enabledRows.find((row) => keywordRuleMatchesArticle(row, article));
    if (matched) {
      summary.matched += 1;
      summary.byCategory[matched.category] = (summary.byCategory[matched.category] || 0) + 1;
    } else {
      summary.unmatched += 1;
    }
  });
  return summary;
}

function keywordRuleMatchesArticle(row, article = {}) {
  const targetText = normalizeKeywordText(articleTextForKeywordTarget(article, row.matchTarget));
  if (!targetText) return false;
  const keywordText = normalizeKeywordText(row.keyword);
  if (!keywordText) return false;
  const contextTerms = row.contextTerms || [];
  const excludeTerms = row.excludeTerms || [];
  if (excludeTerms.some((term) => targetText.includes(normalizeKeywordText(term)))) return false;
  if (row.requireArticleMention && !targetText.includes(keywordText)) return false;
  if (row.matchMode === "exact" && targetText !== keywordText) return false;
  if (row.matchMode === "strict" && !new RegExp(`(^|\\s)${escapeRegExp(keywordText)}($|\\s)`).test(targetText)) return false;
  if (row.matchMode !== "context" && !targetText.includes(keywordText)) return false;
  if (contextTerms.length && !contextTerms.some((term) => targetText.includes(normalizeKeywordText(term)))) return false;
  return true;
}

function articleTextForKeywordTarget(article = {}, target = "title_summary") {
  const title = article.title || "";
  const raw = article.raw && typeof article.raw === "object" ? article.raw : {};
  const originalDescription = [
    article.description,
    raw.description,
    raw.summary,
    raw.content,
    raw.body,
  ].filter(Boolean).join(" ");
  const summary = originalDescription || (
    !isLowValueAnalysisLine(article.summary || "") && !isGenericSummaryLine(article.summary || "")
      ? article.summary || ""
      : ""
  );
  const source = article.source || article.media || "";
  const keyword = article.keyword || "";
  if (target === "title_only") return title;
  if (target === "summary_only") return summary;
  if (target === "source") return source;
  if (target === "keyword") return keyword;
  if (target === "all") return `${title} ${summary} ${source}`;
  return `${title} ${summary}`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function groupKeywordRows(rows = []) {
  const order = keywordCategories.map((item) => item.id);
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.category)) groups.set(row.category, []);
    groups.get(row.category).push(row);
  });
  return Array.from(groups.entries())
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => (Number(a.priority || 100) - Number(b.priority || 100)) || a.keyword.localeCompare(b.keyword, "ko-KR")),
    }))
    .sort((a, b) => {
      const aOrder = order.includes(a.category) ? order.indexOf(a.category) : order.length;
      const bOrder = order.includes(b.category) ? order.indexOf(b.category) : order.length;
      return aOrder - bOrder;
    });
}

function buildFeedbackRuleCandidates(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const pattern = feedbackPattern(row);
    if (!pattern.keyword) return;
    const key = `${pattern.category}:${pattern.keyword}:${pattern.action}`;
    const current = map.get(key) || {
      key,
      ...pattern,
      count: 0,
      example: row.title || row.link || "-",
    };
    current.count += 1;
    if (!current.example || current.example === "-") current.example = row.title || row.link || "-";
    map.set(key, current);
  });
  return Array.from(map.values())
    .filter((item) => item.count >= 1)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko-KR"));
}

function feedbackPattern(row = {}) {
  const title = String(row.title || "");
  const text = normalizeKeywordText(`${title} ${row.reason || ""}`);
  const correctedTone = String(row.correctedTone || "");
  const correctedCategory = String(row.correctedCategory || "");
  if (/투자의견|목표가|목표주가|증권\s*리포트|주가\s*하락|하향/.test(title)) {
    return {
      keyword: "투자의견 하향",
      category: "regulation",
      action: "주의 고정",
      label: "시장 평가/투자의견 하향은 부정과 분리",
    };
  }
  if (/브랜드평판|평판지수|마이데이터\s*평판/.test(title)) {
    return {
      keyword: "브랜드평판",
      category: correctedTone === "제외" ? "exclude" : "industry",
      action: correctedTone === "제외" ? "제외 후보" : "문맥 확인",
      label: "브랜드평판 기사는 업종 문맥 확인",
    };
  }
  if (/포토|골프|순위|리조트|선수|경기/.test(title) && correctedTone === "제외") {
    return {
      keyword: "포토 스포츠",
      category: "exclude",
      action: "제외 후보",
      label: "스포츠/포토성 기사 제외",
    };
  }
  if (correctedTone === "제외" || correctedCategory === "제외") {
    return {
      keyword: compactFeedbackKeyword(title),
      category: "exclude",
      action: "제외 후보",
      label: "반복 제외된 기사 패턴",
    };
  }
  if (correctedTone === "주의" && /부정|negative|high/.test(String(row.previousTone || "").toLowerCase())) {
    return {
      keyword: compactFeedbackKeyword(title),
      category: "regulation",
      action: "주의 고정",
      label: "부정에서 주의로 반복 보정",
    };
  }
  if (correctedCategory && correctedCategory !== row.previousCategory) {
    return {
      keyword: compactFeedbackKeyword(title),
      category: categoryIdFromFeedbackLabel(correctedCategory),
      action: "분류 보정",
      label: `${row.previousCategory || "이전"} → ${correctedCategory} 반복 보정`,
    };
  }
  return {
    keyword: text.split(" ").filter((token) => token.length > 1)[0] || "",
    category: categoryIdFromFeedbackLabel(correctedCategory),
    action: "검토 후보",
    label: "반복 수정 패턴",
  };
}

function compactFeedbackKeyword(title = "") {
  const tokens = articleTokens(title).filter((token) => !/기사|뉴스|보도|관련/.test(token));
  return tokens.slice(0, 2).join(" ") || String(title || "").slice(0, 16).trim();
}

function categoryIdFromFeedbackLabel(value = "") {
  const text = String(value || "").toLowerCase();
  if (/브랜드|스폰서|후원|sponsor/.test(value) || /sponsorship/.test(text)) return "sponsorship";
  if (/당사|own|인카/.test(value)) return "own";
  if (/ga|보험사|경쟁|competitor/.test(text)) return "competitor";
  if (/정책|규제|당국|regulation|policy/.test(value)) return "regulation";
  if (/업계|동향|industry|market/.test(value)) return "industry";
  if (/제외|exclude|noise/.test(value)) return "exclude";
  return "other";
}

function printCurrentView(title) {
  if (typeof window === "undefined") return;
  const previousTitle = document.title;
  document.title = title || previousTitle;
  window.setTimeout(() => window.print(), 50);
  window.setTimeout(() => {
    document.title = previousTitle;
  }, 1200);
}

function printHtmlDocument(html) {
  if (typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.title = "print-preview";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const printWindow = iframe.contentWindow;
  const printDocument = iframe.contentDocument || printWindow?.document;
  if (!printWindow || !printDocument) {
    iframe.remove();
    return;
  }
  const cleanup = () => iframe.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(cleanup, 2000);
  }, 250);
}

function printAdReport(rows = []) {
  printHtmlDocument(buildAdReportDocument(rows));
}

function buildAdSpendData(rows = []) {
  const monthly = amountRows(rows, "month", 12);
  const media = amountRows(rows, "media", 6);
  const type = amountRows(rows, "type", 6);
  return { monthly, media, type };
}

function amountRows(rows = [], key, limit = 8) {
  const totals = new Map();
  rows.forEach((row) => {
    const name = row[key] || "미분류";
    totals.set(name, (totals.get(name) || 0) + Number(row.amount || 0));
  });
  const sorted = Array.from(totals.entries()).map(([name, value]) => ({ name, value }));
  if (key === "month") return sorted.sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(-limit);
  return sorted.sort((a, b) => b.value - a.value).slice(0, limit);
}

function buildAdReportDocument(rows = []) {
  const data = buildAdSpendData(rows);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const generated = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const topMedia = data.media[0]?.name || "-";
  const tableRows = rows.slice(0, 18).map((row) => `
    <tr>
      <td>${escapeHtml(row.month || "-")}</td>
      <td>${escapeHtml(row.media || "-")}</td>
      <td>${escapeHtml(row.type || "-")}</td>
      <td class="amount">${escapeHtml(formatMoney(row.amount))}</td>
      <td>${escapeHtml(row.memo || "-")}</td>
    </tr>
  `).join("");
  return `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>광고비 집행 리포트</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #111827; font-family: "Malgun Gothic", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { display: grid; gap: 10px; width: 100%; }
      header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 3px double #202a3a; }
      .eyebrow { color: #2855d9; font-size: 10px; font-weight: 900; text-transform: uppercase; }
      h1 { margin: 4px 0 0; font-family: Georgia, "Times New Roman", "Malgun Gothic", serif; font-size: 34px; line-height: 1; }
      .meta { display: grid; gap: 4px; min-width: 210px; color: #475569; font-size: 10px; font-weight: 900; text-align: right; }
      .kpis { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #cbd5e1; }
      .kpis div { padding: 8px 10px; border-right: 1px solid #cbd5e1; }
      .kpis div:last-child { border-right: 0; }
      .kpis span { display: block; color: #64748b; font-size: 9px; font-weight: 900; }
      .kpis b { display: block; margin-top: 4px; font-size: 18px; line-height: 1.05; }
      .grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 8px; }
      section { min-width: 0; padding: 9px; border: 1px solid #d8e0ec; border-radius: 7px; }
      h2 { margin: 0 0 7px; color: #111827; font-size: 12px; }
      .bars { display: grid; gap: 6px; }
      .bar { display: grid; grid-template-columns: 82px minmax(0, 1fr) 78px; gap: 6px; align-items: center; font-size: 10px; font-weight: 900; }
      .bar label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .track { height: 8px; border-radius: 999px; background: #eef2f7; overflow: hidden; }
      .track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2855d9, #6488ff); }
      .bar em { color: #334155; font-style: normal; text-align: right; white-space: nowrap; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; }
      th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
      th { color: #64748b; background: #f8fafc; font-weight: 900; }
      .amount { text-align: right; white-space: nowrap; font-weight: 900; }
      .table-card { grid-column: 1 / -1; }
      @media print { body { background: #fff; } }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header>
        <div>
          <div class="eyebrow">Advertising Spend Report</div>
          <h1>광고비 집행 리포트</h1>
        </div>
        <div class="meta">
          <span>생성 ${escapeHtml(generated)}</span>
          <span>기준 ${rows.length.toLocaleString("ko-KR")}건</span>
        </div>
      </header>
      <div class="kpis">
        <div><span>총 집행액</span><b>${escapeHtml(formatMoney(total))}</b></div>
        <div><span>집행 월수</span><b>${unique(rows.map((row) => row.month)).length.toLocaleString("ko-KR")}개월</b></div>
        <div><span>매체 수</span><b>${unique(rows.map((row) => row.media)).length.toLocaleString("ko-KR")}곳</b></div>
        <div><span>최대 집행 매체</span><b>${escapeHtml(topMedia)}</b></div>
      </div>
      <div class="grid">
        <section><h2>월별 집행 추이</h2><div class="bars">${adReportBars(data.monthly, total)}</div></section>
        <section><h2>매체별 집행</h2><div class="bars">${adReportBars(data.media, total)}</div></section>
        <section><h2>유형별 집행</h2><div class="bars">${adReportBars(data.type, total)}</div></section>
        <section class="table-card">
          <h2>집행 내역</h2>
          <table>
            <thead><tr><th>월</th><th>매체</th><th>유형</th><th>금액</th><th>메모</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="5">등록된 광고비 집행 내역이 없습니다.</td></tr>'}</tbody>
          </table>
        </section>
      </div>
    </main>
  </body>
  </html>`;
}

function adReportBars(rows = [], total = 0) {
  if (!rows.length) return '<p>데이터 없음</p>';
  const max = Math.max(...rows.map((row) => row.value), 1);
  return rows.map((row) => {
    const width = Math.max(4, Math.round((row.value / max) * 100));
    const share = total ? Math.round((row.value / total) * 100) : 0;
    return `<div class="bar"><label>${escapeHtml(row.name)}</label><div class="track"><span style="width:${width}%"></span></div><em>${escapeHtml(formatMoney(row.value))} ${share}%</em></div>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function composeManagementData(operations, articles) {
  const pressStats = new Map(buildPressStatsForManagement(articles).map((row) => [row.source, row]));
  const ownPressRows = buildOwnPressRelationRows(articles, pressStats);
  const baseMedia = operations.mediaRelations?.length
    ? operations.mediaRelations.map((row) => ({ ...row, ...(pressStats.get(row.name) || {}) }))
    : pressRegistry.map((name, index) => ({
        name,
        grade: index < 5 ? "A" : "B",
        status: index % 5 === 0 ? "우호" : "중립",
        owner: index < 6 ? "홍보팀" : "",
        contactDate: index < 8 ? "2026-05" : "",
        memo: index < 15 ? "보도자료 발송 이력 확인" : "",
        ...(pressStats.get(name) || { total: 0, own: 0, negative: 0 }),
      }));
  const media = mergeRequiredOwnPressRows(baseMedia, ownPressRows);
  const reporterSource = operations.reporters?.length ? operations.reporters : journalistRows;
  const reporters = reporterSource.map((row) => enrichReporterWithMediaStats(row, pressStats));
  const ads = operations.ads?.length ? operations.ads : adRows;
  return { media, reporters, ads };
}

function enrichReporterWithMediaStats(row = {}, pressStats = new Map()) {
  const mediaName = row.media || row.outlet || "";
  const stats = pressStats.get(mediaName) || {};
  const recent = row.recent && row.recent !== "-"
    ? row.recent
    : Number(stats.total || 0) > 0
      ? `매체 기사 ${Number(stats.total || 0).toLocaleString("ko-KR")}건`
      : row.recent || "-";
  return {
    ...row,
    outlet: row.outlet || row.media || "",
    mediaArticleCount: Number(stats.total || 0),
    mediaOwnCount: Number(stats.own || 0),
    mediaNegativeCount: Number(stats.negative || 0),
    recent,
  };
}

function buildPressStatsForManagement(articles = []) {
  const pressArticles = articles.filter((article) => !isOfficialRegulatorSource(article.source) && !isPortalSource(article.source));
  return groupArticles(pressArticles, "source").map(([source, total]) => {
    const scoped = pressArticles.filter((article) => article.source === source);
    return {
      source,
      total,
      own: scoped.filter(isOwnArticle).length,
      negative: scoped.filter((article) => article.tone === "부정").length,
      type: scoped[0]?.category || "일반",
    };
  });
}

function buildOwnPressRelationRows(articles = [], pressStats = new Map()) {
  return unique(
    articles
      .filter((article) => isOwnArticle(article) && !isOfficialRegulatorSource(article.source) && !isPortalSource(article.source))
      .map((article) => article.source)
      .filter(Boolean),
  ).map((name) => ({
    name,
    grade: "B",
    status: "중립",
    owner: "",
    contactDate: "",
    memo: "당사 기사 게재 이력으로 자동 등록된 관리 대상",
    ...(pressStats.get(name) || { total: 0, own: 1, negative: 0 }),
  }));
}

function mergeRequiredOwnPressRows(mediaRows = [], ownRows = []) {
  const map = new Map(mediaRows.map((row) => [row.name, row]));
  ownRows.forEach((row) => {
    map.set(row.name, { ...row, ...(map.get(row.name) || {}) });
  });
  return Array.from(map.values()).sort((a, b) => {
    const ownDiff = Number(b.own || 0) - Number(a.own || 0);
    return ownDiff || a.name.localeCompare(b.name, "ko-KR");
  });
}

function filterArticlesByPeriod(articles, period) {
  return filterRowsByPeriod(articles, period);
}

function lastItem(items = []) {
  return items.length ? items[items.length - 1] : undefined;
}

function latestArticleDate(articles = []) {
  return lastItem(articles
    .map((article) => rowDateKey(article))
    .filter(Boolean)
    .sort()) || "";
}

function availableReportMonths(rows = []) {
  return unique(rows
    .map(rowDateKey)
    .filter(Boolean)
    .map((date) => date.slice(0, 7)))
    .sort()
    .reverse();
}

function filterRowsByMonth(rows = [], month = "") {
  if (!month) return [];
  return rows.filter((row) => rowDateKey(row).startsWith(month));
}

function formatReportMonthOption(month = "") {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month || "월 선택";
  return `${match[1]}년 ${Number(match[2])}월`;
}

function rowDateKey(row = {}) {
  const candidates = [
    row.date,
    row.report_date,
    row.reportDate,
    row.published_date,
    row.publishedDate,
    row.pubDate,
    row.pub_date,
    row.sent_at,
    row.sentAt,
    row.created_at,
    row.createdAt,
    row.timestamp,
    row.publishedAt,
  ];
  for (const value of candidates) {
    const key = normalizeDateKey(value);
    if (key) return key;
  }
  return "";
}

function normalizeDateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const match = raw.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function dateKeyToUtcTime(key = "") {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day] = match.map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcTimeToDateKey(time) {
  if (!Number.isFinite(time)) return "";
  return new Date(time).toISOString().slice(0, 10);
}

function addDaysToDateKey(key, days) {
  const time = dateKeyToUtcTime(key);
  if (!Number.isFinite(time)) return "";
  return utcTimeToDateKey(time + days * 24 * 60 * 60 * 1000);
}

function startOfWeekDateKey(key) {
  const time = dateKeyToUtcTime(key);
  if (!Number.isFinite(time)) return key;
  const day = new Date(time).getUTCDay();
  const offset = (day + 6) % 7;
  return addDaysToDateKey(key, -offset);
}

function monthWeekIndex(key = "") {
  const day = Number(key.slice(8, 10));
  return Math.max(1, Math.min(6, Math.floor((day - 1) / 7) + 1));
}

function buildPeriodRangeFromLatest(latest, period = "daily") {
  const latestKey = normalizeDateKey(latest);
  if (!latestKey) return { period, start: "", end: "", month: "", scopeLabel: "", shortLabel: "" };
  if (period === "monthly") {
    const month = latestKey.slice(0, 7);
    return {
      period,
      start: `${month}-01`,
      end: latestKey,
      month,
      scopeLabel: `${month} 집계월`,
      shortLabel: `${month} 월간`,
      ruleLabel: "같은 월 기사만 집계",
      basisLabel: "월초부터 최신 수집일까지",
      trendTitle: "주차별 논조 추이",
      trendMeta: "집계월 기준",
    };
  }
  if (period === "weekly") {
    const start = startOfWeekDateKey(latestKey);
    return {
      period,
      start,
      end: latestKey,
      month: latestKey.slice(0, 7),
      scopeLabel: `${start} ~ ${latestKey} 주차`,
      shortLabel: `${start.slice(5)}~${latestKey.slice(5)} 주간`,
      ruleLabel: "월요일 시작 주차 기준",
      basisLabel: "해당 주차 기사만 집계",
      trendTitle: "일별 논조 추이",
      trendMeta: "해당 주차 기준",
    };
  }
  return {
    period,
    start: latestKey,
    end: latestKey,
    month: latestKey.slice(0, 7),
    scopeLabel: `${latestKey} 당일`,
    shortLabel: `${latestKey.slice(5)} 일간`,
    ruleLabel: "당일 기사만 집계",
    basisLabel: "00시부터 최신 수집시각까지",
    trendTitle: "시간대별 논조 추이",
    trendMeta: "당일 기준",
  };
}

function buildReportPeriodScope(rows = [], period = "daily", fallbackScope = "") {
  const latest = lastItem(rows.map(rowDateKey).filter(Boolean).sort());
  if (!latest) {
    return {
      period,
      start: "",
      end: "",
      month: "",
      scopeLabel: fallbackScope || periodScopeLabel(period),
      shortLabel: fallbackScope || periodScopeLabel(period),
      ruleLabel: period === "monthly" ? "집계월 기준" : period === "weekly" ? "주차 기준" : "당일 기준",
      basisLabel: "수집 데이터 기준",
      trendTitle: period === "monthly" ? "주차별 논조 추이" : period === "daily" ? "시간대별 논조 추이" : "일별 논조 추이",
      trendMeta: "기간 기준",
    };
  }
  return buildPeriodRangeFromLatest(latest, period);
}

function filterRowsByPeriod(articles, period) {
  if (!articles.length) return [];
  const dated = articles
    .map((article) => ({ article, dateKey: rowDateKey(article) }))
    .filter((row) => row.dateKey);
  if (!dated.length) return articles;
  const latest = lastItem(dated.map((row) => row.dateKey).sort());
  if (!latest) return articles;
  const scope = buildPeriodRangeFromLatest(latest, period);
  return dated
    .filter(({ dateKey }) => dateKey >= scope.start && dateKey <= scope.end)
    .map(({ article }) => article);
}

function filterArticlesByDateRange(articles = [], start = "", end = "") {
  const normalized = normalizeAnalysisDateRange(start, end, 90);
  if (!normalized.start && !normalized.end) return articles;
  return articles.filter((article) => {
    const key = rowDateKey(article);
    if (!key) return false;
    return (!normalized.start || key >= normalized.start) && (!normalized.end || key <= normalized.end);
  });
}

function normalizeAnalysisDateRange(start = "", end = "", maxDays = 90) {
  let nextStart = normalizeDateKey(start);
  let nextEnd = normalizeDateKey(end);
  if (nextStart && nextEnd && nextStart > nextEnd) {
    [nextStart, nextEnd] = [nextEnd, nextStart];
  }
  let clamped = false;
  const dayCount = dateRangeDayCount(nextStart, nextEnd);
  if (dayCount && maxDays && dayCount > maxDays && nextEnd) {
    nextStart = addDaysToDateKey(nextEnd, -(maxDays - 1));
    clamped = true;
  }
  return { start: nextStart, end: nextEnd, clamped };
}

function dateRangeDayCount(start = "", end = "") {
  const startTime = dateKeyToUtcTime(start);
  const endTime = dateKeyToUtcTime(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return 0;
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1;
}

function resolveMonitoringDateRange(articles = [], preset = {}) {
  if (preset.startDate || preset.endDate) {
    return {
      start: preset.startDate || preset.endDate || "",
      end: preset.endDate || preset.startDate || "",
    };
  }
  if (preset.articleHash || preset.articleLink || preset.articleTitle) {
    const focused = articles.find((article) => articleMatchesDeepLink(article, preset.articleHash, preset.articleLink, preset.articleTitle));
    const focusedDate = rowDateKey(focused);
    if (focusedDate) return { start: focusedDate, end: focusedDate };
  }
  const dated = articles.map(rowDateKey).filter(Boolean).sort();
  const latest = dated[dated.length - 1] || "";
  if (!latest) return { start: "", end: "" };
  if (preset.period === "monthly") {
    return { start: `${latest.slice(0, 7)}-01`, end: latest };
  }
  if (preset.period === "weekly") {
    return { start: startOfWeekDateKey(latest), end: latest };
  }
  return { start: latest, end: latest };
}

function articleSelectionKey(article = {}) {
  return String(article.id || article.link || `${article.source}-${article.date}-${article.title}`);
}

const REGULATOR_KEYWORD_RULES = [
  {
    label: "디지털/보안",
    pattern: /디지털|보안|해킹|AI|마이데이터|플랫폼|전산|개인정보|침해|금융보안/i,
  },
  {
    label: "소비자보호",
    pattern: /소비자|민원|분쟁|실손|보험금|청구|유의|보호|피해|장애인|불완전판매|광고|의료기관|가이드라인|빚 독촉|채무조정/i,
  },
  {
    label: "건전성/자본",
    pattern: /지급여력|자본|대출채권|경영개선|건전성|손해율|실적|리스크|적자|충당금|가계대출|가계부채|외환시장|보험권 간담회/i,
  },
  {
    label: "판매채널\/GA",
    pattern: /GA|법인보험대리점|보험대리점|대리점|설계사|판매수수료|수수료|정착지원금|부당승환|채널|모집|영업|시책|1200%?|분급/i,
  },
  {
    label: "감독/검사",
    pattern: /검사|제재|내부통제|감독|업무설명회|운영계획|관리 강화|공시|승인|조건부|보고|제도|법령|시행령|개정|책무구조/i,
  },
];

const REGULATOR_KEYWORD_LABELS = REGULATOR_KEYWORD_RULES.map((rule) => rule.label);
const DEFAULT_REGULATOR_KEYWORD = "감독/검사";

function buildRegulatorDirectionAnalysis(rows = []) {
  const sourceRows = rows.filter((row) => row?.title);
  const themes = REGULATOR_KEYWORD_RULES.map((theme) => ({
    ...theme,
    matches: sourceRows.filter((row) => resolveRegulatorKeyword(row) === theme.label),
  })).map((theme) => ({
    ...theme,
    count: theme.matches.length,
  }));
  const ranked = themes.sort((a, b) => b.count - a.count);
  const top = ranked.find((theme) => theme.count > 0) || ranked[0];
  const second = ranked.find((theme) => theme.count > 0 && theme.label !== top.label);
  const headline = rows.length
    ? `${top.label} ${top.count.toLocaleString("ko-KR")}건`
    : "선택 보도자료 없음";
  const summary = rows.length
    ? `전체 ${rows.length.toLocaleString("ko-KR")}건${second ? ` · ${second.label} ${second.count.toLocaleString("ko-KR")}건` : ""}`
    : "보도자료를 선택하거나 필터를 조정하세요.";
  return {
    headline,
    summary,
    themes: ranked.slice(0, 5),
  };
}

function regulatorText(row = {}) {
  return `${row.title || ""} ${row.summary || ""} ${row.description || ""} ${row.keyword || ""} ${row.category || ""} ${row.classification_reason || ""} ${row.classificationReason || ""}`;
}

function resolveRegulatorKeyword(row = {}) {
  const explicit = String(row.regulatorKeyword || row.regulator_keyword || row.keyword || "").trim();
  if (REGULATOR_KEYWORD_LABELS.includes(explicit)) return explicit;
  const text = regulatorText(row);
  const match = REGULATOR_KEYWORD_RULES.find((rule) => rule.pattern.test(text));
  return match?.label || DEFAULT_REGULATOR_KEYWORD;
}

function selectRegulatorRows(articles = []) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const source = String(article.source || "");
      const link = String(article.link || article.url || "");
      return /금융감독원|금융위원회/.test(source) || /fss\.or\.kr|fsc\.go\.kr/.test(link);
    })
    .map((article) => {
      const regulatorKeyword = resolveRegulatorKeyword(article);
      return {
        ...article,
        regulatorKeyword,
        keyword: regulatorKeyword,
      };
    })
    .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
    .filter((article) => {
      const title = normalizeRegulatorDisplayTitle(article.title);
      const key = `${article.source || ""}:${title}`;
      if (!title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
}

function normalizeRegulatorDisplayTitle(value) {
  return String(value || "")
    .replace(/\s+-\s+금융(?:위원회|감독원).*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRelatedArticleGroups(articles = []) {
  const groups = [];
  const bucketIndex = new Map();
  articles.forEach((article, index) => {
    const seed = articleGroupSeed(article);
    const bucketKeys = articleGroupBucketKeys(seed);
    const target = findRelatedArticleGroup(groups, bucketIndex, bucketKeys, seed);
    if (target) {
      target.group.members.push(article);
      target.group.seed = mergeGroupSeed(target.group.seed, seed);
      addGroupToBuckets(bucketIndex, target.index, bucketKeys);
    } else {
      groups.push({ seed, members: [article], index });
      addGroupToBuckets(bucketIndex, groups.length - 1, bucketKeys);
    }
  });

  return groups
    .map((group) => {
      const sortedMembers = [...group.members].sort(compareArticleImportance);
      const representative = sortedMembers[0] || {};
      const members = dedupeIssueMembers(
        sortedMembers.filter((member) => articleBelongsToSameIssue(representative, member)),
      );
      if (!members.length && representative.title) members.push(representative);
      const sources = unique(members.map((item) => item.source).filter(Boolean));
      return {
        ...representative,
        relatedArticles: members,
        relatedCount: members.length,
        relatedSourceCount: sources.length,
        relatedSources: sources.length
          ? `${sources.slice(0, 5).join(" · ")}${sources.length > 5 ? ` 외 ${sources.length - 5}곳` : ""}`
          : "",
        clusterSize: Math.max(Number(representative.clusterSize || 1), members.length),
      };
    })
    .sort((a, b) => {
      if ((b.relatedCount || 1) !== (a.relatedCount || 1)) return (b.relatedCount || 1) - (a.relatedCount || 1);
      return compareArticleImportance(a, b);
    });
}

function articleGroupSeed(article) {
  const canonical = normalizeGroupTitle(article.title || "");
  const topic = articleTopicSignature(article);
  const summaryTokens = articleTokens(`${article.summary || article.description || article.content || ""}`).slice(0, 16);
  const tokens = articleTokens(`${canonical} ${summaryTokens.join(" ")}`);
  const distinctiveTokens = tokens.filter(isDistinctiveRelatedToken);
  return {
    canonical,
    topic,
    ownSanction: isOwnSupervisorySanctionArticle(article),
    tokens,
    distinctiveTokens,
    titleKey: relatedTitleKey(canonical, tokens),
    tokenSet: new Set(tokens),
    distinctiveTokenSet: new Set(distinctiveTokens),
  };
}

function mergeGroupSeed(current, next) {
  return {
    canonical: current.canonical || "",
    topic: current.topic || "",
    ownSanction: Boolean(current.ownSanction || next?.ownSanction),
    tokens: current.tokens || [],
    distinctiveTokens: current.distinctiveTokens || [],
    titleKey: current.titleKey || "",
    tokenSet: new Set(current.tokens || []),
    distinctiveTokenSet: new Set(current.distinctiveTokens || []),
  };
}

function areRelatedArticleSeeds(a, b) {
  if (!a.canonical || !b.canonical) return false;
  if (a.ownSanction || b.ownSanction) return Boolean(a.ownSanction && b.ownSanction);
  const sharedCount = sharedTokenCount(a.tokens, b.tokens);
  const sharedDistinctive = sharedTokenCount(a.distinctiveTokens, b.distinctiveTokens);
  if (a.topic && b.topic && a.topic === b.topic && isStrongEventTopic(a.topic)) return true;
  if (a.topic && b.topic && a.topic === b.topic && (sharedDistinctive >= 1 || sharedCount >= 3)) return true;
  if (a.titleKey && b.titleKey && a.titleKey === b.titleKey && sharedDistinctive >= 2) return true;
  const shorter = a.canonical.length < b.canonical.length ? a.canonical : b.canonical;
  const longer = a.canonical.length < b.canonical.length ? b.canonical : a.canonical;
  if (shorter.length >= 28 && longer.includes(shorter) && sharedDistinctive >= 2) return true;
  if (a.canonical.length >= 36 && b.canonical.length >= 36 && a.canonical.slice(0, 36) === b.canonical.slice(0, 36) && sharedDistinctive >= 2) return true;
  if (Math.min(a.distinctiveTokenSet?.size || 0, b.distinctiveTokenSet?.size || 0) < 2) return false;
  const overlap = tokenOverlapRatio(a.tokenSet, b.tokenSet);
  const distinctiveOverlap = tokenOverlapRatio(a.distinctiveTokenSet, b.distinctiveTokenSet);
  return overlap >= 0.82 && distinctiveOverlap >= 0.62 && sharedDistinctive >= 2 && sharedLongToken(a.distinctiveTokens, b.distinctiveTokens);
}

function isStrongEventTopic(topic = "") {
  return [
    "event:incar-theheaven-masters",
    "event:own-ga-agent-fraud-sanction",
    "event:ga-agent-fraud-sanction",
    "event:ga-1200-commission-rule",
    "event:insurance-fraud-traffic-prevention-campaign",
    "event:insurance-fraud-ai-medical-claim",
    "event:insurance-fraud-hospital-claims",
    "event:insurance-fraud-regulatory-general",
  ].includes(String(topic || ""));
}

function findRelatedArticleGroup(groups, bucketIndex, bucketKeys, seed) {
  const candidateIndexes = new Set();
  bucketKeys.forEach((key) => {
    (bucketIndex.get(key) || []).forEach((index) => candidateIndexes.add(index));
  });
  for (const index of candidateIndexes) {
    const group = groups[index];
    if (group && areRelatedArticleSeeds(seed, group.seed)) return { group, index };
  }
  return null;
}

function addGroupToBuckets(bucketIndex, groupIndex, bucketKeys) {
  bucketKeys.forEach((key) => {
    const bucket = bucketIndex.get(key) || [];
    if (!bucket.includes(groupIndex)) bucket.push(groupIndex);
    bucketIndex.set(key, bucket);
  });
}

function articleGroupBucketKeys(seed = {}) {
  const keys = new Set();
  if (seed.topic) keys.add(`topic:${seed.topic}`);
  if (seed.titleKey) keys.add(`title:${seed.titleKey}`);
  (seed.distinctiveTokens || []).slice(0, 5).forEach((token) => keys.add(`token:${token}`));
  return Array.from(keys);
}

function relatedTitleKey(canonical = "", tokens = []) {
  const distinctive = tokens.filter(isDistinctiveRelatedToken).slice(0, 7);
  if (distinctive.length >= 3) return distinctive.join("|");
  if (canonical.length >= 34) return canonical.slice(0, 44);
  return "";
}

function isDistinctiveRelatedToken(token = "") {
  const text = String(token || "").trim().toLowerCase();
  if (text.length < 3) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^(보험|금융|서비스|업계|시장|소비자|보호|강화|확대|지원|관련|기준|관리|판매|상품|실적|규제|정책|회사|기업|대표|최근|오늘|이번|지난|국내|전체|분석|공시|기사|보도|뉴스|생명보험|손해보험|보험사|설계사|대리점|ga)$/i.test(text)) return false;
  return true;
}

function articleTopicSignature(article = {}) {
  const text = normalizeGroupTitle(`${article.title || ""} ${article.summary || article.description || ""}`);
  const includesAll = (terms) => terms.every((term) => text.includes(normalizeGroupTitle(term)));
  if (includesAll(["인카금융", "더헤븐", "마스터즈"])) return "event:incar-theheaven-masters";
  const gaCommissionTopic = gaCommissionRuleEventTopic(`${article.title || ""} ${article.summary || article.description || ""} ${article.keyword || ""}`);
  if (gaCommissionTopic) return `event:${gaCommissionTopic}`;
  const insuranceFraudTopic = insuranceFraudEventTopic(text);
  if (insuranceFraudTopic) return `event:${insuranceFraudTopic}`;
  if (text.includes("브랜드평판")) {
    const leader = brandReputationLeaderName(article);
    if (leader) return `브랜드평판-${normalizeGroupTitle(leader)}`;
  }
  if (
    (text.includes("금감원") || text.includes("금융감독원")) &&
    (text.includes("8대 금융지주") || text.includes("8대 지주") || text.includes("금융지주")) &&
    (text.includes("소비자보호") || text.includes("소비자 중심") || text.includes("금융문화"))
  ) {
    return "금감원-금융지주-소비자보호";
  }
  if (includesAll(["홍콩els", "제재"])) return "홍콩els-제재";
  if (includesAll(["신협", "특혜대출"])) return "신협-특혜대출";
  if (includesAll(["신협", "부실채권"])) return "신협-부실채권";
  if (includesAll(["소비자보호", "금융현장"]) && (text.includes("금감원") || text.includes("금융감독원"))) return "금감원-소비자보호-현장";
  if (includesAll(["롯데손해보험", "경영개선계획"])) return "롯데손해보험-경영개선계획";
  if (includesAll(["인카금융서비스", "우수인증설계사"])) return "인카금융서비스-우수인증설계사";
  if (includesAll(["정착지원금", "인카금융서비스"])) return "ga-정착지원금-인카";
  if (text.includes("투자의견") && (text.includes("하향") || text.includes("낮아")) && (text.includes("인카") || (text.includes("코스피") && text.includes("증권가")))) {
    return "인카금융서비스-투자의견-하향";
  }
  return "";
}

function normalizeGroupTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]|\([^)]*\)|<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(단독|종합|속보|영상|포토|인터뷰|기획|칼럼)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleTokens(value) {
  const stop = new Set([
    "기자", "뉴스", "보도", "관련", "통해", "대한", "위해", "올해", "지난", "이번", "추진", "확산", "맞손", "역량", "마음", "지원", "강화", "본격화",
    "보험", "금융", "서비스", "손해보험", "생명보험", "보험사", "금융위", "금감원", "금융감독원", "금융위원회", "소비자", "협회", "업계", "동향", "기사", "발간", "출시", "시장", "관리", "확대", "개최", "결정", "nbsp",
  ]);
  return normalizeGroupTitle(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stop.has(token) && !/^\d+$/.test(token));
}

function tokenOverlapRatio(aSet, bSet) {
  if (!aSet?.size || !bSet?.size) return 0;
  let common = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) common += 1;
  });
  return common / Math.min(aSet.size, bSet.size);
}

function sharedLongToken(aTokens, bTokens) {
  const bSet = new Set(bTokens);
  return aTokens.some((token) => token.length >= 5 && bSet.has(token));
}

function sharedTokenCount(aTokens = [], bTokens = []) {
  const bSet = new Set(bTokens);
  return unique(aTokens).filter((token) => bSet.has(token)).length;
}

function compareArticleImportance(a, b) {
  const toneOrder = { 부정: 4, 주의: 3, 긍정: 2, 중립: 1, 제외: 0 };
  const toneDiff = (toneOrder[b.tone] || 0) - (toneOrder[a.tone] || 0);
  if (toneDiff) return toneDiff;
  const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDiff) return scoreDiff;
  return articleTimeValue(b) - articleTimeValue(a);
}

function sortToneLabels(values) {
  return unique(values).sort((a, b) => {
    const orderDiff = (TONE_SORT_WEIGHT.get(a) ?? 99) - (TONE_SORT_WEIGHT.get(b) ?? 99);
    return orderDiff || String(a).localeCompare(String(b), "ko-KR");
  });
}

function articleTimeValue(article) {
  const value = article.pubDate || article.pub_date || `${article.date || ""}T${article.time || "00:00"}:00+09:00`;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function selectDashboardKeywords(rows = []) {
  const fromData = rows
    .filter((row) => row?.enabled !== false && row?.keyword)
    .map((row) => String(row.keyword).trim())
    .filter(Boolean);
  const fallback = keywordGroups.flatMap((group) => group.keywords);
  const sourceKeywords = unique(fromData.length ? fromData : fallback);
  const peerKeywords = sourceKeywords.filter((keyword) => !isOwnDashboardKeyword(keyword));
  return [OWN_DASHBOARD_KEYWORD, ...peerKeywords].slice(0, 10);
}

function buildKeywordFlow(articles = [], keywords = []) {
  return keywords.map((keyword) => ({
    name: keyword,
    keyword,
    value: articles.filter((article) => articleMatchesKeyword(article, keyword)).length,
  }));
}

function articleMatchesKeyword(article, keyword) {
  const normalizedKeyword = normalizeKeywordText(keyword);
  const articleKeyword = normalizeKeywordText(article.keyword || "");
  if (!normalizedKeyword) return false;
  if (isOwnDashboardKeyword(keyword)) {
    const haystack = normalizeKeywordText(`${article.title || ""} ${article.summary || ""} ${article.description || ""} ${article.keyword || ""}`);
    return isOwnArticle(article) || OWN_DASHBOARD_KEYWORD_ALIASES.some((alias) => haystack.includes(normalizeKeywordText(alias)));
  }
  if (articleKeyword === normalizedKeyword) return true;
  const haystack = normalizeKeywordText(`${article.title || ""} ${article.summary || ""} ${article.keyword || ""}`);
  if (haystack.includes(normalizedKeyword)) return true;
  const tokens = normalizedKeyword.split(" ").filter((token) => token.length > 1);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
}

function buildDateRangeToneTrend(articles, start = "", end = "", maxDays = 90, fallback = []) {
  const normalized = normalizeAnalysisDateRange(start, end, maxDays);
  if (!normalized.start || !normalized.end) return buildDailyToneTrend(articles, Math.min(maxDays || 30, 90), fallback);
  const buckets = new Map();
  let cursor = normalized.start;
  while (cursor && cursor <= normalized.end) {
    buckets.set(cursor, { date: cursor.slice(5), positive: 0, negative: 0, caution: 0, neutral: 0 });
    cursor = addDaysToDateKey(cursor, 1);
  }
  articles.forEach((article) => {
    const key = rowDateKey(article);
    if (!key || key < normalized.start || key > normalized.end) return;
    addToneToBucket(buckets.get(key), article.tone);
  });
  const rows = Array.from(buckets.values());
  return rows.some(hasToneSignal) ? rows : ensureTrendHasTone(fallback);
}

const OWN_DASHBOARD_KEYWORD = "인카금융서비스";
const OWN_DASHBOARD_KEYWORD_ALIASES = ["인카금융서비스", "인카금융", "에인카"];

function isOwnDashboardKeyword(keyword = "") {
  const normalized = normalizeKeywordText(keyword);
  return OWN_DASHBOARD_KEYWORD_ALIASES.some((alias) => normalized.includes(normalizeKeywordText(alias)));
}

function normalizeKeywordText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupArticles(articles, key) {
  const counts = new Map();
  articles.forEach((article) => {
    const value = article[key] || "미분류";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function isUsableArticle(article) {
  return article && article.tone !== "제외" && article.category !== "제외" && !isStockListingNoiseArticle(article) && !isExternalInsuranceNoiseArticle(article) && !isGeneralFinanceNoiseArticle(article) && !isAdminAgencyNoiseArticle(article) && !isPublicHealthInsuranceNoiseArticle(article) && !isNonInsuranceInvestmentMisconductNoiseArticle(article) && !isAmbiguousCompetitorHomonymNoiseArticle(article) && !isSportsOccupationInsuranceAgentNoiseArticle(article) && !isStockMarketSectorNoiseArticle(article) && !isEntertainmentMarketingNoiseArticle(article) && !isCelebInsuranceAgentNoiseArticle(article) && !isPoliticalMediaDigestNoiseArticle(article) && !isCommunityEventAttendeeNoiseArticle(article) && !isSportsSponsorshipIncidentalNoiseArticle(article) && !isOverseasLocalInsuranceNoiseArticle(article) && !isForeignMacroInsuranceIncidentalNoiseArticle(article) && !isExternalGeopoliticalShippingNoiseArticle(article) && !isOwnSponsoredSportsNoiseArticle(article) && !isGeneralSportsNoiseArticle(article);
}

function isUsableMonitoringArticle(article) {
  return article && !isExternalInsuranceNoiseArticle(article) && !isGeneralFinanceNoiseArticle(article) && !isAdminAgencyNoiseArticle(article) && !isPublicHealthInsuranceNoiseArticle(article) && !isNonInsuranceInvestmentMisconductNoiseArticle(article) && !isAmbiguousCompetitorHomonymNoiseArticle(article) && !isSportsOccupationInsuranceAgentNoiseArticle(article) && !isStockMarketSectorNoiseArticle(article) && !isEntertainmentMarketingNoiseArticle(article) && !isCelebInsuranceAgentNoiseArticle(article) && !isPoliticalMediaDigestNoiseArticle(article) && !isCommunityEventAttendeeNoiseArticle(article) && !isSportsSponsorshipIncidentalNoiseArticle(article) && !isOverseasLocalInsuranceNoiseArticle(article) && !isForeignMacroInsuranceIncidentalNoiseArticle(article) && !isExternalGeopoliticalShippingNoiseArticle(article) && !isOwnSponsoredSportsNoiseArticle(article) && !isStockListingNoiseArticle(article) && !isGeneralSportsNoiseArticle(article);
}

function isOwnArticle(article) {
  if (isStockListingNoiseArticle(article)) return false;
  if (isGeneralFinanceNoiseArticle(article)) return false;
  if (isAdminAgencyNoiseArticle(article)) return false;
  if (isPublicHealthInsuranceNoiseArticle(article)) return false;
  if (isNonInsuranceInvestmentMisconductNoiseArticle(article)) return false;
  if (isAmbiguousCompetitorHomonymNoiseArticle(article)) return false;
  if (isSportsOccupationInsuranceAgentNoiseArticle(article)) return false;
  if (isStockMarketSectorNoiseArticle(article)) return false;
  if (isEntertainmentMarketingNoiseArticle(article)) return false;
  if (isCelebInsuranceAgentNoiseArticle(article)) return false;
  if (isPoliticalMediaDigestNoiseArticle(article)) return false;
  if (isCommunityEventAttendeeNoiseArticle(article)) return false;
  if (isSportsSponsorshipIncidentalNoiseArticle(article)) return false;
  if (isOverseasLocalInsuranceNoiseArticle(article)) return false;
  if (isForeignMacroInsuranceIncidentalNoiseArticle(article)) return false;
  if (isExternalGeopoliticalShippingNoiseArticle(article)) return false;
  if (isOwnSponsoredSportsNoiseArticle(article)) return false;
  if (article?.ownMentioned === true || article?.aiContext?.ownMentioned === true) return true;
  return hasOwnArticleEvidence(article);
}

function hasOwnArticleEvidence(article = {}) {
  const raw = article.raw && typeof article.raw === "object" ? article.raw : {};
  const text = [
    article.title,
    article.description,
    article.summary,
    article.content,
    article.body,
    raw.title,
    raw.description,
    raw.content,
    raw.body,
  ].map((value) => String(value || "")).join(" ");
  return /인카금융서비스|인카금융/i.test(text);
}

function hasOwnReference(value = "") {
  return /인카금융서비스|인카금융|당사/i.test(String(value || ""));
}

function removeUnsupportedOwnReferences(item = {}, lines = []) {
  if (hasOwnArticleEvidence(item)) return lines;
  return lines.filter((line) => !hasOwnReference(line));
}

function isStockListingNoiseArticle(article = {}) {
  const title = String(article.title || "");
  const sourceLink = `${article.source || ""} ${article.link || ""}`.toLowerCase();
  const text = `${title} ${sourceLink} ${article.summary || ""} ${article.description || ""} ${article.keyword || ""}`;
  const stockListingTitle = /(?:\[?52주\]?\s*)?(?:최저가|최고가)|장중\s*(?:신저가|신고가)|강세\s*토픽|약세\s*토픽|특징주|오전\s*이슈\s*\[보험\]|\[리스트\]|MVP\s*상위|상위\s*\d+\s*선/.test(title);
  const isItoozaListing = sourceLink.includes("itooza") && /52주|최고가|최저가|MVP|리스트|상위\s*\d+\s*선/.test(title);
  if (!stockListingTitle && !isItoozaListing) {
    return false;
  }
  if (/인카금융서비스|인카금융/.test(title) && /투자의견|목표주가|목표가|증권가|리포트|애널리스트/.test(text)) {
    return false;
  }
  return true;
}

function isGeneralSportsNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasSportsSignal = /프로야구|프로농구|프로배구|KBO|키움\s*감독|두산|마무리\s*투수|더블\s*스토퍼|선발투수|타자|홈런|연패|승리투수|골프청사진|MT포토|티샷|버디|스윙|월드컵|축구|야구|농구|배구|골프|KLPGA|US오픈|우천취소|구장|경기\s*진행|비거리|스포츠\s*바|비키니\s*미녀|황금\s*패치/.test(text);
  const hasBusinessSignal = /인카금융서비스|인카금융|생명보험|손해보험|보험대리점|법인보험대리점|보험설계사|GA|금감원|금융감독원|금융위|금융위원회|불완전판매|보험사기|보험금|보험료/.test(text);
  return hasSportsSignal && !hasBusinessSignal;
}

function isGeneralFinanceNoiseArticle(article = {}) {
  const text = sourceEvidenceHaystack(article);
  const hasFinanceNoise = /한양증권|중앙일보|하나은행|은행권|카드사?|롯데카드|신용카드|한국투자증권|투자증권|증권사|금융투자|저축은행|새마을금고|어음|최종부도|부도\s*처리|워크아웃|환율|외환시장|코스피|코스닥|사이드카|채권시장|가계대출|주택담보대출|부동산|대부업|캐피탈|가상자산|코인|핀테크|전자금융/.test(text);
  const hasInsuranceGaContext = /인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|1200%|정착지원금|판매수수료|부당승환|승환계약/.test(text);
  return hasFinanceNoise && !hasInsuranceGaContext;
}

function hasMaterialInsuranceGaContext(article = {}) {
  const text = sourceEvidenceHaystack(article);
  return /인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|1200%|정착지원금|판매수수료|수수료\s*개편|부당승환|승환계약/.test(text);
}

function isNonInsuranceFinancialRegulatoryArticle(article = {}) {
  const text = sourceEvidenceHaystack(article);
  const hasRegulatorySignal = /금융위|금융위원회|금감원|금융감독원|제재|제재심|검사|감독|금융보안|해킹|내부통제|보고의무|공시제도|개정\s*상법/.test(text);
  const hasNonInsuranceSector = /카드사?|롯데카드|신용카드|은행권?|은행업|한국투자증권|투자증권|증권사|금융투자|저축은행|새마을금고|가계대출|주택담보대출|부동산|대부업|캐피탈|가상자산|코인|핀테크|전자금융|PG사|결제대행/.test(text);
  return hasRegulatorySignal && hasNonInsuranceSector && !hasMaterialInsuranceGaContext(article);
}

function isAdminAgencyNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasAdminNoise = /선관위|선거관리위원회|정부\s*위원회|위원회\s*수당|셀프증액|공공기관\s*경영평가|금융\s*공공기관\s*경영평가|예금보험공사|주택금융공사|주금공|신용보증기금|신보/.test(text);
  const hasMaterialInsuranceGaContext = /인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|불완전판매|보험사기|보험금|보험료|실손|손해율|판매채널|보장|민원|소비자보호|금융소비자|1200%|정착지원금|금감원|금융감독원/.test(text);
  return hasAdminNoise && !hasMaterialInsuranceGaContext;
}

function isPublicHealthInsuranceNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasPublicHealthInsuranceNoise = /국민건강보험공단|건강보험공단|복지부|보건복지부|건강보험\s*부당\s*청구|가짜진료|요양급여|진료행위|환수\s*금액|신고\s*포상금/.test(text);
  const hasPrivateInsuranceContext = /인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금/.test(text);
  return hasPublicHealthInsuranceNoise && !hasPrivateInsuranceContext;
}

function isNonInsuranceInvestmentMisconductNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasPrivateInsuranceContext = /인카금융|생명보험|손해보험|보험사|보험회사|보험업계|보험상품|보험계약|보험대리점|법인보험대리점|보험설계사|GA|보험GA|설계사|보험업법|보험사기|보험금|보험료|실손|손해율|판매채널|1200%|정착지원금/.test(text);
  const hasInvestmentMisconduct = /미래에셋|미래에셋증권|스페이스X|전문투자자|사채관리회사|회사채|채권자|증권사|금융투자|ELS|홍콩ELS|공모펀드/.test(text)
    && /불완전판매|내부통제|고객보호|투자자\s*보호|전문투자자|회사채|사채관리회사|미배정|제재/.test(text);
  return hasInvestmentMisconduct && !hasPrivateInsuranceContext;
}

function isAmbiguousCompetitorHomonymNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasHomonymNoise = /메가박스|메가박스중앙|메가커피|메가MGC|메가스터디|메가\s*히트|메가\s*런치|메가\s*세일|메가\s*이벤트/.test(text);
  const hasGaCompetitorContext = /메가금융서비스|보험대리점|법인보험대리점|보험설계사|보험GA|GA|손해보험|생명보험/.test(text);
  return hasHomonymNoise && !hasGaCompetitorContext;
}

function isSportsOccupationInsuranceAgentNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasSportsContext = /손흥민|이강인|축구|월드컵|A매치|옐로카드|레드카드|퇴장|주심|심판|파울|경고|PSG|파리생제르맹/.test(text);
  const hasOccupationOnly = /보험설계사(?:로\s*알려진|인|로서|라는)\s*(?:테헤라\s*)?(?:주심|심판)|(?:주심|심판)[^.。!?]{0,30}보험설계사/.test(text);
  const hasInsuranceBusinessContext = /보험대리점|법인보험대리점|보험GA|GA|생명보험|손해보험|보험회사|보험업계|보험상품|보험계약|불완전판매|보험사기/.test(text);
  return hasSportsContext && hasOccupationOnly && !hasInsuranceBusinessContext;
}

function isStockMarketSectorNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasMarketNoise = /코스피|코스닥|공매도|지수선물|옵션|마감시황|장중\s*최고치|하락\s*출발|상승폭\s*반납|순매수|업종별|테마별|등락률|생명보험\(\+|손해보험\(\+|보험지수/.test(text);
  const hasInsuranceSectorFocus = /보험주|보험지수|손해보험업종|생명보험업종|주주환원|보험업종/.test(text);
  return hasMarketNoise && /생명보험|손해보험|보험사|보험업종|보험지수/.test(text) && !hasInsuranceSectorFocus;
}

function isEntertainmentMarketingNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasEntertainmentMarketing = /KT|위즈파크|뮤지컬|그날들|캠핑존|초청|충성\s*고객|프로야구\s*시즌|장기\s*고객|콘서트|팬미팅/.test(text);
  return hasEntertainmentMarketing && !/인카금융|보험|GA|법인보험대리점|보험대리점|설계사/.test(text);
}

function isCelebInsuranceAgentNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasCelebrity = /조민아|쥬얼리|서인영|셀럽|싱글맘|인스타그램|SNS|좋아요|보험왕|연예인|가수|방송인/.test(text);
  const hasAgentPerformance = /보험\s*설계사|보험왕|MVP|QUEEN|수상|근황/.test(text);
  const hasBusinessContext = /보험대리점|법인보험대리점|GA|보험GA|영업조직|불완전판매|소비자보호|보험업계/.test(text);
  return hasCelebrity && hasAgentPerformance && !hasBusinessContext;
}

function isPoliticalMediaDigestNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasPoliticalMedia = /지지율|국힘|민주당|부정선거론|민심|정치권|선거|대통령|중앙일보\s+민심|신문\s*사설|데스크\s*칼럼/.test(text);
  return hasPoliticalMedia && !/인카금융|보험대리점|법인보험대리점|GA|보험GA|생명보험|손해보험|보험사기|보험금|실손|1200%|정착지원금/.test(text);
}

function isCommunityEventAttendeeNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasCommunityEvent = /도민회|향우회|이[·ㆍ]?취임식|취임식|축하연|당선인|지방선거|구청장|도의원|주요\s*인사|자리를\s*빛냈/.test(text);
  return hasCommunityEvent && !/보험상품|보험계약|보험금|보험료|손해율|실손|보험사기|업무협약|캠페인|출시|판매|소비자보호|인카금융/.test(text);
}

function isSportsSponsorshipIncidentalNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasSportsSponsorship = /월드컵|거리응원|치킨집|축구|국가대표팀|프로야구|KBO|스포츠마케팅|팬심|팬덤|하루틴|골프청사진|티샷|공동\s*선두/.test(text);
  if (!hasSportsSponsorship) return false;
  if (/인카금융|보험대리점|법인보험대리점|보험GA|GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기/.test(text)) return false;
  return /교보생명|KB금융|DB손해보험|손해보험|생명보험|보험업계|보험사/.test(text)
    && /공식\s*파트너|파트너|캠페인|후원|협찬|이모저모|거리응원|팬심|팬덤|티샷|공동\s*선두|라운드/.test(text);
}

function isOverseasLocalInsuranceNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasOverseasLocal = /미주중앙일보|JPA\s*Adjusters|Adjusters\s*&\s*Associates|어저스터|침수[·ㆍ]화재|보험사가\s*놓친\s*피해|미주|LA|뉴욕/.test(text);
  return hasOverseasLocal && !/인카금융|국내\s*보험|금융감독원|금감원|금융위원회|금융위|GA|보험대리점|법인보험대리점|실손|1200%|정착지원금/.test(text);
}

function isForeignMacroInsuranceIncidentalNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasForeignMacro = /대만|해외투자소득|환율\s*안정|해외서\s*돈\s*벌어도|생명보험사를\s*중심으로\s*한\s*증권투자|중앙은행|수출업체/.test(text);
  return hasForeignMacro && !/인카금융|국내\s*보험|보험대리점|법인보험대리점|GA|보험설계사|실손|1200%|정착지원금|불완전판매|보험사기/.test(text);
}

function isExternalGeopoliticalShippingNoiseArticle(article = {}) {
  const text = originalArticleHaystack(article);
  const hasShippingSignal = /호르무즈|이란|해협|유조선|해운|선박|통항|해상통항|해상\s*통항|중동|원유/.test(text);
  const hasShippingInsuranceContext = /보험|보험사|보험업계|해운[·ㆍ]보험업계|안전항로|유료\s*호위|위험해역|국제해사기구|IMO|보험\s*약관/.test(text);
  return hasShippingSignal && hasShippingInsuranceContext && !/인카금융|보험대리점|법인보험대리점|보험GA|보험설계사|설계사|1200%|정착지원금|불완전판매|보험사기|실손|손해율/.test(text);
}

function categoryPresetFor(value) {
  const raw = String(value || "").trim().toLowerCase();
  const preset = {
    own: "당사",
    sponsorship: "스폰서십",
    competitor: "GA",
    industry: "보험사",
    regulation: "정책/규제",
    exclude: "제외",
    other: "기타",
  }[raw];
  if (preset) return preset;
  if (/브랜드|스폰서|후원|sponsor/i.test(value)) return "스폰서십";
  if (/GA|경쟁사/i.test(value)) return "GA";
  if (/보험사|보험/i.test(value)) return "보험사";
  if (/당사|인카/i.test(value)) return "당사";
  if (/정책|규제/i.test(value)) return "정책/규제";
  if (/제외|노이즈/i.test(value)) return "제외";
  return value;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString("ko-KR")}만원`;
  return `${amount.toLocaleString("ko-KR")}원`;
}

function composeRealtimeData(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const realtimeArticles = filterRowsByPeriod(articles, "daily");
  if (!realtimeArticles.length) {
    return buildDisconnectedPeriodData(base, "당일 기준으로 표시할 운영 기사가 없습니다.");
  }
  return {
    ...composePeriodData(base, realtimeArticles, [], true),
    label: "대시보드",
    scope: realtimeArticles[0]?.date ? `${realtimeArticles[0].date} 당일 기사` : "당일 기사",
  };
}

createRoot(document.getElementById("root")).render(<App />);

