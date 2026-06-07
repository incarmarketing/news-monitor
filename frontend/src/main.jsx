import React, { useEffect, useMemo, useRef, useState } from "react";
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
  deleteReporterProfile,
  loadOperationalData,
  saveClassificationFeedback,
  saveMediaRelation,
  saveMonitorKeyword,
  savePressAlias,
  saveReporterProfile,
  triggerNewsCollection,
  verifyDashboardLogin,
} from "./liveData";
import "./styles.css";

const navIcons = {
  overview: LayoutDashboard,
  monitoring: Search,
  regulators: FileText,
  media: LineChart,
  scraps: Bookmark,
  risk: ShieldCheck,
  reports: FileText,
  management: Settings,
};

const chartColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];
const TONE_FILTER_OPTIONS = ["긍정", "중립", "주의", "부정", "제외"];
const TONE_SORT_WEIGHT = new Map(TONE_FILTER_OPTIONS.map((label, index) => [label, index]));
const GITHUB_REPO = "incarmarketing/news-monitor";
const WORKFLOW_HEALTH_TARGETS = [
  { id: "negative-watch.yml", label: "부정기사 감시" },
  { id: "news-briefing.yml", label: "보고서 생성·발송" },
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

function readInitialRoute() {
  const fallback = { section: "overview", monitoringPreset: null };
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("section") || params.get("view") || "";
  const monitoringPreset = buildMonitoringPresetFromParams(params);
  const section = navItems.some((item) => item.id === requested)
    ? requested
    : monitoringPreset
      ? "monitoring"
      : "overview";
  return { section, monitoringPreset };
}

function buildMonitoringPresetFromParams(params) {
  const query = (params.get("query") || params.get("q") || "").trim();
  const tone = normalizeDeepLinkTone(params.get("tone"));
  const category = normalizeDeepLinkCategory(params.get("category"));
  const source = (params.get("source") || "").trim();
  if (!query && !tone && !category && !source) return null;
  return {
    query,
    tone: tone || "all",
    category: category || "all",
    source: source || "all",
    stamp: Date.now(),
  };
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
    "당사": "당사",
    "ga": "GA",
    "보험사": "보험사",
    "정책/규제": "정책/규제",
  }[category] || "";
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

  const clearWorkTimers = () => {
    workTimers.current.forEach((timer) => window.clearTimeout(timer));
    workTimers.current = [];
  };

  const finishWorkStatus = (label) => {
    setWorking(true);
    setWorkLabel(`${label} 완료`);
    clearWorkTimers();
    workTimers.current.push(window.setTimeout(() => {
      setWorking(false);
      setWorkLabel("");
    }, 7000));
  };

  const refreshOperations = async (options = {}) => {
    const trigger = options.trigger === true;
    const label = options.label || (options.workflow === "regulator-releases.yml" ? "금융당국 보도자료 갱신" : "뉴스 수집·분석 갱신");
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
        await triggerNewsCollection({
          workflow: options.workflow || "news-briefing.yml",
          period_reports: "none",
          send_kakao: false,
          report_slot: "auto",
          source: options.source || "dashboard_manual_refresh",
        });
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
      setWorkLabel(`${label} 반영 대기 중`);
      workTimers.current.push(window.setTimeout(async () => {
        setWorkLabel(`${label} 반영 확인 중`);
        const delayed = await loadOperationalData();
        setOperations({ ...delayed, message: `${label} 반영 확인 중 · ${delayed.message}` });
      }, 20000));
      workTimers.current.push(window.setTimeout(async () => {
        setWorkLabel(`${label} 최종 확인 중`);
        const delayed = await loadOperationalData();
        setOperations(delayed);
        finishWorkStatus(label);
      }, 60000));
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

  const baseData = periodData[period];
  const scopedArticles = useMemo(
    () => filterArticlesByPeriod(operations.articles || [], period),
    [operations.articles, period],
  );
  const scopedReportRuns = useMemo(
    () => filterRowsByPeriod(operations.reportRuns || [], period),
    [operations.reportRuns, period],
  );
  const liveConnected = operations.status === "live";
  const allArticles = liveConnected ? operations.articles || [] : [];
  const scraps = liveConnected ? operations.scraps || [] : [];
  const data = useMemo(
    () => composePeriodData(baseData, scopedArticles, scopedReportRuns, liveConnected),
    [baseData, scopedArticles, scopedReportRuns, liveConnected],
  );
  const realtimeArticles = useMemo(
    () => selectRealtimeArticles(allArticles),
    [allArticles],
  );
  const realtimeData = useMemo(
    () => composeRealtimeData(periodData.daily, realtimeArticles, liveConnected),
    [realtimeArticles, liveConnected],
  );
  const management = useMemo(
    () => composeManagementData(operations, liveConnected ? operations.articles || [] : scopedArticles),
    [operations, scopedArticles, liveConnected],
  );
  const notifications = liveConnected ? operations.notifications || [] : [];
  const jobs = liveConnected && operations.watchRuns?.length
    ? [
        {
          label: "부정기사 감시",
          cadence: "24시간 · 5분",
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

  const View = {
    overview: Overview,
    monitoring: Monitoring,
    regulators: Regulators,
    media: MediaAnalysis,
    scraps: Scraps,
    risk: RiskCenterV2,
    reports: Reports,
    management: Management,
  }[activeSection] || Overview;

  return (
    <div className="app-shell">
      <Header working={working} workLabel={workLabel} />
      <aside className="side-nav" aria-label="주요 메뉴">
        <div className="side-title">Menu</div>
        {navItems.map((item) => {
          const Icon = navIcons[item.id] || FileText;
          return (
            <button
              type="button"
              key={item.id}
              className={activeSection === item.id ? "active" : ""}
              onClick={() => setActiveSection(item.id)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>
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
        workflowHealth={workflowHealth}
        isWorking={working}
        onRefreshOperations={refreshOperations}
        setActiveSection={setActiveSection}
        monitoringPreset={monitoringPreset}
        onOpenMonitoring={openMonitoring}
      />
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
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">IN</div>
        <div>
          <strong>인카 언론 모니터링</strong>
          <span>실시간 기사 · 보고서 · 운영 관리</span>
        </div>
      </div>
      <div className="header-user-area">
        {working && <span className="work-status">작업 중{workLabel ? ` · ${workLabel}` : ""}</span>}
        <div className="user-chip">
          <span>{userText}</span>
        </div>
      </div>
    </header>
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
        <p>기존 대시보드와 같은 사번 로그인으로 실시간 기사, 언론사, 기자, 광고비 데이터를 불러옵니다.</p>
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
      workflowHealth,
    }),
    [operations, notifications, workflowHealth],
  );
  const watchHealth = operationsHealth.items.find((item) => item.title === "부정기사 감시");
  const reportHealth = operationsHealth.items.find((item) => item.title === "일일보고서");
  const notificationHealth = operationsHealth.items.find((item) => item.title === "알림톡");
  const actionsHealth = operationsHealth.items.find((item) => item.title === "GitHub Actions");
  const historyHealth = operationsHealth.items.find((item) => item.title === "Supabase 기록");
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${data.label} · ${data.scope}`}
        title="실시간 대시보드"
        description="검색 키워드 기준 최신 이슈, 당사 리스크, 알림톡, 보고서 생성 상태를 5분 단위로 확인합니다."
        right={(
          <button
            type="button"
            className="ghost-button"
            onClick={() => onRefreshOperations?.({ trigger: true, source: "overview_issues" })}
            disabled={isLoading}
          >
            <RefreshCw />갱신
          </button>
        )}
      />

      <section className="overview-command">
        <div className="overview-command-main">
          <span className="live-label"><span /> LIVE MEDIA BRIEFING</span>
          <h2>{summary.headline}</h2>
          <p>{data.scope} · {data.generatedAt || summary.watchTime || "-"}</p>
        </div>
      </section>

      <section className="overview-kpi-shelf">
        <KpiGrid summary={summary} onOpenMonitoring={onOpenMonitoring} />
      </section>

      <section className="dashboard-grid">
        <div className="main-column">
          <Panel title="주요 이슈" icon={Newspaper} meta="키워드 기준 5분 갱신">
            <IssueList issues={data.issues} />
          </Panel>
        </div>
        <div className="middle-column">
          <Panel title="분류별 기사량" icon={LineChart} meta="기간 기준">
            <CategoryChart rows={data.categoryFlow} verticalBars />
          </Panel>
          <Panel title="언론사 영향도" icon={Building2} meta="노출량 · 당사 · 부정">
            <PressInfluence rows={data.pressInfluence} onOpenMonitoring={onOpenMonitoring} />
          </Panel>
        </div>
        <div className="side-column">
          <WatchPanel jobs={jobs} risk={summary.risk} health={watchHealth} />
          <AiUsagePanel status={operations?.aiStatus} />
          <Panel title="알림톡 발송 이력" icon={Bell} meta={`최근 ${notifications.length.toLocaleString("ko-KR")}건`}>
            <NotificationStatusSummary health={notificationHealth} total={notifications.length} />
            <NotificationList rows={notifications} />
          </Panel>
          <Panel title="보고서 자동화" icon={CalendarDays} meta="일 3회">
            <ReportAutomationStatus reportHealth={reportHealth} actionsHealth={actionsHealth} historyHealth={historyHealth} />
          </Panel>
        </div>
      </section>

    </main>
  );
}

function Monitoring({ data, articles, monitoringPreset, operations, isWorking, onRefreshOperations }) {
  const regularArticles = useMemo(
    () => articles.filter((article) => !isOfficialRegulatorSource(article.source)),
    [articles],
  );
  const latestDate = useMemo(() => latestArticleDate(regularArticles), [regularArticles]);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [tone, setTone] = useState("all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [viewMode, setViewMode] = useState("related");
  const [visible, setVisible] = useState(30);
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const sources = useMemo(() => unique(regularArticles.map((article) => article.source)).slice(0, 80), [regularArticles]);
  const categories = useMemo(() => unique(regularArticles.map((article) => article.category)).slice(0, 40), [regularArticles]);
  useEffect(() => {
    if (!latestDate || startDateInput || endDateInput || startDate || endDate) return;
    setStartDateInput(latestDate);
    setEndDateInput(latestDate);
    setStartDate(latestDate);
    setEndDate(latestDate);
  }, [endDate, endDateInput, latestDate, startDate, startDateInput]);
  useEffect(() => {
    if (!monitoringPreset) return;
    setQuery(monitoringPreset.query || "");
    setQueryInput(monitoringPreset.query || "");
    setTone(monitoringPreset.tone || "all");
    setCategory(monitoringPreset.category || "all");
    setSource(monitoringPreset.source || "all");
    const range = resolveMonitoringDateRange(regularArticles, monitoringPreset);
    if (range.start || range.end) {
      setStartDateInput(range.start);
      setEndDateInput(range.end);
      setStartDate(range.start);
      setEndDate(range.end);
    }
    setVisible(30);
  }, [monitoringPreset, regularArticles]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return regularArticles.filter((article) => {
      const text = `${article.title} ${article.source} ${article.keyword} ${article.summary}`.toLowerCase();
      const articleDate = article.date || "";
      return (
        (!needle || text.includes(needle)) &&
        (!startDate || !articleDate || articleDate >= startDate) &&
        (!endDate || !articleDate || articleDate <= endDate) &&
        (tone === "all" || article.tone === tone) &&
        (category === "all" || article.category === category) &&
        (source === "all" || article.source === source)
      );
    });
  }, [regularArticles, category, endDate, query, source, startDate, tone]);
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
  const grouped = useMemo(() => buildRelatedArticleGroups(filtered), [filtered]);
  const visibleRows = viewMode === "related" ? grouped : filtered;
  const feedMeta = viewMode === "related"
    ? `${filtered.length.toLocaleString("ko-KR")}건 · 묶음 ${grouped.length.toLocaleString("ko-KR")}개`
    : `${filtered.length.toLocaleString("ko-KR")}건`;
  const isLoading = operations?.status === "loading" || isWorking;

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Live Monitoring"
        title="실시간 모니터링"
        description="기사 목록을 샘플 5개로 줄이지 않고, 연결 가능한 운영 기사 전체를 필터와 함께 펼쳐 봅니다."
        right={(
          <div className="page-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onRefreshOperations?.({ trigger: true, source: "monitoring_feed" })}
              disabled={isLoading}
            >
              <RefreshCw />갱신
            </button>
            <button className="primary-button"><Download />CSV 출력</button>
          </div>
        )}
      />
      <section className="filter-card">
        <label>
          <span>시작 기준일</span>
          <input type="date" value={startDateInput} onChange={(event) => setStartDateInput(event.target.value)} />
        </label>
        <label>
          <span>종료 기준일</span>
          <input type="date" value={endDateInput} onChange={(event) => setEndDateInput(event.target.value)} />
        </label>
        <button className="primary-button filter-action" onClick={applyDateFilter}>
          조회
        </button>
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
        <button className="primary-button" onClick={() => { setQuery(queryInput); setVisible(30); }}>
          검색
        </button>
        <button className="ghost-button compact-button" onClick={() => {
          setQuery("");
          setQueryInput("");
          setTone("all");
          setCategory("all");
          setSource("all");
          setViewMode("related");
          setStartDateInput(latestDate);
          setEndDateInput(latestDate);
          setStartDate(latestDate);
          setEndDate(latestDate);
          setVisible(30);
        }}>
          초기화
        </button>
      </section>
      <section className="monitoring-layout">
        <Panel title="수집 기사 피드" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed rows={visibleRows.slice(0, visible)} onFeedbackSaved={() => onRefreshOperations?.()} />
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
  const [source, setSource] = useState("all");
  const [tone, setTone] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const regulatorRows = useMemo(() => selectRegulatorRows(articles), [articles]);
  const sources = useMemo(() => unique(regulatorRows.map((article) => article.source)).slice(0, 40), [regulatorRows]);
  const tones = useMemo(() => sortToneLabels(regulatorRows.map((article) => article.tone)).slice(0, 8), [regulatorRows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return regulatorRows.filter((article) => {
      const text = `${article.title || ""} ${article.source || ""} ${article.summary || ""}`.toLowerCase();
      return (
        (!needle || text.includes(needle)) &&
        (source === "all" || article.source === source) &&
        (tone === "all" || article.tone === tone)
      );
    });
  }, [query, regulatorRows, source, tone]);
  const selectedRows = useMemo(
    () => filteredRows.filter((article) => selected.has(articleSelectionKey(article))),
    [filteredRows, selected],
  );
  const analysisRows = selectedRows.length ? selectedRows : filteredRows.slice(0, 5);
  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((article) => selected.has(articleSelectionKey(article)));
  const resetFilters = () => {
    setQuery("");
    setQueryInput("");
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
        description="금융감독원·금융위원회 보도자료를 중복 제거 기준으로 모아 정책/규제 이슈만 빠르게 확인합니다."
        right={(
          <div className="page-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onRefreshOperations?.({ trigger: true, workflow: "regulator-releases.yml", source: "regulator_releases", label: "금융당국 보도자료 갱신" })}
              disabled={operations?.status === "loading" || isWorking}
            >
              <RefreshCw />갱신
            </button>
          </div>
        )}
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
        <button className="ghost-button compact-button" onClick={resetFilters}>
          초기화
        </button>
      </section>
      <RegulatorDirectionPanel rows={analysisRows} selectedCount={selectedRows.length} totalCount={filteredRows.length} />
      <Panel title="보도자료 목록" icon={FileText} meta={`${filteredRows.length.toLocaleString("ko-KR")}건`}>
        <div className="regulator-list-actions">
          <button className="ghost-button compact-button" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? "선택 해제" : "현재 목록 선택"}
          </button>
          <span>{selectedRows.length ? `${selectedRows.length.toLocaleString("ko-KR")}건 선택 분석 중` : "선택하면 위 분석이 선택 보도자료 기준으로 바뀝니다"}</span>
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
        <h2><ShieldCheck />당국 방향성 분석</h2>
        <span>{selectedCount ? `${selectedCount.toLocaleString("ko-KR")}건 선택` : `최근 ${Math.min(totalCount, rows.length).toLocaleString("ko-KR")}건 기준`}</span>
      </div>
      <div className="regulator-analysis-body">
        <div className="regulator-analysis-lead">
          <b>{analysis.headline}</b>
          <p>{analysis.summary}</p>
          <div className="regulator-watch-list">
            <span>후속 확인 포인트</span>
            <ul>
              {analysis.watchItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
        <div className="regulator-analysis-right">
          <div className="regulator-theme-grid">
            {analysis.themes.map((theme) => (
              <article key={theme.label}>
                <span>{theme.label}</span>
                <b>{theme.count.toLocaleString("ko-KR")}건</b>
                <p>{theme.note}</p>
                {theme.examples.length > 0 && <small>{theme.examples[0]}</small>}
              </article>
            ))}
          </div>
          <div className="regulator-impact-grid">
            {analysis.impactCards.map((card) => (
              <article key={card.label}>
                <span>{card.label}</span>
                <b>{card.value}</b>
                <p>{card.detail}</p>
              </article>
            ))}
          </div>
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
                <b>{row.title}</b>
              </div>
              <span className="feed-meta">{formatFeedMeta(row, false)}</span>
              <ArticleSummaryBlock item={row} dense />
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

function MediaAnalysis({ data, period, setPeriod, articles = [], allArticles, scraps, onOpenMonitoring, operations }) {
  const periodArticles = useMemo(
    () => articles.length ? articles : filterArticlesByPeriod(allArticles || [], period),
    [articles, allArticles, period],
  );
  const trendArticles = useMemo(
    () => lastNDays(allArticles?.length ? allArticles : periodArticles, 31),
    [allArticles, periodArticles],
  );
  const analysisArticles = periodArticles.length ? periodArticles : trendArticles;
  const scopeLabel = periodScopeLabel(period);
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const dailyTrend = useMemo(
    () => buildDailyToneTrend(trendArticles, 31, data.toneTrend),
    [trendArticles, data.toneTrend],
  );
  const keywordRows = useMemo(
    () => buildKeywordFlow(analysisArticles, selectedKeywords),
    [analysisArticles, selectedKeywords],
  );
  const issueRows = useMemo(
    () => buildMediaAnalysisIssues(analysisArticles, period).slice(0, 6),
    [analysisArticles, period],
  );
  const observations = buildPeriodObservations(data, issueRows, period);
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${scopeLabel} 분석`}
        title="언론 동향 분석"
        description="일별 논조 추이, 언론사 영향도, 키워드별 기사량, 핵심 이슈를 분석 화면에서 확인합니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
          </div>
        )}
      />
      <AnalysisDrillCards data={data} onOpenMonitoring={onOpenMonitoring} />
      <section className="media-analysis-layout">
        <div className="media-analysis-column">
          <Panel title="일별 논조 추이" icon={Activity} meta="최근 31일 · 긍정/부정/주의">
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
          <Panel title="언론사 영향도" icon={Building2} meta="관리 확인 필요 매체">
            <PressInfluence rows={data.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="핵심 이슈" icon={Newspaper} meta={periodIssueMeta(period, issueRows)}>
            <MonthlyIssueDigest issues={issueRows} period={period} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function AnalysisDrillCards({ data, onOpenMonitoring }) {
  const cards = [
    { label: "부정 기사", value: `${data.summary.ownNegative}건`, tone: "negative", preset: { tone: "부정" }, detail: "즉시 확인 대상" },
    { label: "주의 기사", value: `${data.summary.caution}건`, tone: "caution", preset: { tone: "주의" }, detail: "시장성·규제성 신호" },
    { label: "긍정 기사", value: `${(data.toneTrend || []).reduce((sum, row) => sum + Number(row.positive || 0), 0)}건`, tone: "positive", preset: { tone: "긍정" }, detail: "우호 활용 후보" },
    { label: "당사 언급", value: `${data.summary.ownMentions}건`, tone: "default", preset: { category: "당사" }, detail: "보고서 필수 근거" },
    { label: "GA/보험사", value: `${data.summary.gaInsurance}건`, tone: "positive", preset: { category: "GA" }, detail: "업계 동향 기사" },
  ];
  return (
    <section className="analysis-drill-grid">
      {cards.map((card) => (
        <button key={card.label} className={`analysis-drill-card ${card.tone}`} onClick={() => onOpenMonitoring?.(card.preset)}>
          <span>{card.label}</span>
          <b>{card.value}</b>
          <em>{card.detail}</em>
        </button>
      ))}
    </section>
  );
}

function buildPeriodReportBrief(period, data, issues = [], articles = []) {
  const summary = data.summary || {};
  const ownIssues = issues.filter(isOwnArticle);
  const riskIssues = issues.filter((issue) => ["부정", "주의"].includes(issue.tone));
  const repeatedIssues = issues.filter((issue) => Number(issue.relatedCount || 1) >= 3);
  const topIssue = issues[0];
  const meta = {
    daily: {
      kicker: "Daily Desk",
      title: "오늘 확인할 이슈를 당사 언급과 즉시 리스크 중심으로 압축합니다.",
      focus: "당일 기사",
      priority: "신규 당사 언급",
      detail: "오늘 보고서와 모니터링 화면이 같은 날짜 기준으로 움직이는지 확인합니다.",
    },
    weekly: {
      kicker: "Weekly Desk",
      title: "한 주의 반복 노출, 당사 언급, 정책성 주의 신호를 묶어 봅니다.",
      focus: "7일 흐름",
      priority: "반복 노출",
      detail: "같은 이슈가 여러 매체에서 반복됐는지와 논조 이동을 우선 확인합니다.",
    },
    monthly: {
      kicker: "Monthly Desk",
      title: "월간 누적 데이터를 기준으로 리스크, 매체 영향도, 키워드 변화를 관리합니다.",
      focus: "월간 누적",
      priority: "누적 관리",
      detail: "월간 보고서는 개별 기사보다 누적 신호와 관리 대상 매체를 중심으로 봅니다.",
    },
  }[period] || {};
  const topText = topIssue?.title
    ? `대표 이슈는 "${topIssue.title}"입니다.`
    : "대표 이슈는 기간 내 기사량과 논조를 기준으로 선정합니다.";
  return {
    kicker: meta.kicker,
    title: meta.title,
    summary: `${topText} ${meta.detail}`,
    items: [
      { label: "보고 기준", value: meta.focus, detail: data.scope || data.generatedAt || "-", tone: "neutral" },
      { label: "우선순위", value: meta.priority, detail: `당사 ${summary.ownMentions || 0}건 · 리스크 ${riskIssues.length}건`, tone: riskIssues.length ? "caution" : "positive" },
      { label: "대표 이슈", value: `${issues.length}건`, detail: `당사 ${ownIssues.length}건 · 반복 ${repeatedIssues.length}건`, tone: "default" },
      { label: "분석 기사", value: `${articles.length.toLocaleString("ko-KR")}건`, detail: "기간 필터 적용", tone: "default" },
    ],
  };
}

function PeriodReportBrief({ brief }) {
  if (!brief?.items?.length) return null;
  return (
    <section className="period-report-brief">
      <article className="period-brief-lead">
        <span>{brief.kicker}</span>
        <b>{brief.title}</b>
        <p>{brief.summary}</p>
      </article>
      <div className="period-brief-grid">
        {brief.items.map((item) => (
          <article key={item.label} className={item.tone || ""}>
            <span>{item.label}</span>
            <b>{item.value}</b>
            <em>{item.detail}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function Scraps({ scraps, onOpenMonitoring }) {
  const [prompt, setPrompt] = useState("홍보 대응 관점에서 부정 이슈와 우호적으로 활용할 수 있는 기사 흐름을 나눠 분석해줘.");
  const grouped = groupArticles(scraps, "category").slice(0, 5).map(([name, value]) => ({ name, value }));
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Scrap File"
        title="주요 기사 스크랩"
        description="중요 기사를 모아 임원 보고, 홍보 대응, 동향 점검용으로 다시 분석하는 작업 공간입니다."
        right={<button className="primary-button"><FileText />스크랩 보고서</button>}
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
          <div className="scrap-analysis-preview">
            <b>요약 초안</b>
            <p>스크랩 {scraps.length}건 중 당사 언급, 주의 이슈, 정책/GA 동향을 분리해 보고서 근거로 사용할 수 있습니다.</p>
          </div>
          <div className="scrap-actions-v2">
            <button className="primary-button">스크랩 분석</button>
            <button className="ghost-button">JSON 복사</button>
            <button className="ghost-button">결과 복사</button>
          </div>
        </Panel>
        <div className="scrap-side-stack">
          <Panel title="스크랩 분류" icon={LineChart} meta="근거 구성">
            <CategoryChart rows={grouped.length ? grouped : [{ name: "스크랩", value: scraps.length }]} mini onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="스크랩 기사 목록" icon={Newspaper} meta={`${scraps.length}건`}>
            <ArticleFeed rows={scraps} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function ScrapDigest({ scraps }) {
  const rows = scraps.slice(0, 4);
  return (
    <div className="scrap-digest">
      {rows.map((item) => (
        <article key={item.id || item.title}>
          <Bookmark />
          <div>
            <b>{item.title}</b>
            <span>{item.source} · {item.tone} · {item.scrapedAt || item.date || "-"}</span>
            <ArticleSummaryBlock item={item} dense />
          </div>
        </article>
      ))}
      {!rows.length && <p>스크랩된 기사가 없습니다.</p>}
    </div>
  );
}

function RiskCenterV2({ articles = [], allArticles = [], onRefreshOperations }) {
  const sourceArticles = allArticles.length ? allArticles : articles;
  const riskArticles = useMemo(() => selectRiskCenterArticles(sourceArticles), [sourceArticles]);
  const [draftType, setDraftType] = useState("press");
  const [articleUrl, setArticleUrl] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (articleUrl || selectedArticle || !riskArticles.length) return;
    const lead = riskArticles[0];
    setSelectedArticle(lead);
    setArticleUrl(lead.link && lead.link !== "#" ? lead.link : "");
  }, [articleUrl, selectedArticle, riskArticles]);

  const matchedArticle = findArticleByUrl(sourceArticles, articleUrl);
  const selectedUrlMatches = selectedArticle && normalizeRiskUrl(selectedArticle.link) === normalizeRiskUrl(articleUrl);
  const activeArticle = selectedUrlMatches ? selectedArticle : matchedArticle || selectedArticle || makeManualRiskArticle(articleUrl);
  const facts = buildRiskCenterFacts(activeArticle, articleUrl);
  const activeKey = articleSelectionKey(activeArticle);

  const applyArticle = (article) => {
    setSelectedArticle(article);
    setArticleUrl(article.link && article.link !== "#" ? article.link : "");
    setDraft("");
  };

  const applyUrl = (value) => {
    const nextUrl = extractFirstUrl(value) || value.trim();
    setArticleUrl(nextUrl);
    setSelectedArticle(findArticleByUrl(sourceArticles, nextUrl));
    setDraft("");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDropActive(false);
    const articleId = event.dataTransfer.getData("application/x-news-monitor-article");
    const draggedArticle = riskArticles.find((item) => articleSelectionKey(item) === articleId);
    if (draggedArticle) {
      applyArticle(draggedArticle);
      return;
    }
    const droppedUrl = event.dataTransfer.getData("text/uri-list")
      || event.dataTransfer.getData("text/plain")
      || "";
    applyUrl(droppedUrl);
  };

  const handleDragStart = (event, article) => {
    event.dataTransfer.setData("application/x-news-monitor-article", articleSelectionKey(article));
    if (article.link && article.link !== "#") {
      event.dataTransfer.setData("text/uri-list", article.link);
      event.dataTransfer.setData("text/plain", article.link);
    }
  };

  const handleGenerateDraft = () => {
    if (typeof window !== "undefined" && !window.confirm("선택한 기사 기준으로 초안을 생성할까요?")) return;
    setDraft(buildRiskResponseDraft(draftType, activeArticle, facts));
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Risk Response"
        title="리스크 대응센터"
        description="최근 부정·주의 기사와 외부 URL을 기준으로 팩트체크와 대응 초안을 관리합니다."
        right={(
          <button
            className="ghost-button"
            onClick={() => onRefreshOperations?.({ trigger: true, label: "리스크 기사 갱신", source: "risk_center_refresh" })}
          >
            <RefreshCw />갱신
          </button>
        )}
      />
      <section className="risk-layout">
        <Panel title="기사 URL / 팩트 체크" icon={ShieldCheck} meta={facts.tone || "확인"}>
          <div
            className={`url-box risk-url-drop ${dropActive ? "drop-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDrop}
          >
            <input
              value={articleUrl}
              onChange={(event) => applyUrl(event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                if (extractFirstUrl(pasted)) {
                  event.preventDefault();
                  applyUrl(pasted);
                }
              }}
              placeholder="기사 URL"
            />
            <button className="primary-button" onClick={() => applyUrl(articleUrl)}>분석</button>
          </div>
          <div className="fact-grid">
            <Fact label="핵심 주장" value={facts.claim} />
            <Fact label="당사 관련성" value={facts.relevance} />
            <Fact label="논조" value={facts.tone} />
            <Fact label="대응 강도" value={facts.intensity} />
          </div>
          <div className="risk-recent-list">
            <div className="risk-section-head">
              <b>최근 부정/주의 기사</b>
              <span>{riskArticles.length.toLocaleString("ko-KR")}건</span>
            </div>
            {riskArticles.slice(0, 8).map((article) => (
              <button
                key={articleSelectionKey(article)}
                type="button"
                draggable
                className={`risk-article-card ${activeKey === articleSelectionKey(article) ? "active" : ""}`}
                onClick={() => applyArticle(article)}
                onDragStart={(event) => handleDragStart(event, article)}
              >
                <span>
                  <Chip tone={article.tone}>{article.tone}</Chip>
                  <em>
                    {article.source} · {[article.date, article.time].filter(Boolean).join(" ") || "-"}
                    {Number(article.relatedCount || 1) > 1 ? ` · 관련 ${article.relatedCount}건` : ""}
                  </em>
                </span>
                <b>{article.title}</b>
                <ArticleSummaryBlock item={article} dense />
              </button>
            ))}
            {!riskArticles.length && (
              <div className="risk-empty">최근 부정/주의 기사 데이터가 없습니다.</div>
            )}
          </div>
        </Panel>
        <Panel title="대응 초안" icon={FilePenLine} meta={draft ? "생성 완료" : "생성 전 확인"}>
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => { setDraftType("press"); setDraft(""); }}>언론 해명용</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => { setDraftType("internal"); setDraft(""); }}>사내 해명용</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "언론 해명용 초안" : "사내 공유용 초안"}</b>
            <p>{draft || "팩트체크 내용을 확인한 뒤 초안을 생성합니다."}</p>
          </div>
          <div className="risk-actions">
            {activeArticle?.link && activeArticle.link !== "#" && (
              <a
                className="ghost-button"
                href={activeArticle.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => openArticleLink(event, activeArticle.link)}
              >
                <ExternalLink />기사 열기
              </a>
            )}
            <button className="primary-button confirm-button" onClick={handleGenerateDraft}>초안 생성</button>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function RiskCenter() {
  const [draftType, setDraftType] = useState("press");
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Risk Response"
        title="리스크 대응센터"
        description="기사 URL을 넣으면 핵심 주장, 당사 관련성, 논조를 확인하고 필요한 초안만 생성합니다."
      />
      <section className="risk-layout">
        <Panel title="기사 URL / 팩트 체크" icon={ShieldCheck} meta="생성 전 확인">
          <div className="url-box">
            <input placeholder="기사 URL을 붙여넣으세요" defaultValue="https://www.mk.co.kr/news/stock/12034143" />
            <button className="primary-button">분석</button>
          </div>
          <div className="fact-grid">
            <Fact label="핵심 주장" value="투자의견 및 목표가 조정" />
            <Fact label="당사 관련성" value="직접 언급 있음" />
            <Fact label="논조" value="주의" />
            <Fact label="대응 강도" value="모니터링 후 필요 시 확인" />
          </div>
        </Panel>
        <Panel title="대응 초안" icon={FilePenLine} meta="길이 조정">
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => setDraftType("press")}>언론 해명용</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => setDraftType("internal")}>사내 해명용</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "언론 해명용 초안" : "사내 공유용 초안"}</b>
            <p>
              해당 보도는 시장 의견과 투자 판단에 따른 기사로, 현재 확인된 범위에서는 당사 영업 및 준법 이슈와 직접 연결되는 내용은 확인되지 않았습니다.
            </p>
          </div>
          <button className="primary-button confirm-button">초안을 생성할까요?</button>
        </Panel>
      </section>
    </main>
  );
}

function selectRiskCenterArticles(articles = []) {
  const usable = articles
    .filter((article) => article?.title && article.link && article.link !== "#")
    .filter((article) => !isOfficialRegulatorSource(article.source));
  const negative = usable.filter((article) => article.tone === "부정" || String(article.riskLevel || "").toUpperCase() === "HIGH");
  const caution = usable.filter((article) => article.tone === "주의" || String(article.riskLevel || "").toUpperCase() === "MEDIUM");
  const selected = negative.length ? negative : caution;
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
      const members = [...group.members].sort(compareArticleImportance);
      const representative = members[0] || {};
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
  if (!lines.length && ranked[0]) {
    const fallback = normalizeSummaryLine(headlineBasedSummary(ranked[0]));
    if (fallback) lines.push(fallback);
  }
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
  const summaryLines = buildArticleSummaryLines(article);
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
  };
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
  const source = article.source ? `${article.source} 보도` : "해당 보도";
  const claim = facts.claim || "핵심 주장 확인이 필요합니다.";
  const relevance = facts.relevance || "관련성 확인 필요";
  if (type === "internal") {
    return [
      `공유 대상은 ${source} "${title}"입니다.`,
      `현재 분류는 ${facts.tone || "확인 필요"}이며, 당사 관련성은 ${relevance}로 확인됩니다.`,
      `핵심 쟁점은 ${claim}`,
      `사실관계, 이해관계자 영향, 추가 보도 가능성을 확인한 뒤 필요 시 대외 메시지를 별도로 정리하겠습니다.`,
    ].join("\n");
  }
  return [
    `해당 보도와 관련해 현재 확인 가능한 핵심 쟁점은 ${claim}`,
    `당사는 보도 내용 중 사실관계가 필요한 부분을 확인하고 있으며, 확인되지 않은 내용에 대해서는 단정적인 입장을 내지 않겠습니다.`,
    `소비자와 이해관계자에게 영향을 줄 수 있는 사안은 관련 기준과 절차에 따라 신속히 점검하겠습니다.`,
    `추가 확인이 완료되는 대로 필요한 범위에서 설명드리겠습니다.`,
  ].join("\n");
}

function Reports({ data, period, setPeriod, articles, scraps, onOpenMonitoring }) {
  const edition = publicationMeta(period, data);
  return (
    <main className="workspace report-workspace">
      <PageTitle
        eyebrow={edition.kicker}
        title="일간/주간/월간 보고서"
        description="일간, 주간, 월간 보고서를 A4 세로 지면 기준으로 미리 보고 인쇄/PDF로 저장합니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            <button className="primary-button" onClick={() => printCurrentView(`${edition.title} ${data.scope || ""}`)}>
              <Download />인쇄/PDF 저장
            </button>
          </div>
        )}
      />
      <A4ReportStage
        data={data}
        period={period}
        articles={articles || []}
        scraps={scraps}
        onOpenMonitoring={onOpenMonitoring}
      />
    </main>
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
  const edition = publicationMeta(period, data);
  const expandedIssues = expandReportIssues(data.issues, reportArticles, period);
  const lead = buildReportLead(period, data, reportArticles, expandedIssues);
  const secondary = expandedIssues
    .filter((issue) => !sameIssue(issue, lead))
    .slice(0, period === "daily" ? 4 : 6);
  const reportTrend = trendRows?.length
    ? trendRows.slice(-(period === "daily" ? 10 : 31))
    : buildDailyToneTrend(reportArticles, period === "daily" ? 10 : 31, data.toneTrend);
  const reportKeywords = keywordRows?.length
    ? keywordRows
    : buildKeywordFlow(reportArticles, selectDashboardKeywords()).slice(0, 10);

  return (
    <section className={`a4-report-stage ${embedded ? "embedded" : "standalone"}`}>
      <div className="a4-report-stage-head no-print">
        <span>A4 세로 출력 미리보기</span>
        <b>{periodScopeLabel(period)} 보고서</b>
        <em>인쇄/PDF 저장 시 이 지면만 출력됩니다.</em>
      </div>
      <A4ReportSheet
        data={data}
        period={period}
        edition={edition}
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
  lead,
  issues = [],
  articles = [],
  trendRows = [],
  keywordRows = [],
  scraps = [],
  onOpenMonitoring,
}) {
  const summary = data.summary || {};
  const insightLines = buildA4ReportInsights(period, data, lead, issues, articles);
  const stats = buildA4ReportStats(summary, articles);
  const pressRows = (data.pressInfluence || []).filter((item) => !isOfficialRegulatorSource(item.source)).slice(0, 5);
  const scrapRows = period === "daily" ? [] : scraps.slice(0, 3);
  const observationRows = buildA4ObservationRows(period, data, lead, issues, articles, keywordRows, pressRows);
  const toneRows = buildA4ToneLedger(articles);
  return (
    <article className={`a4-report-sheet ${period}`}>
      <header className="a4-masthead">
        <div className="a4-topline">
          <span>{edition.issue}</span>
          <span>{data.scope || data.generatedAt || "-"}</span>
          <span>INCAR MEDIA DESK</span>
        </div>
        <div className="a4-title-row">
          <div>
            <p>{edition.kicker}</p>
            <h2>{edition.title}</h2>
            <em>{edition.subtitle}</em>
          </div>
          <div className={`a4-risk-badge ${String(summary.risk || "LOW").toLowerCase()}`}>
            <span>Risk</span>
            <b>{summary.risk || "LOW"}</b>
          </div>
        </div>
        <A4MetricStrip stats={stats} onOpenMonitoring={onOpenMonitoring} />
      </header>

      <section className="a4-front">
        <article className="a4-lead">
          <span>Front Page</span>
          <h3>{lead?.title || summary.headline || "기간 대표 이슈"}</h3>
          <ArticleSummaryBlock
            item={lead || { title: summary.headline, summary: summary.headline, category: data.label, tone: summary.risk === "LOW" ? "중립" : "주의" }}
            dense
          />
          <div className="a4-article-meta">
            {lead?.tone && <Chip tone={lead.tone}>{lead.tone}</Chip>}
            {lead?.category && <Chip>{lead.category}</Chip>}
            <span>{formatA4ArticleMeta(lead, data.scope)}</span>
            {lead?.link && lead.link !== "#" && (
              <a href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
                기사 열기
              </a>
            )}
          </div>
        </article>
        <aside className="a4-insight">
          <span>Brief</span>
          {insightLines.map((line) => <p key={line}>{line}</p>)}
        </aside>
      </section>

      <section className="a4-report-body">
        <div className="a4-report-main-column">
          <A4Panel title="핵심 기사" meta={`${issues.length.toLocaleString("ko-KR")}건`}>
            <div className="a4-issue-list">
              {issues.slice(0, period === "daily" ? 4 : 5).map((issue) => (
                <A4IssueRow key={`${issue.source}-${issue.title}-${issue.time || issue.date}`} issue={issue} />
              ))}
              {!issues.length && <p className="a4-empty">기간 내 핵심 기사 데이터가 없습니다.</p>}
            </div>
          </A4Panel>
        </div>

        <div className="a4-report-side-column">
          <A4Panel title="일별 논조 추이" meta={period === "daily" ? "최근 10일" : "최근 31일"}>
            <A4ToneMini rows={trendRows} />
          </A4Panel>

          <A4Panel title="키워드별 기사량" meta="선정 10개">
            <A4BarList rows={keywordRows.slice(0, 10)} />
          </A4Panel>

          <A4Panel title="언론사 영향도" meta="상위 매체">
            <A4PressRows rows={pressRows} onOpenMonitoring={onOpenMonitoring} />
          </A4Panel>

          {scrapRows.length > 0 && (
            <A4Panel title="스크랩 확인" meta={`${scrapRows.length}건`}>
              <div className="a4-scrap-list">
                {scrapRows.map((item) => (
                  <span key={`${item.source}-${item.title}`}>{item.title}</span>
                ))}
              </div>
            </A4Panel>
          )}
        </div>

        <div className="a4-report-bottom-row">
          <A4Panel title="관찰 코멘트" meta="요약">
            <div className="a4-comment-list">
              {observationRows.map((row) => (
                <article key={row.label}>
                  <span>{row.label}</span>
                  <b>{row.body}</b>
                </article>
              ))}
            </div>
          </A4Panel>
          <A4Panel title="논조 분포" meta="분류">
            <div className="a4-tone-ledger">
              {toneRows.map((row) => (
                <span key={row.label} className={row.tone}>
                  <b>{row.value}</b>
                  <em>{row.label}</em>
                </span>
              ))}
            </div>
          </A4Panel>
        </div>
      </section>

      <footer className="a4-footer">
        <span>보고 기준: {periodScopeLabel(period)} · {data.scope || data.generatedAt || "-"}</span>
        <span>데이터: 수집 기사와 수동 분류 보정 반영</span>
      </footer>
    </article>
  );
}

function A4MetricStrip({ stats = [], onOpenMonitoring }) {
  return (
    <div className="a4-metric-strip">
      {stats.map((item) => (
        <button key={item.label} type="button" className={item.tone || ""} onClick={() => onOpenMonitoring?.(item.preset || {})}>
          <span>{item.label}</span>
          <b>{item.value}</b>
          <em>{item.detail}</em>
        </button>
      ))}
    </div>
  );
}

function A4Panel({ title, meta, children }) {
  return (
    <section className="a4-panel">
      <div className="a4-panel-head">
        <b>{title}</b>
        <span>{meta}</span>
      </div>
      {children}
    </section>
  );
}

function A4IssueRow({ issue }) {
  return (
    <article className="a4-issue-row">
      <div>
        <Chip tone={issue.tone}>{issue.tone}</Chip>
        <Chip>{issue.category || "분류"}</Chip>
        <span>{formatA4ArticleMeta(issue)}</span>
      </div>
      <h4>{issue.title}</h4>
      <ArticleSummaryBlock item={issue} dense />
    </article>
  );
}

function A4ToneMini({ rows = [] }) {
  const visibleRows = rows.slice(-8);
  const max = Math.max(1, ...visibleRows.map((row) => Number(row.positive || 0) + Number(row.caution || 0) + Number(row.negative || 0)));
  if (!visibleRows.length) return <p className="a4-empty">논조 추이 데이터가 없습니다.</p>;
  return (
    <div className="a4-tone-mini">
      {visibleRows.map((row) => {
        const positive = Number(row.positive || 0);
        const caution = Number(row.caution || 0);
        const negative = Number(row.negative || 0);
        return (
          <div key={row.date}>
            <span>{row.date}</span>
            <b>
              <i className="positive" style={{ width: `${Math.max(positive ? 8 : 0, (positive / max) * 100)}%` }} />
              <i className="caution" style={{ width: `${Math.max(caution ? 8 : 0, (caution / max) * 100)}%` }} />
              <i className="negative" style={{ width: `${Math.max(negative ? 8 : 0, (negative / max) * 100)}%` }} />
            </b>
            <em>{positive + caution + negative}건</em>
          </div>
        );
      })}
    </div>
  );
}

function A4BarList({ rows = [] }) {
  const visibleRows = rows.filter((row) => Number(row.value || 0) > 0).slice(0, 8);
  const max = Math.max(1, ...visibleRows.map((row) => Number(row.value || 0)));
  if (!visibleRows.length) return <p className="a4-empty">선정 키워드 기준 기사량이 없습니다.</p>;
  return (
    <div className="a4-bar-list">
      {visibleRows.map((row, index) => (
        <div key={row.keyword || row.name}>
          <span>{row.name}</span>
          <b><i style={{ width: `${Math.max(5, (Number(row.value || 0) / max) * 100)}%`, background: chartColors[index % chartColors.length] }} /></b>
          <em>{Number(row.value || 0).toLocaleString("ko-KR")}건</em>
        </div>
      ))}
    </div>
  );
}

function A4PressRows({ rows = [], onOpenMonitoring }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.total || 0)));
  if (!rows.length) return <p className="a4-empty">언론사 영향도 데이터가 없습니다.</p>;
  return (
    <div className="a4-press-rows">
      {rows.map((row) => (
        <button key={row.source} type="button" onClick={() => onOpenMonitoring?.({ source: row.source })}>
          <span>{row.source}</span>
          <b><i style={{ width: `${Math.max(8, (Number(row.total || 0) / max) * 100)}%` }} /></b>
          <em>{Number(row.total || 0).toLocaleString("ko-KR")}건</em>
        </button>
      ))}
    </div>
  );
}

function buildA4ReportStats(summary = {}, articles = []) {
  return [
    { label: "분석", value: Number(summary.analyzed || articles.length || 0).toLocaleString("ko-KR"), detail: "기간 기사", preset: {} },
    { label: "당사 언급", value: Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0).toLocaleString("ko-KR"), detail: "필수 확인", preset: { category: "당사" } },
    { label: "주의", value: Number(summary.caution || articles.filter((item) => item.tone === "주의").length || 0).toLocaleString("ko-KR"), detail: "관찰 신호", tone: "caution", preset: { tone: "주의" } },
    { label: "부정", value: Number(summary.ownNegative || articles.filter((item) => item.tone === "부정" && isOwnArticle(item)).length || 0).toLocaleString("ko-KR"), detail: "즉시 확인", tone: "negative", preset: { tone: "부정" } },
    { label: "GA/보험사", value: Number(summary.gaInsurance || articles.filter((item) => ["GA", "보험사"].includes(item.category)).length || 0).toLocaleString("ko-KR"), detail: "업계 흐름", tone: "positive", preset: { category: "GA" } },
  ];
}

function buildA4ReportInsights(period, data, lead, issues = [], articles = []) {
  const summary = data.summary || {};
  const periodLabel = periodScopeLabel(period);
  const ownCount = Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0);
  const negativeCount = Number(summary.ownNegative || articles.filter((item) => item.tone === "부정" && isOwnArticle(item)).length || 0);
  const cautionCount = Number(summary.caution || articles.filter((item) => item.tone === "주의").length || 0);
  const policyCount = articles.filter((item) => item.category === "정책/규제").length;
  const topic = lead ? a4TopicLabel(lead) : "기간 대표 이슈";
  const lines = [
    lead?.title ? `${periodLabel} 대표 흐름은 ${topic}입니다.` : `${periodLabel} 기사 흐름을 기간 기준으로 정리합니다.`,
    negativeCount > 0
      ? `당사 부정 ${negativeCount}건은 즉시 확인 대상으로 분리합니다.`
      : `당사 언급 ${ownCount}건은 직접 부정보다 관찰·성과·시장성 이슈로 나눠 봅니다.`,
    cautionCount > 0
      ? `주의 ${cautionCount}건은 시장 평가, 규제, 영업환경 신호를 별도로 추적합니다.`
      : "주의 신호는 낮고 일반 동향 확인 비중이 높습니다.",
    policyCount > 0
      ? `정책/규제 기사 ${policyCount.toLocaleString("ko-KR")}건은 영업 환경 변화 관점에서 확인합니다.`
      : issues[0]?.title
        ? `핵심 기사 "${issues[0].title}"의 후속 보도 여부를 확인합니다.`
        : "반복 노출 매체와 키워드 변화는 다음 보고 주기에 이어서 확인합니다.",
  ];
  return dedupeSummaryLines(lines).slice(0, 4);
}

function buildA4ObservationRows(period, data, lead, issues = [], articles = [], keywordRows = [], pressRows = []) {
  const summary = data.summary || {};
  const ownCount = Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0);
  const riskCount = Number(summary.ownNegative || 0) + Number(summary.caution || 0);
  const topKeyword = keywordRows.find((row) => Number(row.value || 0) > 0);
  const topPress = pressRows[0];
  const periodLabel = periodScopeLabel(period);
  const leadTopic = lead ? a4TopicLabel(lead) : "대표 이슈";
  return [
    {
      label: "대표 흐름",
      body: `${periodLabel} 핵심은 ${leadTopic}이며, 대표 헤드라인을 기준으로 보도 확산 여부를 확인합니다.`,
    },
    {
      label: "당사/리스크",
      body: `당사 언급 ${ownCount.toLocaleString("ko-KR")}건과 주의·부정 ${riskCount.toLocaleString("ko-KR")}건을 분리해 과잉 경보를 줄입니다.`,
    },
    {
      label: "매체/키워드",
      body: `${topPress?.source || "상위 매체"}와 ${topKeyword?.name || "선정 키워드"} 흐름을 함께 보며 반복 노출을 추적합니다.`,
    },
    {
      label: "후속 관찰",
      body: issues[0]?.title ? `"${issues[0].title}" 관련 후속 보도와 같은 이슈 묶음을 이어서 확인합니다.` : "반복 노출 이슈는 다음 보고 주기에 계속 누적합니다.",
    },
  ];
}

function buildA4ToneLedger(articles = []) {
  const count = (tone) => articles.filter((item) => item.tone === tone).length;
  return [
    { label: "긍정", value: count("긍정").toLocaleString("ko-KR"), tone: "positive" },
    { label: "중립", value: count("중립").toLocaleString("ko-KR"), tone: "neutral" },
    { label: "주의", value: count("주의").toLocaleString("ko-KR"), tone: "caution" },
    { label: "부정", value: count("부정").toLocaleString("ko-KR"), tone: "negative" },
  ];
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

function publicationMeta(period, data) {
  const date = data.scope || data.generatedAt || "";
  const meta = {
    daily: {
      kicker: "Daily Edition",
      title: "INCAR MEDIA DAILY",
      subtitle: "오늘의 언론 동향을 지면처럼 읽는 일간 브리핑",
      issue: `${date} · Daily No. 01`,
    },
    weekly: {
      kicker: "Weekly Edition",
      title: "INCAR MEDIA WEEKLY",
      subtitle: "한 주의 보도 흐름과 리스크 신호를 묶은 주간지",
      issue: `${date} · Weekly Review`,
    },
    monthly: {
      kicker: "Monthly Edition",
      title: "INCAR MEDIA MONTHLY",
      subtitle: "월간 누적 데이터를 기반으로 보는 언론 동향 매거진",
      issue: `${date} · Monthly Desk`,
    },
  };
  return meta[period] || meta.daily;
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
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`;
  let score = 0;
  if (own) score += 1000;
  if (own && item.tone === "부정") score += 900;
  if (own && item.tone === "긍정") score += 520;
  if (own && item.tone === "중립") score += 360;
  if (own && item.tone === "주의") score += 240;
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

function ReportMetricBoard({ summary, articles = [], period = "daily", onOpenMonitoring }) {
  const showLedger = period !== "daily";
  const stats = [
    { label: "수집", value: summary.collected.toLocaleString("ko-KR"), preset: {} },
    { label: "분석", value: summary.analyzed.toLocaleString("ko-KR"), preset: {} },
    { label: "당사", value: summary.ownMentions, preset: { category: "당사" } },
    { label: "GA/보험사", value: summary.gaInsurance, preset: { category: "GA" } },
  ];
  return (
    <section className={`report-metric-board ${showLedger ? "has-ledger" : ""}`}>
      <button className={`report-risk-line ${summary.risk.toLowerCase()}`} onClick={() => onOpenMonitoring?.({ category: "당사" })}>
        <span>리스크 레벨</span>
        <b>{summary.risk}</b>
        <em>부정 {summary.ownNegative} · 주의 {summary.caution}</em>
      </button>
      <div className="report-stat-grid">
        {stats.map((item) => (
          <button key={item.label} onClick={() => onOpenMonitoring?.(item.preset)}>
            <span>{item.label}</span>
            <b>{item.value}</b>
          </button>
        ))}
      </div>
      {showLedger && (
        <div className="top-ledger">
          <div className="top-ledger-head">
            <span>Desk Ledger</span>
            <b>누적 관리 항목</b>
          </div>
          <ReportLedger articles={articles} compact />
        </div>
      )}
    </section>
  );
}

function ReportMetric({ label, value, detail, tone = "default", onClick }) {
  return (
    <button type="button" className={`report-metric ${tone}`} onClick={onClick}>
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </button>
  );
}

function ReportStory({ issue }) {
  return (
    <article className={`report-story ${toneCssClass(issue.tone)}`}>
      <div>
        <Chip tone={issue.tone}>{issue.tone}</Chip>
        <Chip>{issue.category}</Chip>
      </div>
      <h3>{issue.title}</h3>
      <ArticleSummaryBlock item={issue} dense />
      <span>{issue.source} · {issue.publishedAt}</span>
    </article>
  );
}

function ReportLedger({ articles, compact = false }) {
  const rows = [
    { label: "당사 직접 언급", value: articles.filter(isOwnArticle).length, preset: "당사" },
    { label: "부정/주의 합산", value: articles.filter((item) => ["부정", "주의"].includes(item.tone)).length, preset: "리스크" },
    { label: "GA·보험사 동향", value: articles.filter((item) => ["GA", "보험사"].includes(item.category)).length, preset: "업계" },
    { label: "제외/노이즈 후보", value: articles.filter((item) => item.tone === "제외" || item.category === "제외").length, preset: "정제" },
  ];
  return (
    <div className={`report-ledger ${compact ? "compact" : ""}`}>
      {rows.map((row) => (
        <article key={row.label}>
          <span>{row.label}</span>
          <b>{row.value.toLocaleString("ko-KR")}건</b>
          <em>{row.preset}</em>
        </article>
      ))}
    </div>
  );
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

function Management({ management, operations, onRefreshOperations, isWorking }) {
  const [tab, setTab] = useState("media");
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Operations"
        title="운영 관리"
        description="언론사, 기자, 광고비 관리가 축소되지 않도록 기존 운영 메뉴 단위를 살려서 보여줍니다."
        right={(
          <div className="page-actions">
            <DataSourcePill operations={operations} />
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => onRefreshOperations?.({ label: "운영 데이터 갱신" })}
              disabled={operations?.status === "loading" || isWorking}
            >
              <RefreshCw />갱신
            </button>
          </div>
        )}
      />
      <ManagementSummary management={management} operations={operations} />
      <div className="management-tabs">
        {[
          ["media", "언론사 관리", Building2],
          ["reporters", "기자 관리", Users],
          ["ads", "광고비 관리", WalletCards],
          ["keywords", "키워드/문맥", Settings],
          ["feedback", "분류 피드백", FilePenLine],
        ].map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon />{label}
          </button>
        ))}
      </div>
      {tab === "media" && <MediaManagement rows={management.media} reporters={management.reporters} aliases={operations.aliases || []} />}
      {tab === "reporters" && <ReporterManagement rows={management.reporters} />}
      {tab === "ads" && <AdManagement rows={management.ads} />}
      {tab === "keywords" && <KeywordManagement keywords={operations.keywords || []} />}
      {tab === "feedback" && (
        <FeedbackManagement
          feedback={operations.feedback || []}
          operations={operations}
          onRefreshOperations={onRefreshOperations}
          isWorking={isWorking}
        />
      )}
    </main>
  );
}

function ManagementSummary({ management, operations }) {
  const totalAd = management.ads.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <section className="management-summary">
      <StatCard icon={Building2} label="관리 언론사" value={`${management.media.length.toLocaleString("ko-KR")}곳`} />
      <StatCard icon={Users} label="기자 프로필" value={`${management.reporters.length.toLocaleString("ko-KR")}명`} />
      <StatCard icon={WalletCards} label="광고비 누적" value={formatMoney(totalAd)} />
      <StatCard icon={Megaphone} label="문맥 규칙" value={`${keywordGroups.length}개 그룹`} />
      <StatCard icon={FilePenLine} label="분류 피드백" value={`${(operations?.feedback || []).length.toLocaleString("ko-KR")}건`} />
    </section>
  );
}

function CrmSignalGrid({ signals = [] }) {
  return (
    <div className="crm-signal-grid">
      {signals.map((signal) => (
        <article key={signal.label} className={signal.tone || ""}>
          <span>{signal.label}</span>
          <b>{signal.value}</b>
          <em>{signal.detail}</em>
        </article>
      ))}
    </div>
  );
}

function buildMediaCrmSignals(rows = [], reporters = []) {
  const ownMedia = rows.filter((row) => Number(row.own || 0) > 0);
  const needsContact = ownMedia.filter((row) => !row.contactDate && !row.owner);
  const riskMedia = rows.filter((row) => Number(row.negative || 0) > 0);
  const reporterMapped = new Set(reporters.map((row) => row.media || row.outlet).filter(Boolean));
  return [
    {
      label: "당사 보도 매체",
      value: `${ownMedia.length.toLocaleString("ko-KR")}곳`,
      detail: "자동 등록/관리 대상",
      tone: "positive",
    },
    {
      label: "접촉 정보 공백",
      value: `${needsContact.length.toLocaleString("ko-KR")}곳`,
      detail: "담당자·최근 접촉일 필요",
      tone: needsContact.length ? "caution" : "positive",
    },
    {
      label: "부정 보도 이력",
      value: `${riskMedia.length.toLocaleString("ko-KR")}곳`,
      detail: "관계 상태 점검 대상",
      tone: riskMedia.length ? "negative" : "positive",
    },
    {
      label: "기자 매핑",
      value: `${reporterMapped.size.toLocaleString("ko-KR")}곳`,
      detail: "기자 프로필 연결 매체",
      tone: "neutral",
    },
  ];
}

function buildReporterCrmSignals(rows = []) {
  const active = rows.filter((row) => row.name && (row.media || row.outlet));
  const missingContact = active.filter((row) => !row.contactDate && !row.email && !row.phone);
  const riskMapped = active.filter((row) => Number(row.mediaNegativeCount || 0) > 0);
  const ownMapped = active.filter((row) => Number(row.mediaOwnCount || 0) > 0);
  return [
    {
      label: "등록 기자",
      value: `${active.length.toLocaleString("ko-KR")}명`,
      detail: "관리 가능한 프로필",
      tone: "neutral",
    },
    {
      label: "연락처 공백",
      value: `${missingContact.length.toLocaleString("ko-KR")}명`,
      detail: "이메일·전화·접촉일 보강",
      tone: missingContact.length ? "caution" : "positive",
    },
    {
      label: "당사 매체 연결",
      value: `${ownMapped.length.toLocaleString("ko-KR")}명`,
      detail: "당사 보도 이력 매체 소속",
      tone: "positive",
    },
    {
      label: "리스크 매체 연결",
      value: `${riskMapped.length.toLocaleString("ko-KR")}명`,
      detail: "부정 보도 이력 매체 소속",
      tone: riskMapped.length ? "negative" : "positive",
    },
  ];
}

function MediaManagement({ rows, reporters = [], aliases = [] }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [mediaStatus, setMediaStatus] = useState("");
  const [mediaForm, setMediaForm] = useState(emptyMediaForm);
  const [managingMedia, setManagingMedia] = useState(false);
  const [localAliases, setLocalAliases] = useState(() => readLocalRows(PRESS_ALIAS_DRAFT_KEY));
  const [localMediaRows, setLocalMediaRows] = useState(() => readLocalRows("news_monitor_media_relation_drafts_v1"));
  const aliasRows = useMemo(() => mergeAliasRows(aliases, localAliases), [aliases, localAliases]);
  const managedRows = useMemo(() => mergeMediaRows(rows, aliasRows, localMediaRows), [rows, aliasRows, localMediaRows]);
  const crmSignals = useMemo(() => buildMediaCrmSignals(managedRows, reporters), [managedRows, reporters]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return managedRows;
    return managedRows.filter((row) => {
      const domains = domainsForPressName(row.name, aliasRows).join(" ");
      return `${row.name} ${row.grade} ${row.status} ${row.owner} ${row.memo} ${row.beat} ${row.leadReporter} ${row.email} ${row.phone} ${domains}`.toLowerCase().includes(term);
    });
  }, [managedRows, query, aliasRows]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);
  const updateMediaForm = (field, value) => setMediaForm((current) => ({ ...current, [field]: value }));
  const persistLocalMediaRows = (nextRows) => {
    setLocalMediaRows(nextRows);
    writeLocalRows("news_monitor_media_relation_drafts_v1", nextRows);
  };

  const handleManageMedia = (row = {}) => {
    const domains = domainsForPressName(row.name, aliasRows);
    setMediaForm({
      name: row.name || "",
      url: row.url || domains[0] || "",
      grade: row.grade || "B",
      status: row.status || "중립",
      owner: row.owner || "",
      contactDate: row.contactDate || "",
      beat: row.beat || "",
      leadReporter: row.leadReporter || "",
      email: row.email || "",
      phone: row.phone || "",
      memo: row.memo || "",
    });
    setManagingMedia(true);
    setMediaStatus(row.name ? `${row.name} 관리 정보를 편집 중입니다.` : "새 언론사 정보를 입력하세요.");
  };

  const handleSaveMedia = async () => {
    const item = normalizeMediaDraft(mediaForm);
    if (!item.name) {
      setMediaStatus("언론사명을 입력해야 합니다.");
      return;
    }
    const host = canonicalHost(item.url);
    const nextMediaRows = upsertMediaLocal(localMediaRows, item);
    persistLocalMediaRows(nextMediaRows);
    if (host) {
      const nextAliases = upsertAliasRow(localAliases, { host, press_name: item.name });
      setLocalAliases(nextAliases);
      writeLocalRows(PRESS_ALIAS_DRAFT_KEY, nextAliases);
    }
    try {
      await saveMediaRelation({ ...item, memo: buildMediaMemo(item) });
      if (host) await savePressAlias(host, item.name);
      setMediaStatus("Supabase 저장 완료");
    } catch {
      setMediaStatus("현재 화면 반영 완료 · 운영 세션 연결 시 DB 저장");
    }
  };

  return (
    <Panel title="언론사 관리" icon={Building2} meta={`${managedRows.length.toLocaleString("ko-KR")}곳`}>
      <CrmSignalGrid signals={crmSignals} />
      <div className="management-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="언론사명, 도메인, 메모 검색" />
        <button className="ghost-button">등급 정리</button>
        <button className="primary-button" onClick={() => handleManageMedia()}>언론사 추가</button>
      </div>
      {managingMedia && (
        <div className="operation-form media-detail-form">
          <label>
            <span>언론사명</span>
            <input value={mediaForm.name} onChange={(event) => updateMediaForm("name", event.target.value)} placeholder="예: 보험매일" />
          </label>
          <label>
            <span>대표 URL/도메인</span>
            <input value={mediaForm.url} onChange={(event) => updateMediaForm("url", event.target.value)} placeholder="https://example.co.kr" />
          </label>
          <label>
            <span>등급</span>
            <select value={mediaForm.grade} onChange={(event) => updateMediaForm("grade", event.target.value)}>
              {["A", "B", "C", "보류"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>관계 상태</span>
            <select value={mediaForm.status} onChange={(event) => updateMediaForm("status", event.target.value)}>
              {["우호", "중립", "관찰", "주의"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>담당자</span>
            <input value={mediaForm.owner} onChange={(event) => updateMediaForm("owner", event.target.value)} placeholder="홍보팀 / 담당자" />
          </label>
          <label>
            <span>최근 접촉일</span>
            <input type="date" value={mediaForm.contactDate} onChange={(event) => updateMediaForm("contactDate", event.target.value)} />
          </label>
          <label>
            <span>주요 분야</span>
            <input value={mediaForm.beat} onChange={(event) => updateMediaForm("beat", event.target.value)} placeholder="보험/GA, 경제, 금융정책" />
          </label>
          <label>
            <span>대표 기자</span>
            <input value={mediaForm.leadReporter} onChange={(event) => updateMediaForm("leadReporter", event.target.value)} placeholder="주요 담당 기자" />
          </label>
          <label>
            <span>이메일</span>
            <input value={mediaForm.email} onChange={(event) => updateMediaForm("email", event.target.value)} placeholder="desk@example.co.kr" />
          </label>
          <label>
            <span>전화</span>
            <input value={mediaForm.phone} onChange={(event) => updateMediaForm("phone", event.target.value)} placeholder="02-0000-0000" />
          </label>
          <label className="media-memo-field">
            <span>관리 메모</span>
            <textarea value={mediaForm.memo} onChange={(event) => updateMediaForm("memo", event.target.value)} placeholder="보도자료 발송 이력, 선호 주제, 주의사항, 후속 접촉 기록" />
          </label>
          <div className="operation-form-actions media-detail-actions">
            <button className="ghost-button" onClick={() => { setManagingMedia(false); setMediaForm(emptyMediaForm); setMediaStatus(""); }}>닫기</button>
            <button className="primary-button" onClick={handleSaveMedia}>관리 정보 저장</button>
          </div>
          {mediaStatus && <p className="status-note">{mediaStatus}</p>}
        </div>
      )}
      <div className="data-table-wrap">
        <table className="data-table media-data-table">
          <thead>
            <tr>
              <th>언론사</th>
              <th>주소 보정</th>
              <th>등급</th>
              <th>관계</th>
              <th>담당</th>
              <th>최근 접촉</th>
              <th>보도 이력</th>
              <th>메모</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.name}>
                <td><b>{row.name}</b></td>
                <td>
                  <div className="alias-chip-list">
                    {domainsForPressName(row.name, aliasRows).slice(0, 3).map((host) => <Chip key={host}>{host}</Chip>)}
                    {!domainsForPressName(row.name, aliasRows).length && "-"}
                  </div>
                </td>
                <td><Chip>{row.grade || "B"}</Chip></td>
                <td><Chip tone={row.status}>{row.status || "중립"}</Chip></td>
                <td>{row.owner || "-"}</td>
                <td>{row.contactDate || "-"}</td>
                <td>
                  <div className="press-history-stack">
                    <b>{Number(row.total || 0).toLocaleString("ko-KR")}건</b>
                    <span>당사 {Number(row.own || 0).toLocaleString("ko-KR")} · 부정 {Number(row.negative || 0).toLocaleString("ko-KR")}</span>
                  </div>
                </td>
                <td>{row.memo || "-"}</td>
                <td>
                  <button className="ghost-button compact-button" onClick={() => handleManageMedia(row)}>관리</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 15 && (
        <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "접기" : "더보기"}
        </button>
      )}
    </Panel>
  );
}

function ReporterManagement({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyReporterForm);
  const [localState, setLocalState] = useState(() => readLocalReporterState());
  const managedRows = useMemo(() => mergeReporterRows(rows, localState), [rows, localState]);
  const reporterSignals = useMemo(() => buildReporterCrmSignals(managedRows), [managedRows]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return managedRows;
    return managedRows.filter((row) =>
      `${row.name} ${row.outlet || row.media} ${row.beat} ${row.status} ${row.contactDate} ${row.memo}`.toLowerCase().includes(term),
    );
  }, [managedRows, query]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const persistLocalState = (nextState) => {
    setLocalState(nextState);
    writeLocalReporterState(nextState);
  };

  const handleEditReporter = (row) => {
    setForm({
      id: row.id || "",
      name: row.name || "",
      media: row.outlet || row.media || "",
      beat: row.beat === "-" ? "" : row.beat || "",
      status: row.status || "중립",
      contactDate: row.contactDate || row.date || "",
      email: row.email || "",
      phone: row.phone || "",
      request: row.request || "",
      memo: row.memo || "",
    });
    setStatus("선택한 기자 정보를 편집 중입니다.");
  };

  const handleSaveReporter = async () => {
    const item = normalizeReporterDraft(form);
    if (!item.name || !item.media) {
      setStatus("기자명과 언론사를 입력해야 합니다.");
      return;
    }
    const optimistic = { ...item, id: item.id || `local-${Date.now()}` };
    const localFirst = upsertReporterLocal(localState, optimistic);
    persistLocalState(localFirst);
    setForm(emptyReporterForm);
    try {
      const saved = await saveReporterProfile({ ...item, memo: buildReporterMemo(item) });
      const savedRow = Array.isArray(saved) && saved[0] ? reporterDraftFromRemote(saved[0]) : optimistic;
      persistLocalState(upsertReporterLocal(localFirst, savedRow, optimistic.id));
      setStatus("Supabase 저장 완료");
    } catch {
      setStatus("현재 화면 반영 완료 · 운영 세션 연결 시 DB 저장");
    }
  };

  const handleDeleteReporter = async (row) => {
    const key = reporterKey(row);
    const nextState = hideReporterLocal(localState, row);
    persistLocalState(nextState);
    try {
      if (/^\d+$/.test(String(row.id || ""))) {
        await deleteReporterProfile(row.id);
        setStatus("Supabase 삭제 완료");
      } else {
        setStatus("현재 화면에서 제외했습니다.");
      }
    } catch {
      persistLocalState({ ...nextState, hidden: unique([...nextState.hidden, key]) });
      setStatus("현재 화면에서 제외했습니다. 운영 세션 연결 시 DB 삭제 가능");
    }
  };

  return (
    <Panel title="기자 관리" icon={Users} meta={`${managedRows.length.toLocaleString("ko-KR")}명`}>
      <CrmSignalGrid signals={reporterSignals} />
      <div className="operation-form reporter-form">
        <label>
          <span>기자명</span>
          <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="예: 홍길동" />
        </label>
        <label>
          <span>언론사</span>
          <input value={form.media} onChange={(event) => updateForm("media", event.target.value)} placeholder="예: 보험저널" />
        </label>
        <label>
          <span>담당 분야</span>
          <input value={form.beat} onChange={(event) => updateForm("beat", event.target.value)} placeholder="보험/GA, 금융정책" />
        </label>
        <label>
          <span>관계 상태</span>
          <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
            {["우호", "중립", "관찰", "주의"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>최근 접촉일</span>
          <input type="date" value={form.contactDate} onChange={(event) => updateForm("contactDate", event.target.value)} />
        </label>
        <label>
          <span>이메일</span>
          <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="reporter@example.co.kr" />
        </label>
        <label>
          <span>전화</span>
          <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="010-0000-0000" />
        </label>
        <label>
          <span>요청/선호</span>
          <input value={form.request} onChange={(event) => updateForm("request", event.target.value)} placeholder="선호 자료, 마감, 관심 이슈" />
        </label>
        <label className="reporter-memo-field">
          <span>메모</span>
          <textarea value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="관심 주제, 요청사항, 접촉 이력" />
        </label>
        <div className="operation-form-actions reporter-actions">
          <button className="ghost-button" onClick={() => { setForm(emptyReporterForm); setStatus(""); }}>초기화</button>
          <button className="primary-button" onClick={handleSaveReporter}>{form.id ? "수정 저장" : "기자 추가"}</button>
        </div>
        {status && <p className="status-note">{status}</p>}
      </div>
      <div className="management-toolbar reporter-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기자명, 언론사, 관계, 메모 검색" />
        <button className="ghost-button" onClick={() => setQuery(form.media || form.name)}>선택 기자 검색</button>
        <button className="primary-button" onClick={handleSaveReporter}>관리 기록 저장</button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table reporter-data-table">
          <thead>
            <tr>
              <th>기자</th>
              <th>언론사</th>
              <th>담당</th>
              <th>관계</th>
              <th>최근 접촉</th>
              <th>소속 매체 이력</th>
              <th>메모</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id || `${row.name}-${row.outlet}`}>
                <td><b>{row.name}</b></td>
                <td>{row.outlet || row.media}</td>
                <td>{row.beat || "-"}</td>
                <td><Chip tone={row.status}>{row.status || "중립"}</Chip></td>
                <td>{row.contactDate || row.date || "-"}</td>
                <td>
                  <div className="press-history-stack">
                    <b>{row.recent}</b>
                    <span>당사 {Number(row.mediaOwnCount || 0).toLocaleString("ko-KR")} · 부정 {Number(row.mediaNegativeCount || 0).toLocaleString("ko-KR")}</span>
                  </div>
                </td>
                <td>{row.memo || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost-button" onClick={() => handleEditReporter(row)}>관리</button>
                    <button className="ghost-button danger" onClick={() => handleDeleteReporter(row)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 15 && (
        <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "접기" : "더보기"}
        </button>
      )}
    </Panel>
  );
}

function AdManagement({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const adData = useMemo(() => buildAdSpendData(rows), [rows]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.month} ${row.media} ${row.type} ${row.memo}`.toLowerCase().includes(term));
  }, [rows, query]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);
  return (
    <Panel title="광고비 관리" icon={WalletCards} meta={`${rows.length.toLocaleString("ko-KR")}건`}>
      <div className="ad-summary-row">
        <StatCard icon={WalletCards} label="총 집행액" value={formatMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))} />
        <StatCard icon={CalendarDays} label="집행 월" value={`${unique(rows.map((row) => row.month)).length}개월`} />
        <StatCard icon={Building2} label="매체 수" value={`${unique(rows.map((row) => row.media)).length}곳`} />
      </div>
      <div className="ad-chart-grid">
        <article className="ad-chart-card wide">
          <div>
            <b>월별 집행 추이</b>
            <span>{adData.monthly.length.toLocaleString("ko-KR")}개월</span>
          </div>
          <AdSpendChart rows={adData.monthly} color="#2855d9" />
        </article>
        <article className="ad-chart-card">
          <div>
            <b>매체별 집행</b>
            <span>상위 6개</span>
          </div>
          <AdSpendChart rows={adData.media} color="#14805f" compact />
        </article>
        <article className="ad-chart-card">
          <div>
            <b>유형별 집행</b>
            <span>구분</span>
          </div>
          <AdSpendChart rows={adData.type} color="#b45309" compact />
        </article>
      </div>
      <div className="management-toolbar ad-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="매체명, 메모 검색" />
        <button className="ghost-button">월별 보기</button>
        <button className="ghost-button" onClick={() => printAdReport(rows)}><Download />인쇄/PDF 저장</button>
        <button className="primary-button">광고비 추가</button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table ad-data-table">
          <thead>
            <tr>
              <th>월</th>
              <th>매체</th>
              <th>유형</th>
              <th>금액</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id || `${row.month}-${row.media}-${row.amount}`}>
                <td>{row.month}</td>
                <td><b>{row.media}</b></td>
                <td><Chip>{row.type}</Chip></td>
                <td className="money-cell">{formatMoney(row.amount)}</td>
                <td>{row.memo || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 15 && (
        <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "접기" : "더보기"}
        </button>
      )}
    </Panel>
  );
}

function KeywordManagement({ keywords = [] }) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("own");
  const [status, setStatus] = useState("");
  const [localKeywords, setLocalKeywords] = useState(() => readLocalRows(KEYWORD_DRAFT_KEY));
  const rows = useMemo(
    () => mergeKeywordRows(keywords.length ? keywords : keywordRowsFromGroups(), localKeywords),
    [keywords, localKeywords],
  );
  const grouped = useMemo(() => groupKeywordRows(rows), [rows]);

  const handleAddKeyword = async () => {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      setStatus("추가할 키워드를 입력하세요.");
      return;
    }
    const nextKeyword = { keyword: cleanKeyword, category, enabled: true };
    const nextLocal = upsertKeywordRow(localKeywords, nextKeyword);
    setLocalKeywords(nextLocal);
    writeLocalRows(KEYWORD_DRAFT_KEY, nextLocal);
    setKeyword("");
    try {
      await saveMonitorKeyword(cleanKeyword, category);
      setStatus("Supabase 저장 완료");
    } catch {
      setStatus("현재 화면 반영 완료 · 운영 세션 연결 시 DB 저장");
    }
  };

  return (
    <section className="content-grid two">
      <Panel title="상위 구분별 키워드" icon={Settings} meta={`${rows.length.toLocaleString("ko-KR")}개`}>
        <div className="operation-form keyword-add-form">
          <label>
            <span>상위 구분</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {keywordCategories.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>키워드</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddKeyword();
              }}
              placeholder="예: 글로벌금융판매"
            />
          </label>
          <div className="operation-form-actions">
            <button className="primary-button" onClick={handleAddKeyword}>키워드 추가</button>
          </div>
          {status && <p className="status-note">{status}</p>}
        </div>
        <div className="keyword-manager-list">
          {grouped.map((group) => (
            <article key={group.category} className="keyword-manager-group">
              <div>
                <b>{keywordCategoryLabel(group.category)}</b>
                <span>{group.items.length.toLocaleString("ko-KR")}개</span>
              </div>
              <p>{keywordCategoryRule(group.category)}</p>
              <div className="keyword-chip-grid">
                {group.items.map((item) => <Chip key={`${item.category}-${item.keyword}`} tone={keywordCategoryTone(item.category)}>{item.keyword}</Chip>)}
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="분류 규칙" icon={ShieldCheck} meta="긍정·중립·주의·부정·제외">
        <RuleStack />
      </Panel>
    </section>
  );
}

function FeedbackManagement({ feedback = [], operations, onRefreshOperations, isWorking }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState("");
  const rows = useMemo(() => [...feedback].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), [feedback]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      `${row.title} ${row.previousCategory} ${row.previousTone} ${row.correctedCategory} ${row.correctedTone} ${row.reason}`.toLowerCase().includes(term),
    );
  }, [query, rows]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);
  const candidates = useMemo(() => buildFeedbackRuleCandidates(rows), [rows]);
  const needsLogin = !operations?.session?.session_token;
  const todayCount = useMemo(() => {
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    return rows.filter((row) => String(row.createdAt || "").slice(0, 10) === today || row.date === today).length;
  }, [rows]);
  const latestFeedback = rows[0];
  const sourceLabel = operations?.source === "supabase" ? "운영 DB 직접 조회" : "정적 배포 이력";
  const feedbackStamp = operations?.feedbackGeneratedAt || latestFeedback?.createdAt || "";

  const openLogin = () => window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
  const approveCandidate = async (candidate) => {
    if (needsLogin) {
      setStatus("운영 DB 세션이 필요합니다. 로그인창을 열었습니다.");
      openLogin();
      return;
    }
    try {
      await saveMonitorKeyword(candidate.keyword, candidate.category);
      setStatus(`${candidate.keyword} 규칙 후보를 ${keywordCategoryLabel(candidate.category)}에 반영했습니다.`);
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") ? "운영 DB 세션이 필요합니다." : "규칙 반영 실패 · 연결을 확인하세요.");
      if (error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")) openLogin();
    }
  };

  return (
    <section className="content-grid two">
      <Panel title="자동 규칙 후보" icon={ShieldCheck} meta={`${candidates.length.toLocaleString("ko-KR")}개`}>
        <div className="feedback-ledger">
          <article>
            <span>이력 원장</span>
            <b>{sourceLabel}</b>
          </article>
          <article>
            <span>오늘 수정</span>
            <b>{todayCount.toLocaleString("ko-KR")}건</b>
          </article>
          <article>
            <span>최근 수정</span>
            <b>{latestFeedback ? [latestFeedback.date, latestFeedback.time].filter(Boolean).join(" ") : "-"}</b>
          </article>
        </div>
        <div className="status-note feedback-login-note">
          <span>
            {needsLogin
              ? "로그인 없이 보는 화면은 배포된 최근 피드백 이력입니다. 저장 직후 원장을 보려면 운영 DB 연결이 필요합니다."
              : "운영 DB 세션으로 최근 분류 피드백을 직접 확인 중입니다."}
            {feedbackStamp ? ` · 기준 ${formatFeedbackStamp(feedbackStamp)}` : ""}
          </span>
          <div>
            <button
              className="ghost-button compact-button"
              onClick={() => onRefreshOperations?.({ label: "운영 데이터 갱신" })}
              disabled={isWorking}
            >
              갱신
            </button>
            {needsLogin && <button className="ghost-button compact-button" onClick={openLogin}>운영 DB 연결</button>}
          </div>
        </div>
        <div className="feedback-candidate-list">
          {candidates.length ? candidates.slice(0, 8).map((candidate) => (
            <article key={candidate.key} className="feedback-candidate">
              <div>
                <Chip tone={keywordCategoryTone(candidate.category)}>{candidate.action}</Chip>
                <b>{candidate.label}</b>
                <span>{candidate.count.toLocaleString("ko-KR")}회 반복 · {candidate.example}</span>
              </div>
              <button className="ghost-button compact-button" onClick={() => approveCandidate(candidate)}>
                규칙 반영
              </button>
            </article>
          )) : (
            <div className="empty-state">누적 피드백이 쌓이면 반복 오분류 후보를 자동으로 모읍니다.</div>
          )}
        </div>
        {status && <p className="status-note">{status}</p>}
      </Panel>
      <Panel title="분류 수정 이력" icon={FilePenLine} meta={`${rows.length.toLocaleString("ko-KR")}건`}>
        <div className="management-toolbar feedback-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기사명, 이전/수정 분류, 사유 검색" />
          <button className="ghost-button compact-button" onClick={() => setQuery("")}>초기화</button>
        </div>
        {visibleRows.length ? (
          <div className="data-table-wrap">
            <table className="data-table feedback-table">
              <thead>
                <tr>
                  <th>수정일</th>
                  <th>기사</th>
                  <th>이전</th>
                  <th>수정</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>{[row.date, row.time].filter(Boolean).join(" ") || "-"}</td>
                    <td>
                      <b>{row.title || row.link || row.articleHash || "-"}</b>
                      {row.link && row.link !== "#" && (
                        <a href={row.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, row.link)}>
                          기사 열기
                        </a>
                      )}
                    </td>
                    <td>
                      <Chip>{row.previousCategory || "-"}</Chip>
                      <Chip tone={row.previousTone}>{row.previousTone || "-"}</Chip>
                    </td>
                    <td>
                      <Chip>{row.correctedCategory || "-"}</Chip>
                      <Chip tone={row.correctedTone}>{row.correctedTone || "-"}</Chip>
                    </td>
                    <td>{row.reason || row.createdBy || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state feedback-empty">
            {query.trim()
              ? "검색 조건에 맞는 분류 수정 이력이 없습니다."
              : "분류 수정 이력이 아직 표시되지 않습니다. 운영 DB 연결 또는 대시보드 갱신 후 다시 확인해 주세요."}
          </div>
        )}
        {filteredRows.length > 15 && (
          <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "접기" : "더보기"}
          </button>
        )}
      </Panel>
    </section>
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

function PageTitle({ eyebrow, title, description, right }) {
  return (
    <div className="page-title">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {right ? <div className="page-title-right">{right}</div> : null}
    </div>
  );
}

function KpiGrid({ summary, compact = false, onOpenMonitoring }) {
  const items = [
    { label: "수집기사", value: summary.collected.toLocaleString("ko-KR"), icon: Newspaper, preset: {} },
    { label: "분석기사", value: summary.analyzed.toLocaleString("ko-KR"), icon: Gauge, preset: {} },
    { label: "당사언급", value: summary.ownMentions, icon: Building2, preset: { category: "당사" } },
    { label: "당사부정", value: summary.ownNegative, icon: AlertTriangle, tone: "negative", preset: { category: "당사", tone: "부정" } },
    { label: "주의", value: summary.caution, icon: Bell, tone: "caution", preset: { tone: "주의" } },
    { label: "GA/보험사", value: summary.gaInsurance, icon: Activity, tone: "positive", preset: { category: "GA" } },
  ];
  return (
    <section className={compact ? "kpi-grid compact" : "kpi-grid"}>
      {items.map((item) => <Kpi key={item.label} {...item} onClick={onOpenMonitoring ? () => onOpenMonitoring(item.preset) : undefined} />)}
    </section>
  );
}

function Kpi({ label, value, icon: Icon = FileText, tone = "default", onClick }) {
  const Tag = onClick ? "button" : "article";
  return (
    <Tag className={`kpi-card ${tone} ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <Icon />
      <div>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    </Tag>
  );
}

function Panel({ title, icon: Icon = FileText, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2><Icon />{title}</h2>
        <span>{meta}</span>
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
        <ArticleSummaryBlock item={lead} />
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
              <ArticleSummaryBlock item={issue} dense />
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

function IssueList({ issues, compact = false }) {
  return (
    <div className={compact ? "issue-list compact" : "issue-list"}>
      {issues.map((issue) => (
        <article className={`issue-card ${toneCssClass(issue.tone)}`} key={`${issue.source}-${issue.title}`}>
          <div className="issue-meta">
            <Chip tone={issue.tone}>{issue.tone}</Chip>
            <Chip>{issue.category}</Chip>
            <span>{formatIssueMeta(issue)}</span>
          </div>
          <h3>{issue.title}</h3>
          <ArticleSummaryBlock item={issue} />
          <RelatedIssueDetails issue={issue} compact />
          {!compact && issue.link && issue.link !== "#" && (
            <a href={issue.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, issue.link)}>
              <ExternalLink />기사 열기
            </a>
          )}
        </article>
      ))}
    </div>
  );
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
  const lines = buildArticleSummaryLines(item).slice(0, dense ? 3 : 4);
  if (!lines.length) return null;
  return (
    <ul className={dense ? "summary-lines dense" : "summary-lines"}>
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function ArticleFeed({ rows, compact = false, showTime = false, onFeedbackSaved }) {
  return (
    <div className={compact ? "feed-table compact" : "feed-table"}>
      {rows.map((row) => {
        const related = Array.isArray(row.relatedArticles) ? row.relatedArticles : [];
        const hasRelated = related.length > 1;
        return (
          <article key={`${row.id || row.link || row.title}-${row.time}`} className={hasRelated ? "feed-row related" : "feed-row"}>
            <div className="feed-main">
              <div className="feed-title-line">
                <Chip tone={row.tone}>{row.tone}</Chip>
                <b>{row.title}</b>
              </div>
              <span className="feed-meta">{formatFeedMeta(row, hasRelated)}</span>
              {!compact && <ArticleSummaryBlock item={row} dense />}
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
              {!compact && <ArticleCorrectionControl article={row} onSaved={onFeedbackSaved} />}
            </div>
            {!compact && (
              <div className="feed-actions">
                {row.link && row.link !== "#" && (
                  <a
                    href={row.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="기사 열기"
                    onClick={(event) => openArticleLink(event, row.link)}
                  >
                    <ExternalLink />
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

const FEEDBACK_CATEGORY_OPTIONS = ["당사", "GA", "보험사", "정책/규제", "업계동향", "기타", "제외"];
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
    try {
      const result = await saveClassificationFeedback(article, {
        category,
        tone,
        reason: "dashboard_manual_correction",
        createdBy: "dashboard",
      });
      const patchNote = result?.patchError ? " · 원문 패치는 권한 확인 필요" : "";
      setStatus(`저장 완료${patchNote}`);
      window.setTimeout(() => setOpen(false), 900);
      await onSaved?.();
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

function HealthStatusPill({ status = "unknown", label }) {
  return <strong className={`health-pill ${status}`}>{label || healthStatusLabel(status)}</strong>;
}

function buildOperationsHealth({ operations, notifications, watchRuns, reportRuns, workflowHealth }) {
  const items = [
    buildWatchHealth(watchRuns, workflowHealth),
    buildDailyReportHealth(notifications, reportRuns),
    buildNotificationHealth(notifications),
    buildWorkflowActionsHealth(workflowHealth),
    buildHistorySourceHealth(operations, notifications, watchRuns, reportRuns),
  ];
  const status = items.some((item) => item.status === "fail")
    ? "fail"
    : items.some((item) => item.status === "warn")
      ? "warn"
      : items.every((item) => item.status === "pending")
        ? "pending"
        : "ok";
  const problemCount = items.filter((item) => ["fail", "warn"].includes(item.status)).length;
  const headline = status === "fail"
    ? `${problemCount}개 운영 항목 확인 필요`
    : status === "warn"
      ? `${problemCount}개 항목 주의 관찰`
      : "감시·보고서·알림 이력이 정상 범위입니다.";
  return { status, label: healthStatusLabel(status), headline, items };
}

function buildWatchHealth(watchRuns = [], workflowHealth = {}) {
  const latestRun = watchRuns[0] || {};
  const workflow = findWorkflowHealth(workflowHealth, "negative-watch.yml");
  const latestWorkflow = workflow?.latest || null;
  const latestAt = latestWorkflow?.updatedAt || latestWorkflow?.createdAt || latestRun.scannedAt || "";
  const delay = minutesSince(latestAt);
  const failedWorkflow = latestWorkflow && ["failure", "timed_out", "action_required"].includes(latestWorkflow.conclusion);
  let status = "ok";
  if (failedWorkflow) status = "fail";
  else if (delay === null) status = workflow?.status === "error" ? "warn" : "pending";
  else if (delay > 15) status = "fail";
  else if (delay > 10) status = "warn";
  const detail = delay === null
    ? "최근 실행 확인 대기"
    : `${formatRelativeMinutes(delay)} 전 실행`;
  const workflowText = latestWorkflow?.status === "in_progress" ? "실행 중" : formatWorkflowConclusion(latestWorkflow);
  const scope = latestRun.minutesBack ? `검사 ${latestRun.minutesBack}분` : "검사 5분";
  return {
    title: "부정기사 감시",
    icon: Radar,
    status,
    label: healthStatusLabel(status),
    detail,
    meta: `${scope} · 신규 ${Number(latestRun.fresh || 0).toLocaleString("ko-KR")}건 · ${workflowText}`,
  };
}

function buildDailyReportHealth(notifications = [], reportRuns = []) {
  const today = kstDateKey(new Date());
  const currentMinute = kstMinuteOfDay(new Date());
  const slots = ["08", "13", "18"].map((slot) => {
    const dueMinute = Number(slot) * 60 + 15;
    const due = currentMinute >= dueMinute;
    const notificationOk = notifications.some((item) => isDailyReportNotificationForSlot(item, today, slot));
    const reportOk = reportRuns.some((row) => isReportRunForSlot(row, today, slot));
    let state = "예정";
    let status = "pending";
    if (due && notificationOk && reportOk) {
      state = "완료";
      status = "ok";
    } else if (due && notificationOk) {
      state = "발송";
      status = "warn";
    } else if (due && reportOk) {
      state = "반영중";
      status = "warn";
    } else if (due) {
      state = "누락";
      status = "fail";
    }
    return { slot, state, status, notificationOk, reportOk, due };
  });
  const status = worstHealthStatus(slots.filter((slot) => slot.due).map((slot) => slot.status));
  const dueCount = slots.filter((slot) => slot.due).length;
  const sentCount = slots.filter((slot) => slot.notificationOk).length;
  const confirmedCount = slots.filter((slot) => slot.notificationOk || slot.reportOk).length;
  const completedDueCount = slots.filter((slot) => slot.due && (slot.notificationOk || slot.reportOk)).length;
  const syncingCount = slots.filter((slot) => slot.due && !slot.notificationOk && slot.reportOk).length;
  const totalSlots = slots.length;
  const progress = dueCount
    ? [`도래 ${dueCount}회 중 확인 ${completedDueCount}회`, syncingCount ? `반영중 ${syncingCount}회` : ""].filter(Boolean).join(" · ")
    : "첫 발송 전";
  return {
    title: "일일보고서",
    icon: CalendarDays,
    status: dueCount ? status : "pending",
    label: dueCount ? healthStatusLabel(status) : "대기",
    detail: `오늘 ${totalSlots}회 중 확인 ${confirmedCount}회`,
    progress,
    slots,
    meta: `발송 ${sentCount}회 · 생성 ${Math.max(0, confirmedCount - sentCount)}회`,
  };
}

function buildNotificationHealth(notifications = []) {
  const recent = notifications.filter((item) => {
    const minutes = minutesSince(item.sentAt);
    return minutes !== null && minutes <= 24 * 60;
  });
  const scoped = recent.length ? recent : notifications.slice(0, 12);
  const failed = scoped.filter((item) => !isNotificationSuccess(item));
  const success = scoped.filter(isNotificationSuccess);
  const latest = notifications[0];
  const status = !scoped.length ? "warn" : failed.length ? "fail" : "ok";
  return {
    title: "알림톡",
    icon: Bell,
    status,
    label: healthStatusLabel(status),
    detail: scoped.length ? `최근 이력 성공 ${success.length} · 실패 ${failed.length}` : "발송 이력 없음",
    meta: latest ? `최신 ${latest.time} · ${latest.type}` : "알림톡 기록 확인 필요",
  };
}

function buildWorkflowActionsHealth(workflowHealth = {}) {
  const workflows = Array.isArray(workflowHealth.workflows) ? workflowHealth.workflows : [];
  if (workflowHealth.status === "loading") {
    return {
      title: "GitHub Actions",
      icon: RefreshCw,
      status: "pending",
      label: "확인 중",
      detail: "워크플로우 상태 확인 중",
      meta: "공개 GitHub 실행 이력 조회",
    };
  }
  if (!workflows.length) {
    return {
      title: "GitHub Actions",
      icon: RefreshCw,
      status: "warn",
      label: "확인",
      detail: "워크플로우 이력 연결 대기",
      meta: workflowHealth.status === "error" ? "GitHub API 응답 확인 필요" : "최근 실행 없음",
    };
  }
  const latestFailures = workflows.filter((item) => item.latest && ["failure", "timed_out", "action_required"].includes(item.latest.conclusion));
  const latestWarnings = workflows.filter((item) => item.status === "error" || item.latest?.conclusion === "cancelled");
  const running = workflows.filter((item) => item.latest?.status === "in_progress" || item.latest?.status === "queued").length;
  const status = latestFailures.length ? "fail" : latestWarnings.length ? "warn" : "ok";
  const recoveredFailures = workflows.reduce((sum, item) => sum + Number(item.previousFailures || 0), 0);
  return {
    title: "GitHub Actions",
    icon: RefreshCw,
    status,
    label: healthStatusLabel(status),
    detail: latestFailures.length ? `최근 실패 ${latestFailures.length}개` : running ? `실행 중 ${running}개` : "주요 워크플로우 정상",
    meta: recoveredFailures ? `최근 목록 내 복구된 실패 ${recoveredFailures}건` : workflows.map((item) => formatWorkflowConclusion(item.latest)).join(" · "),
  };
}

function buildHistorySourceHealth(operations = {}, notifications = [], watchRuns = [], reportRuns = []) {
  const missing = [];
  if (!notifications.length) missing.push("알림");
  if (!watchRuns.length) missing.push("감시");
  if (!reportRuns.length) missing.push("보고");
  const status = operations?.status === "error"
    ? "fail"
    : missing.includes("알림") || missing.includes("감시")
      ? "fail"
      : missing.length
        ? "warn"
        : "ok";
  const source = operations?.source === "supabase" ? "DB 직접 연결" : "정적 배포 이력";
  return {
    title: "Supabase 기록",
    icon: ShieldCheck,
    status,
    label: healthStatusLabel(status),
    detail: missing.length ? `${missing.join("·")} 기록 확인 필요` : `${source} 정상 반영`,
    meta: `알림 ${notifications.length} · 감시 ${watchRuns.length} · 보고 ${reportRuns.length}`,
  };
}

function findWorkflowHealth(workflowHealth = {}, id) {
  return (workflowHealth.workflows || []).find((item) => item.id === id);
}

function worstHealthStatus(statuses = []) {
  const weights = { fail: 4, warn: 3, pending: 2, unknown: 1, ok: 0 };
  if (!statuses.length) return "pending";
  return statuses.reduce((worst, status) => (weights[status] > weights[worst] ? status : worst), "ok");
}

function healthStatusLabel(status) {
  return {
    ok: "정상",
    warn: "주의",
    fail: "실패",
    pending: "대기",
    unknown: "확인",
  }[status] || "확인";
}

function minutesSince(value) {
  const date = parseTimestamp(value);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeMinutes(minutes) {
  if (minutes === null || minutes === undefined) return "-";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function kstDateKey(value) {
  const date = parseTimestamp(value) || new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstMinuteOfDay(value) {
  const date = parseTimestamp(value) || new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function kstHour(value) {
  const date = parseTimestamp(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return parts.find((part) => part.type === "hour")?.value || "";
}

function isDailyReportNotificationForSlot(item = {}, dateKey, slot) {
  const text = `${item.rawTitle || item.type || ""} ${item.messageType || ""}`.toLowerCase();
  const isDaily = /daily_report|일일|언론 동향/.test(text);
  if (!isDaily) return false;
  const title = String(item.rawTitle || item.type || "");
  const titleHasSlot = title.includes(`${dateKey} ${slot}`) || title.includes(`${dateKey}-${slot}`);
  const sentMatchesSlot = item.sentAt && kstDateKey(item.sentAt) === dateKey && kstHour(item.sentAt) === slot;
  return isNotificationSuccess(item) && (titleHasSlot || sentMatchesSlot);
}

function isReportRunForSlot(row = {}, dateKey, slot) {
  const rowDate = row.date || (row.timestamp ? kstDateKey(row.timestamp) : "");
  const rowSlot = String(row.slot || "");
  return rowDate === dateKey && (rowSlot.includes(slot) || kstHour(row.timestamp) === slot);
}

function isNotificationSuccess(item = {}) {
  const text = `${item.status || ""} ${item.rawStatus || ""}`.toLowerCase();
  return text.includes("성공") || text.includes("success") || text.includes("sent");
}

function formatWorkflowConclusion(run) {
  if (!run) return "이력 없음";
  if (run.status === "queued") return "대기";
  if (run.status === "in_progress") return "진행 중";
  return {
    success: "성공",
    failure: "실패",
    cancelled: "취소",
    timed_out: "시간초과",
    action_required: "조치 필요",
  }[run.conclusion] || run.conclusion || run.status || "확인";
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
  const meta = health?.meta || `${watchJob.cadence || "24시간 5분 주기"} · ${watchJob.state || "확인"}`;
  return (
    <section className="panel watch-panel">
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
          <span>24시간 5분 주기</span>
        </div>
      </div>
      <div className="watch-progress"><span /></div>
    </section>
  );
}

function AiUsagePanel({ status }) {
  const gemini = status?.gemini || {};
  const groq = status?.groq || {};
  const rate = groq.rate_limit || {};
  const groqHasKey = groq.has_key !== false;
  const groqHasRate = Boolean(rate.limit_requests || rate.remaining_requests || rate.limit_tokens || rate.remaining_tokens);
  const requestPercent = percentRemaining(rate.remaining_requests, rate.limit_requests);
  const tokenPercent = percentRemaining(rate.remaining_tokens, rate.limit_tokens);
  const reserveValues = [requestPercent, tokenPercent].filter(Number.isFinite);
  const groqReserve = reserveValues.length
    ? Math.round(reserveValues.reduce((sum, value) => sum + value, 0) / reserveValues.length)
    : null;
  const meterFill = Number.isFinite(groqReserve) ? groqReserve : 0;
  const unknownLabel = groqHasKey ? "호출 전" : "키 없음";
  const unknownValue = groqHasKey ? "요약 호출 후 표시" : "GitHub Secret 확인";
  const geminiReport = gemini.latest_report || {};
  const geminiState = formatGeminiState(gemini, geminiReport);
  const geminiDetail = formatGeminiDetail(gemini, geminiReport);
  return (
    <section className="panel ai-usage-panel">
      <div className="ai-usage-head">
        <span><Gauge />API 사용 현황</span>
        <b>{status?.generated_at ? formatCompactDateTime(status.generated_at) : "대기"}</b>
      </div>
      <div className="ai-power-layout">
        <div className="ai-power-meter" style={{ "--meter-fill": `${meterFill}%` }}>
          <div className="ai-power-core">
            <strong>{groqReserve === null ? "--" : groqReserve}</strong>
            <span>{groqReserve === null ? unknownLabel : "% 잔량"}</span>
          </div>
        </div>
        <div className="ai-power-copy">
          <span>AI</span>
          <b>{groq.model || "-"}</b>
        </div>
      </div>
      <div className="ai-meter-bars">
        <AiMeterRow label="일 요청" percent={requestPercent} value={formatLimitPair(rate.remaining_requests, rate.limit_requests, unknownValue)} emptyStatus={unknownLabel} />
        <AiMeterRow label="분당 토큰" percent={tokenPercent} value={formatLimitPair(rate.remaining_tokens, rate.limit_tokens, unknownValue)} emptyStatus={unknownLabel} />
      </div>
      <div className="ai-backup-strip">
        <span>Gemini 상태</span>
        <b>{geminiState}</b>
        <em>{gemini.model || "-"}</em>
        {geminiDetail && <small>{geminiDetail}</small>}
        {gemini.usage_url && <a href={gemini.usage_url} target="_blank" rel="noopener noreferrer">사용량 확인</a>}
      </div>
    </section>
  );
}

function AiMeterRow({ label, percent, value, mode = "remaining", emptyStatus = "대기" }) {
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

function formatLimitPair(remaining, limit, fallback = "다음 호출 후 표시") {
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
  const collapsedLimit = 5;
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
        <b>{health?.detail || "알림톡 이력 확인 대기"}</b>
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
        <span className="detail-kicker">알림톡 발송 내역</span>
        <h2>{item.rawTitle || item.type || "알림톡"}</h2>
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

function JobRows({ rows }) {
  return (
    <div className="job-rows">
      {rows.map((job) => (
        <div key={job.label}>
          <span>{job.label}</span>
          <b>{job.cadence}</b>
          <em>{job.state}</em>
        </div>
      ))}
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
        <span>{reportHealth?.progress || reportHealth?.meta || "08 · 13 · 18 스케줄"}</span>
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
  const visibleRows = compact ? pressRows.slice(0, 5) : pressRows;
  return (
    <div className={detailed ? "press-list detailed" : "press-list"}>
      {visibleRows.map((item) => (
        <button className={`press-row ${onOpenMonitoring ? "clickable" : ""}`} key={item.source} onClick={() => onOpenMonitoring?.({ source: item.source })}>
          <b>{item.source}</b>
          <span className="press-bar"><span style={{ width: `${Math.max(6, (item.total / max) * 100)}%` }} /></span>
          <em>{item.total}건</em>
          {detailed && <small>당사 {item.own} · 부정 {item.negative} · {item.type || "일반"}</small>}
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
    onOpenMonitoring({ category: categoryPresetFor(row.name) });
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

function QuickModule({ icon: Icon, title, body, onClick }) {
  return (
    <button className="quick-module" onClick={onClick}>
      <Icon />
      <span><b>{title}</b><em>{body}</em></span>
      <ChevronRight />
    </button>
  );
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

function RiskPill({ level }) {
  return <div className={`risk-pill ${level.toLowerCase()}`}><ShieldCheck />당사 리스크 <b>{level}</b></div>;
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

function composeRealtimeDataUnused(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const realtimeArticles = filterRowsByPeriod(articles, "daily");
  if (!realtimeArticles.length) {
    return buildDisconnectedPeriodData(base, "최근 24시간 기준 표시할 운영 기사가 없습니다.");
  }
  return {
    ...composePeriodData(base, realtimeArticles, [], true),
    label: "실시간",
    scope: "최근 24시간 · 5분 자동 갱신",
  };
}

function composePeriodData(base, articles, reportRuns = [], liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const runSummary = summarizeReportRuns(reportRuns);
  if (!articles.length && !reportRuns.length) {
    return buildDisconnectedPeriodData(base, "선택 기간 데이터가 없습니다.");
  }
  const usableArticles = articles.filter(isUsableArticle);
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
    scope: usableArticles[0]?.date ? `${usableArticles[0].date} 기준` : base.scope,
    issues: usableArticles.length ? buildIssues(usableArticles, base.issues) : [],
    categoryFlow: groupArticles(usableArticles, "category").slice(0, 6).map(([name, value]) => ({ name, value })),
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
  const important = buildRelatedArticleGroups(usableArticles)
    .filter((article) => article?.title)
    .sort((a, b) => dashboardIssueScore(b) - dashboardIssueScore(a) || articleTimeValue(b) - articleTimeValue(a));
  const uniqueIssues = [];
  for (const article of important) {
    const titleKey = normalizeGroupTitle(article.title || "");
    if (uniqueIssues.some((item) => normalizeGroupTitle(item.title || "") === titleKey)) continue;
    const relatedArticles = dedupeIssueMembers(Array.isArray(article.relatedArticles) && article.relatedArticles.length
      ? article.relatedArticles
      : [article]);
    uniqueIssues.push({
      tone: article.tone,
      category: article.category,
      source: article.source,
      representativeSource: article.representativeSource || article.source,
      title: article.title,
      summary: article.issueSummary || compactArticleSummary(article),
      summaryLines: article.issueSummary ? [article.issueSummary] : buildArticleSummaryLines(article),
      publishedAt: article.time || article.date || "-",
      link: article.link,
      issueSummary: article.issueSummary || "",
      relatedArticles,
      relatedCount: Number(article.relatedCount || relatedArticles.length || 1),
      relatedSourceCount: Number(article.relatedSourceCount || unique(relatedArticles.map((item) => item.source).filter(Boolean)).length || 1),
      relatedSources: article.relatedSources,
    });
    if (uniqueIssues.length >= 5) break;
  }
  return uniqueIssues.length ? uniqueIssues : fallback;
}

function dashboardIssueScore(issue = {}) {
  const members = Array.isArray(issue.relatedArticles) && issue.relatedArticles.length ? issue.relatedArticles : [issue];
  const groupToneScore = Math.max(...members.map((item) => ({ 부정: 420, 주의: 280, 긍정: 170, 중립: 90, 제외: 0 }[item.tone] || 0)));
  const toneScore = Math.max(groupToneScore, { 부정: 420, 주의: 280, 긍정: 170, 중립: 90, 제외: 0 }[issue.tone] || 0);
  const categoryScore = issue.category === "정책/규제" ? 130 : ["GA", "보험사"].includes(issue.category) ? 80 : 0;
  const ownScore = members.some(isOwnArticle) ? 520 : 0;
  const relatedScore = Math.min(Number(issue.relatedCount || 1), 6) * 24;
  return ownScore + toneScore + categoryScore + relatedScore + Number(issue.score || 0);
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
    addBucket((issue) => isOwnArticle(issue), 3);
    addBucket((issue) => ["부정", "주의"].includes(issue.tone), 3);
    addBucket((issue) => issue.category === "정책/규제", 2);
    addBucket((issue) => ["GA", "보험사"].includes(issue.category), 2);
    addBucket(() => true, limit);
    return selected.slice(0, limit);
  }

  addBucket((issue) => isOwnArticle(issue) && issue.tone === "긍정", 3);
  addBucket((issue) => isOwnArticle(issue) && ["부정", "주의", "중립"].includes(issue.tone), 4);
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
  const label = period === "daily" ? "당일" : period === "weekly" ? "주간" : "월간";
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
  const text = summaryHaystack(item);
  const own = isOwnArticle(item);

  if (own && isOwnPerformanceSummaryText(title)) return "own-performance";
  if (isInvestmentSummaryText(title)) return "investment";
  if (isSettlementSupportSummaryText(title)) return "settlement-support";
  if (isInsuranceLossSummaryText(title)) return "insurance-loss";
  if (isPreventiveSecuritySummaryText(title)) return "security";

  if (own && isOwnPerformanceSummaryText(text)) return "own-performance";
  if (isInvestmentSummaryText(text)) return "investment";
  if (isSettlementSupportSummaryText(text)) return "settlement-support";
  if (isInsuranceLossSummaryText(text)) return "insurance-loss";
  if (isPreventiveSecuritySummaryText(text)) return "security";
  return "";
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
  return /정착지원금|1200%|수수료/.test(text) && /GA|보험대리점|설계사|공시/.test(text);
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
  if (!candidates.length) {
    const fallback = normalizeSummaryLine(headlineBasedSummary(representative));
    if (fallback) candidates.push(fallback);
  }
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
  const titleKeys = summaryTitleKeys(item);
  if (Array.isArray(item.summaryLines) && item.summaryLines.length) {
    const explicitLines = dedupeSummaryLines(item.summaryLines.map(normalizeSummaryLine).filter(Boolean), titleKeys)
      .slice(0, 4);
    if (explicitLines.length) return explicitLines;
  }
  const cleanTitle = cleanSummaryText(item.title || "");
  const text = cleanSummaryText(item.summary || item.description || "");
  const sentences = splitSummarySentences(text)
    .map(normalizeSummaryLine)
    .filter((sentence) => sentence && sentence !== cleanTitle && !isGenericSummaryLine(sentence) && !isBrokenSummaryLine(sentence) && !isSummaryDuplicateOfTitle(sentence, titleKeys));
  const primaryTopic = articlePrimarySummaryTopic(item);
  const contextLines = buildContextualSummaryLines(item);
  const titleLine = normalizeSummaryLine(headlineBasedSummary(item));
  if (primaryTopic && contextLines.length) {
    const topicLines = dedupeSummaryLines([...contextLines, titleLine].filter((line) => line && summaryLineMatchesTopic(line, primaryTopic)), titleKeys)
      .slice(0, primaryTopic === "own-performance" ? 2 : 3);
    if (topicLines.length) return topicLines;
  }
  const candidates = contextLines.length >= 2
    ? [...contextLines, ...sentences]
    : [...contextLines, ...sentences, titleLine];
  const lines = dedupeSummaryLines(candidates.filter(Boolean), titleKeys)
    .slice(0, 3);
  if (lines.length) return lines;
  return buildLastResortSummaryLines(item, titleKeys);
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
  if (/우수인증|인증설계사|최다|배출/.test(text) && /인카금융|당사|GA업계/.test(text)) return "own-performance";
  if (/정착지원금|수수료|지급 규모|순위|공시/.test(text) && /GA|보험대리점|설계사/.test(text)) return "settlement-support";
  if (/GA 리포트|리포트성|조직 현황|운영 지표/.test(text)) return "ga-report";
  if (/투자의견|목표가|목표주가|주가|시장 평가|증권가/.test(text)) return "investment";
  if (/금융보안원|해킹|보안|피해 예방/.test(text)) return "security";
  if (/실손|손해율|적자폭|보험 민원|민원/.test(text)) return "insurance-loss";
  if (/보험사기|진단서|데이터 대응|AI를 활용한 보험사기/.test(text)) return "insurance-fraud";
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
    /소비자 피해, 제재, 사칭, 법적 분쟁/.test(text)
  );
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
  if (/보험사기|진단서|데이터\s*전쟁|AI로\s*진단서/i.test(text)) {
    lines.push("AI를 활용한 보험사기 수법 확산과 보험업계 데이터 대응 필요성을 다룬 기사입니다.");
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
  const topic = summarizeRiskTitleTopic(item.title || text);
  const line = normalizeSummaryLine(`${topic} 이슈가 핵심입니다.`);
  return dedupeSummaryLines([line, headlineBasedSummary(item), text], titleKeys).slice(0, 1);
}

function summaryHaystack(item = {}) {
  return cleanSummaryText(`${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`);
}

function isPreventiveSecuritySummary(item = {}) {
  return articlePrimarySummaryTopic(item) === "security";
}

function isInvestmentSummary(item = {}) {
  return articlePrimarySummaryTopic(item) === "investment";
}

function isSettlementSupportSummary(item = {}) {
  return articlePrimarySummaryTopic(item) === "settlement-support";
}

function isInsuranceLossSummary(item = {}) {
  return articlePrimarySummaryTopic(item) === "insurance-loss";
}

function periodScopeLabel(period) {
  return { daily: "일간", weekly: "주간", monthly: "월간" }[period] || "기간";
}

function buildPeriodObservations(data, issues = [], period = "monthly") {
  const summary = data.summary || {};
  const lead = issues[0];
  const topPress = data.pressInfluence?.[0];
  const scope = periodScopeLabel(period);
  const periodIntent = {
    daily: "일간 보고서는 신규 당사 언급과 즉시 확인할 리스크를 우선 배치합니다.",
    weekly: "주간 보고서는 반복 노출과 논조 변화가 있는 이슈를 우선 묶어 봅니다.",
    monthly: "월간 보고서는 누적 관리 대상, 매체 영향도, 키워드 흐름을 함께 봅니다.",
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

function buildWeeklyToneTrend(articles, fallback = []) {
  const dated = articles.filter((article) => article.date);
  if (!dated.length) {
    return ensureTrendHasTone(fallback);
  }
  const latest = lastItem(dated.map((article) => article.date).sort());
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const startTime = latestTime - 30 * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (let index = 0; index < 5; index += 1) {
    buckets.set(index, { date: `${index + 1}주`, positive: 0, negative: 0, caution: 0, neutral: 0 });
  }
  dated.forEach((article) => {
    const time = new Date(`${article.date}T00:00:00+09:00`).getTime();
    if (Number.isNaN(time) || time < startTime || time > latestTime) return;
    const index = Math.min(4, Math.max(0, Math.floor((time - startTime) / (7 * 24 * 60 * 60 * 1000))));
    const bucket = buckets.get(index);
    if (article.tone === "긍정") bucket.positive += 1;
    else if (article.tone === "부정") bucket.negative += 1;
    else if (article.tone === "주의") bucket.caution += 1;
    else bucket.neutral += 1;
  });
  const rows = Array.from(buckets.values());
  const hasSignal = rows.some((row) => row.positive || row.negative || row.caution);
  return hasSignal ? rows : ensureTrendHasTone(fallback);
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
  return groupArticles(pressArticles, "source").slice(0, 10).map(([source, total]) => {
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

const PRESS_ALIAS_DRAFT_KEY = "news_monitor_press_alias_drafts_v1";
const KEYWORD_DRAFT_KEY = "news_monitor_keyword_drafts_v1";
const REPORTER_DRAFT_KEY = "news_monitor_reporter_drafts_v1";

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
  { id: "own", label: "당사", rule: "당사명, 브랜드, 임직원처럼 직접 언급만 당사로 분류합니다." },
  { id: "competitor", label: "경쟁사/GA", rule: "보험, GA, 설계사, 정착지원금 문맥이 함께 있을 때만 경쟁사 이슈로 봅니다." },
  { id: "industry", label: "업계동향", rule: "보험 시장, 판매채널, 소비자 동향처럼 업계 흐름을 추적합니다." },
  { id: "regulation", label: "정책/규제", rule: "금융당국, 수수료, 제도, 법령 이슈를 주의 관찰로 분리합니다." },
  { id: "other", label: "기타", rule: "일반 관심 키워드나 별도 문맥 분석 대상입니다." },
  { id: "exclude", label: "제외 후보", rule: "브랜드평판, 스포츠, 상품명 오탐처럼 수집 제외 후보로 관리합니다." },
];

function readLocalRows(key) {
  try {
    const rows = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocalRows(key, rows) {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Supabase is the source of truth; local storage only keeps the public page responsive.
  }
}

function readLocalReporterState() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(REPORTER_DRAFT_KEY) || "{}");
    if (Array.isArray(stored)) return { rows: stored, hidden: [] };
    return {
      rows: Array.isArray(stored.rows) ? stored.rows : [],
      hidden: Array.isArray(stored.hidden) ? stored.hidden : [],
    };
  } catch {
    return { rows: [], hidden: [] };
  }
}

function writeLocalReporterState(state) {
  try {
    window.localStorage.setItem(REPORTER_DRAFT_KEY, JSON.stringify({
      rows: Array.isArray(state.rows) ? state.rows : [],
      hidden: Array.isArray(state.hidden) ? state.hidden : [],
    }));
  } catch {
    // Local persistence is best-effort; DB persistence is attempted separately.
  }
}

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

function buildMediaMemo(row = {}) {
  const lines = [
    row.beat ? `주요 분야: ${row.beat}` : "",
    row.leadReporter ? `대표 기자: ${row.leadReporter}` : "",
    row.email ? `이메일: ${row.email}` : "",
    row.phone ? `전화: ${row.phone}` : "",
    row.url ? `대표 URL: ${row.url}` : "",
    row.memo ? `메모: ${row.memo}` : "",
  ].filter(Boolean);
  return lines.join("\n");
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
    beat: row.beat || row.memo || "-",
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

function buildReporterMemo(row = {}) {
  const lines = [
    row.beat ? `담당 분야: ${row.beat}` : "",
    row.email ? `이메일: ${row.email}` : "",
    row.phone ? `전화: ${row.phone}` : "",
    row.request ? `요청/선호: ${row.request}` : "",
    row.memo ? `메모: ${row.memo}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function reporterDraftFromRemote(row = {}) {
  return normalizeReporterDraft({
    id: row.id,
    name: row.name,
    media: row.media,
    status: row.status,
    contactDate: row.contact_date,
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
    group.keywords.map((keyword) => ({
      keyword,
      category: categoryMap[group.group] || "other",
      enabled: true,
    })),
  );
}

function normalizeKeywordRow(row) {
  const keyword = String(row?.keyword || "").trim();
  if (!keyword) return null;
  return {
    keyword,
    category: String(row?.category || "other").trim() || "other",
    enabled: row?.enabled !== false,
  };
}

function mergeKeywordRows(remoteRows = [], localRows = []) {
  const map = new Map();
  [...remoteRows, ...localRows].forEach((row) => {
    const normalized = normalizeKeywordRow(row);
    if (normalized?.enabled) map.set(`${normalized.category}:${normalizeKeywordText(normalized.keyword)}`, normalized);
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
      items: items.sort((a, b) => a.keyword.localeCompare(b.keyword, "ko-KR")),
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
    .map((article) => article.date)
    .filter(Boolean)
    .sort()) || "";
}

function filterRowsByPeriod(articles, period) {
  if (!articles.length) return [];
  const dated = articles.filter((article) => article.date);
  if (!dated.length) return articles;
  const latest = lastItem(dated.map((article) => article.date).sort());
  if (!latest) return articles;
  if (period === "daily") return dated.filter((article) => article.date === latest);
  if (period === "monthly") return dated.filter((article) => article.date.startsWith(latest.slice(0, 7)));
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const minTime = latestTime - 6 * 24 * 60 * 60 * 1000;
  return dated.filter((article) => {
    const time = new Date(`${article.date}T00:00:00+09:00`).getTime();
    return time >= minTime && time <= latestTime;
  });
}

function resolveMonitoringDateRange(articles = [], preset = {}) {
  if (preset.startDate || preset.endDate) {
    return {
      start: preset.startDate || preset.endDate || "",
      end: preset.endDate || preset.startDate || "",
    };
  }
  const dated = articles.filter((article) => article.date).map((article) => article.date).sort();
  const latest = dated[dated.length - 1] || "";
  if (!latest) return { start: "", end: "" };
  if (preset.period === "monthly") {
    return { start: `${latest.slice(0, 7)}-01`, end: latest };
  }
  if (preset.period === "weekly") {
    const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
    const start = new Date(latestTime - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { start, end: latest };
  }
  return { start: latest, end: latest };
}

function articleSelectionKey(article = {}) {
  return String(article.id || article.link || `${article.source}-${article.date}-${article.title}`);
}

function buildRegulatorDirectionAnalysis(rows = []) {
  const sourceRows = rows.filter((row) => row?.title);
  const themes = [
    {
      label: "소비자보호",
      note: "민원, 분쟁, 실손 청구, 보험금 지급처럼 소비자 접점 관리가 중심입니다.",
      action: "민원, 분쟁, 실손, 보험금 지급 기준이 고객 안내와 민원 대응 프로세스에 미치는 영향을 확인합니다.",
      pattern: /소비자|민원|분쟁|실손|보험금|청구|유의|보호|피해|장애인|불완전판매|광고/i,
    },
    {
      label: "판매채널/GA",
      note: "GA, 설계사, 수수료, 정착지원금, 부당승환 등 판매 과정의 책임성 강화 신호입니다.",
      action: "GA, 설계사, 수수료, 정착지원금, 광고심의 문맥이 영업 현장 운영 기준과 연결되는지 점검합니다.",
      pattern: /GA|법인보험대리점|대리점|설계사|판매|수수료|정착지원금|부당승환|채널|모집|영업|시책/i,
    },
    {
      label: "건전성/자본",
      note: "지급여력, 자본, 대출채권, 경영개선처럼 재무·자본 관리 흐름입니다.",
      action: "손해율, 지급여력, 자본, 대출채권, 경영개선 이슈가 업권 평판과 거래처 리스크로 번지는지 봅니다.",
      pattern: /지급여력|자본|대출채권|경영개선|건전성|손해율|실적|리스크|적자|충당금/i,
    },
    {
      label: "감독·검사",
      note: "검사, 제재, 내부통제, 감독방향 등 당국의 점검 강도가 드러나는 영역입니다.",
      action: "검사, 제재, 내부통제, 공시, 승인 조건처럼 후속 조치가 필요한 항목을 별도로 추적합니다.",
      pattern: /검사|제재|내부통제|감독|업무설명회|운영계획|관리 강화|공시|승인|조건부|보고|제도/i,
    },
    {
      label: "디지털/보안",
      note: "마이데이터, 해킹, 보안, AI, 플랫폼처럼 기술·데이터 운영 리스크가 포함됩니다.",
      action: "금융보안, 개인정보, AI, 플랫폼 관련 보도는 보안 점검과 데이터 처리 기준 변화 여부를 확인합니다.",
      pattern: /디지털|보안|해킹|AI|마이데이터|플랫폼|전산|개인정보|침해|금융보안/i,
    },
  ].map((theme) => ({
    ...theme,
    matches: sourceRows.filter((row) => theme.pattern.test(regulatorText(row))),
  })).map((theme) => ({
    ...theme,
    count: theme.matches.length,
    examples: unique(theme.matches.map((row) => normalizeRegulatorDisplayTitle(row.title)).filter(Boolean)).slice(0, 2),
  }));
  const ranked = themes.sort((a, b) => b.count - a.count);
  const top = ranked.find((theme) => theme.count > 0) || ranked[0];
  const second = ranked.find((theme) => theme.count > 0 && theme.label !== top.label);
  const latest = [...sourceRows].sort((a, b) => articleTimeValue(b) - articleTimeValue(a))[0];
  const headline = rows.length
    ? `${top.label} 중심의 당국 신호가 가장 강하게 잡힙니다`
    : "선택된 보도자료가 없습니다";
  const summary = rows.length
    ? `${rows.length.toLocaleString("ko-KR")}건 기준으로 ${top.label}${second ? `와 ${second.label}` : ""} 흐름이 우선 관찰됩니다. 최신 보도 "${normalizeRegulatorDisplayTitle(latest?.title)}"는 시행 대상, 후속 가이드, 현장 적용 기준을 분리해 확인하는 것이 좋습니다.`
    : "보도자료를 선택하면 선택 묶음 기준으로 당국 방향성을 분석합니다.";
  return {
    headline,
    summary,
    themes: ranked.slice(0, 5),
    impactCards: buildRegulatorImpactCards(ranked),
    watchItems: buildRegulatorWatchItems(sourceRows, ranked),
  };
}

function regulatorText(row = {}) {
  return `${row.title || ""} ${row.summary || ""} ${row.description || ""} ${row.keyword || ""} ${row.category || ""}`;
}

function buildRegulatorImpactCards(themes = []) {
  const activeThemes = themes.filter((theme) => theme.count > 0);
  const cards = (activeThemes.length ? activeThemes : themes).slice(0, 3).map((theme) => ({
    label: theme.label,
    value: theme.count > 0 ? "우선 점검" : "관찰 유지",
    detail: theme.action || theme.note,
  }));
  while (cards.length < 3) {
    cards.push({
      label: "후속 보도",
      value: "대기",
      detail: "선택한 보도자료가 늘어나면 시행일, 대상 업권, 후속 브리핑 기준으로 세부 분석을 보강합니다.",
    });
  }
  return cards;
}

function buildRegulatorWatchItems(rows = [], themes = []) {
  if (!rows.length) return ["보도자료를 선택하면 시행 대상, 후속 일정, 영업 영향 기준으로 분석합니다."];
  const top = themes.find((theme) => theme.count > 0);
  const latest = [...rows].sort((a, b) => articleTimeValue(b) - articleTimeValue(a))[0];
  const items = [];
  if (top) items.push(top.action);
  if (themes.find((theme) => theme.label === "판매채널/GA" && theme.count > 0)) {
    items.push("GA·설계사 관련 항목은 모집 절차, 광고심의, 수수료·정착지원금 관리 기준과 연결해 봅니다.");
  }
  if (themes.find((theme) => theme.label === "소비자보호" && theme.count > 0)) {
    items.push("소비자보호 항목은 민원, 불완전판매, 보험금 지급 안내 문구에 반영할 필요가 있는지 확인합니다.");
  }
  if (latest?.title) {
    items.push(`최신 보도 "${normalizeRegulatorDisplayTitle(latest.title)}"의 시행일과 적용 대상 업권을 확인합니다.`);
  }
  return unique(items).slice(0, 4);
}

function selectRegulatorRows(articles = []) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const source = String(article.source || "");
      const link = String(article.link || article.url || "");
      return /금융감독원|금융위원회/.test(source) || /fss\.or\.kr|fsc\.go\.kr/.test(link);
    })
    .filter((article) => {
      const title = normalizeRegulatorDisplayTitle(article.title);
      const key = `${article.date || ""}:${article.source || ""}:${title}`;
      if (!title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => articleTimeValue(b) - articleTimeValue(a));
}

function normalizeRegulatorDisplayTitle(value) {
  return String(value || "")
    .replace(/\s+-\s+금융(?:위원회|감독원).*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRelatedArticleGroups(articles = []) {
  const groups = [];
  articles.forEach((article, index) => {
    const seed = articleGroupSeed(article);
    const target = groups.find((group) => areRelatedArticleSeeds(seed, group.seed));
    if (target) {
      target.members.push(article);
      target.seed = mergeGroupSeed(target.seed, seed);
    } else {
      groups.push({ seed, members: [article], index });
    }
  });

  return groups
    .map((group) => {
      const members = [...group.members].sort(compareArticleImportance);
      const representative = members[0] || {};
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
  const tokens = articleTokens(`${canonical} ${summaryTokens.join(" ")} ${article.keyword || ""}`);
  return {
    canonical,
    topic,
    tokens,
    tokenSet: new Set(tokens),
  };
}

function mergeGroupSeed(current, next) {
  const tokens = unique([...(current.tokens || []), ...(next.tokens || [])]);
  return {
    canonical: current.canonical.length >= next.canonical.length ? current.canonical : next.canonical,
    topic: current.topic || next.topic || "",
    tokens,
    tokenSet: new Set(tokens),
  };
}

function areRelatedArticleSeeds(a, b) {
  if (!a.canonical || !b.canonical) return false;
  if (a.topic && b.topic && a.topic === b.topic) return true;
  const shorter = a.canonical.length < b.canonical.length ? a.canonical : b.canonical;
  const longer = a.canonical.length < b.canonical.length ? b.canonical : a.canonical;
  if (shorter.length >= 22 && longer.includes(shorter)) return true;
  if (a.canonical.slice(0, 28) === b.canonical.slice(0, 28)) return true;
  const overlap = tokenOverlapRatio(a.tokenSet, b.tokenSet);
  return overlap >= 0.62 || (overlap >= 0.48 && sharedLongToken(a.tokens, b.tokens));
}

function articleTopicSignature(article = {}) {
  const text = normalizeGroupTitle(`${article.title || ""} ${article.summary || article.description || ""} ${article.keyword || ""}`);
  const includesAll = (terms) => terms.every((term) => text.includes(normalizeGroupTitle(term)));
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
  const stop = new Set(["기자", "뉴스", "보도", "관련", "통해", "대한", "위해", "올해", "지난", "이번", "추진", "확산", "맞손", "역량", "마음", "지원", "강화", "본격화"]);
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
  return unique(fromData.length ? fromData : fallback).slice(0, 10);
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
  if (articleKeyword === normalizedKeyword) return true;
  const haystack = normalizeKeywordText(`${article.title || ""} ${article.summary || ""} ${article.keyword || ""}`);
  if (haystack.includes(normalizedKeyword)) return true;
  const tokens = normalizedKeyword.split(" ").filter((token) => token.length > 1);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
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
  return article && article.tone !== "제외" && article.category !== "제외" && !isStockListingNoiseArticle(article);
}

function isOwnArticle(article) {
  if (isStockListingNoiseArticle(article)) return false;
  return article.category === "당사" || /인카금융|인카금융서비스/i.test(`${article.title} ${article.keyword} ${article.summary}`);
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

function categoryPresetFor(value) {
  if (/GA/i.test(value)) return "GA";
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
    label: "실시간",
    scope: realtimeArticles[0]?.date ? `${realtimeArticles[0].date} 당일 기사` : "당일 기사",
  };
}

createRoot(document.getElementById("root")).render(<App />);
