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
  deleteReporterProfile,
  generatePressReleaseWithGemini,
  loadOperationalData,
  saveArticleScrap,
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
  pressRelease: Megaphone,
  stocks: WalletCards,
  gaIntel: Building2,
  scraps: Bookmark,
  risk: ShieldCheck,
  reports: FileText,
  management: Settings,
};

const navSections = [
  { title: "언론 / PR", ids: ["overview", "monitoring", "media", "regulators", "pressRelease", "scraps", "risk", "reports"] },
  { title: "공시 · 주가", ids: ["stocks"] },
  { title: "GA 경쟁", ids: ["gaIntel"] },
  { title: "운영", ids: ["management"] },
];

const navItemMap = new Map(navItems.map((item) => [item.id, item]));

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
    () => composePeriodData(baseData, scopedArticles, scopedReportRuns, liveConnected, period),
    [baseData, scopedArticles, scopedReportRuns, liveConnected, period],
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

  const View = {
    overview: Overview,
    monitoring: Monitoring,
    regulators: Regulators,
    media: MediaAnalysis,
    pressRelease: PressReleaseStudio,
    stocks: StockMarketDashboard,
    gaIntel: GACompetitorIntel,
    scraps: Scraps,
    risk: RiskCenterV2,
    reports: Reports,
    management: Management,
  }[activeSection] || Overview;

  return (
    <div className="app-shell">
      <Header working={working} workLabel={workLabel} />
      <aside className="side-nav" aria-label="주요 메뉴">
        <div className="side-title">PR Intelligence</div>
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
        <img
          className="brand-logo"
          src={`${import.meta.env.BASE_URL || "./"}assets/incar-signature-blue-ko.png`}
          alt="인카금융서비스"
        />
        <div className="brand-copy">
          <strong>PR 인텔리전스 센터</strong>
          <span>언론 · 공시 · 시장 관제</span>
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

      <TerminalCommandBar
        data={data}
        summary={summary}
        operationsHealth={operationsHealth}
        notificationHealth={notificationHealth}
        reportHealth={reportHealth}
        onOpenMonitoring={onOpenMonitoring}
      />

      <section className="terminal-dashboard-grid">
        <div className="terminal-main-stack">
          <RiskPriorityQueue issues={data.issues} onOpenMonitoring={onOpenMonitoring} />
          <section className="terminal-analysis-board">
            <Panel title="분류별 기사량" icon={LineChart} meta="기간 기준">
              <CategoryChart rows={data.categoryFlow} verticalBars />
            </Panel>
            <Panel title="언론사 영향도" icon={Building2} meta="노출량 · 당사 · 부정">
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
        />
      </section>

    </main>
  );
}


function TerminalCommandBar({ data, summary, operationsHealth, notificationHealth, reportHealth, onOpenMonitoring }) {
  const risk = summary?.risk || operationsHealth?.statusLabel || "LOW";
  const negative = Number(summary?.ownNegative || 0);
  const caution = Number(summary?.caution || 0);
  const ownMentions = Number(summary?.ownMentions || 0);
  const latest = data?.generatedAt || summary?.watchTime || "-";
  const reportText = compactHealthText(reportHealth, "보고서 확인");
  const notificationText = compactHealthText(notificationHealth, "알림 확인");
  return (
    <section className={`terminal-command-bar risk-${String(risk).toLowerCase()}`}>
      <div className="terminal-brief">
        <span>MEDIA RISK COMMAND</span>
        <h2>{summary?.headline || "운영 DB 로그인 후 실제 수집/분석 수치가 표시됩니다."}</h2>
        <p>{data?.scope || "전체"} · 마지막 갱신 {latest}</p>
      </div>
      <div className="terminal-metrics">
        <button type="button" onClick={() => onOpenMonitoring?.({ category: "당사" })}>
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
        <button type="button" onClick={() => onOpenMonitoring?.({ category: "당사" })}>
          <span>Own</span>
          <b>{ownMentions.toLocaleString("ko-KR")}</b>
          <em>당사 언급</em>
        </button>
      </div>
      <div className="terminal-ops-summary">
        <div>
          <span>보고서 자동화</span>
          <b>{reportText}</b>
        </div>
        <div>
          <span>알림톡 발송</span>
          <b>{notificationText}</b>
        </div>
      </div>
    </section>
  );
}

function compactHealthText(item, fallback) {
  if (!item) return fallback;
  const status = item.label || healthStatusLabel(item.status) || "확인";
  const detail = item.value || item.detail || "";
  return detail ? `${status} · ${detail}` : status;
}

function RiskPriorityQueue({ issues = [], onOpenMonitoring }) {
  const ranked = [...(issues || [])]
    .sort((a, b) => toneRank(b.tone) - toneRank(a.tone))
    .slice(0, 6);
  return (
    <section className="risk-priority-queue">
      <div className="queue-head">
        <div>
          <span>핵심 관찰</span>
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
              <ArticleSummaryBlock item={issue} dense />
            </div>
            {issue.link && issue.link !== "#" && (
              <a href={issue.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, issue.link)}>
                <ExternalLink /> 열기
              </a>
            )}
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
}) {
  return (
    <aside className="ops-status-rail">
      <div className="ops-rail-head">
        <span>OPERATIONS</span>
        <b>감시 · 발송 · API</b>
      </div>
      <WatchPanel jobs={jobs} risk={summary?.risk} health={watchHealth} />
      <AiUsagePanel status={operations?.aiStatus} />
      <Panel title="알림톡 발송 이력" icon={Bell} meta={`최근 ${notifications.length.toLocaleString("ko-KR")}건`}>
        <NotificationStatusSummary health={notificationHealth} total={notifications.length} />
        <NotificationList rows={notifications} />
      </Panel>
      <Panel title="보고서 자동화" icon={CalendarDays} meta="08 · 13 · 18">
        <ReportAutomationStatus reportHealth={reportHealth} actionsHealth={actionsHealth} historyHealth={historyHealth} />
      </Panel>
    </aside>
  );
}

function Monitoring({ data, articles, scraps = [], monitoringPreset, operations, isWorking, onRefreshOperations, onFeedbackSaved, onScrapSaved }) {
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
  const applyFilters = () => {
    applyDateFilter();
    setQuery(queryInput);
    setVisible(30);
  };

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
              className="ghost-button monitoring-action-button"
              onClick={() => onRefreshOperations?.({ trigger: true, source: "monitoring_feed" })}
              disabled={isLoading}
            >
              <RefreshCw />갱신
            </button>
            <button type="button" className="primary-button monitoring-action-button"><Download />CSV 출력</button>
          </div>
        )}
      />
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
        <button className="primary-button filter-action" onClick={applyFilters}>
          조회/검색
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
        <button
          type="button"
          className="ghost-button filter-action"
          onClick={() => onRefreshOperations?.({ trigger: true, workflow: "regulator-releases.yml", source: "regulator_releases", label: "금융당국 보도자료 갱신" })}
          disabled={operations?.status === "loading" || isWorking}
        >
          <RefreshCw />갱신
        </button>
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

function StockMarketDashboard({ stockMarket }) {
  const [stockRange, setStockRange] = useState("60d");
  const company = stockMarket?.company || {};
  const summary = stockMarket?.summary || {};
  const indices = stockMarket?.indices || [];
  const peerGroups = stockMarket?.peerGroups || [];
  const relativeTrend = stockMarket?.relativeTrend || [];
  const dartDisclosures = stockMarket?.dartDisclosures || stockMarket?.dart_disclosures || {};
  const hasData = company?.status === "ok";
  const companyLink = company?.code ? `https://finance.naver.com/item/main.naver?code=${company.code}` : "#";
  const regularMarket = company.regular_market || {};
  const nxtMarket = company.nxt_market || {};
  const integratedMarket = company.integrated_market || {};
  const priceGap = company.price_gap || {};
  const activeMarketLabel = company.latest?.source_market === "nxt" ? "NXT 관찰가" : "KRX 관찰가";
  const tradedAt = company.latest?.traded_at || regularMarket.traded_at || nxtMarket.traded_at || "";
  const rangeWindows = company.range_windows || {};
  const stockRangeOptions = [
    { id: "20d", label: "20거래일" },
    { id: "60d", label: "60거래일" },
    { id: "120d", label: "120거래일" },
  ].filter((item) => rangeWindows[item.id]?.high || company.returns?.[item.id] !== undefined);
  const activeRangeKey = stockRangeOptions.some((item) => item.id === stockRange) ? stockRange : (stockRangeOptions[0]?.id || "60d");
  const activeRangeLabel = stockRangeOptions.find((item) => item.id === activeRangeKey)?.label || "선택 기간";
  const activeRange = rangeWindows[activeRangeKey] || rangeWindows["60d"] || {};
  const activeTrend = sliceStockTrend(relativeTrend, activeRangeKey);
  const activePeerReturn = averagePeerReturnByPeriod(peerGroups, activeRangeKey);
  const activeKospiReturn = indexReturnByPeriod(indices, "KOSPI", activeRangeKey);

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Market Control"
        title="주가·시장 관제 대시보드"
        description="정규장, NXT, 동종업계, 시장지수를 한 화면에서 비교해 주가성 기사와 실제 가격 흐름을 분리합니다."
        right={(
          <div className="page-actions">
            <a className="ghost-button" href={companyLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink />네이버 금융
            </a>
            <a className="ghost-button" href="https://www.nextrade.co.kr/" target="_blank" rel="noopener noreferrer">
              <ExternalLink />NXT
            </a>
          </div>
        )}
      />

      {!hasData ? (
        <section className="panel empty-state-panel">
          <h2><WalletCards />주가 데이터 수집 대기</h2>
          <p>다음 대시보드 배포 시 네이버 금융 차트 데이터를 수집해 표시합니다.</p>
        </section>
      ) : (
        <>
          <section className="stock-command-center">
            <div className="stock-command-main">
              <span className="live-label"><span /> STOCK MARKET BRIEFING</span>
              <h2>{buildStockRangeHeadline(company, summary, activeRange, activeRangeLabel)}</h2>
              <p>
                {formatStockTimestamp(tradedAt, stockMarket?.as_of || company.latest?.date)} 기준 ·
                {stockMarket?.source || "Naver Finance realtime/chart data"}
              </p>
              <div className="stock-commentary">
                {buildStockRangeFacts(company, summary, activeRange, activeRangeLabel, activePeerReturn, activeKospiReturn).map((line) => <span key={line}>{line}</span>)}
              </div>
            </div>
            <div className={`stock-price-board ${stockToneClass(company.latest?.change_rate)}`}>
              <div className="stock-price-board-top">
                <span>{activeMarketLabel}</span>
                <em>{formatMarketStatus(company.latest?.market_status || regularMarket.status || nxtMarket.status)}</em>
              </div>
              <b>{formatStockPrice(company.latest?.price)}</b>
              <strong>{formatSignedNumber(company.latest?.change)} · {formatStockPercent(company.latest?.change_rate)}</strong>
              <small>통합 거래량 {formatStockVolume(integratedMarket.volume || company.latest?.volume)}</small>
            </div>
          </section>

          <section className="stock-source-grid">
            <StockSourceTile
              label="KRX 정규장"
              status={regularMarket.status}
              price={regularMarket.price}
              change={regularMarket.change}
              changeRate={regularMarket.change_rate}
              volume={regularMarket.volume}
              tradedAt={regularMarket.traded_at}
            />
            <StockSourceTile
              label="NXT 마켓"
              status={nxtMarket.status}
              price={nxtMarket.price}
              change={nxtMarket.change}
              changeRate={nxtMarket.change_rate}
              volume={nxtMarket.volume}
              tradedAt={nxtMarket.traded_at}
              empty={!nxtMarket.available}
            />
            <StockMetricCard
              icon={Activity}
              label="NXT 가격 차이"
              value={priceGap.available ? `${formatSignedNumber(priceGap.price)}원` : "미수집"}
              detail={priceGap.available ? `${priceGap.label} · ${formatStockPercent(priceGap.rate)}` : "정규장 대비 비교 대기"}
              toneValue={priceGap.price}
            />
            <StockMetricCard
              icon={WalletCards}
              label="통합 거래대금"
              value={formatStockTradingValue(integratedMarket.trading_value)}
              detail={`거래량 ${formatStockVolume(integratedMarket.volume || company.latest?.volume)}`}
            />
          </section>

          <StockDisclosureBoard disclosures={dartDisclosures} companyName={company.name || "인카금융서비스"} />

          <section className="stock-range-board">
            <div className="stock-range-head">
              <div>
                <span>기간별 판단</span>
                <h3>{activeRangeLabel} 주가 위치</h3>
              </div>
              <div className="stock-range-tabs">
                {stockRangeOptions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={activeRangeKey === item.id ? "active" : ""}
                    onClick={() => setStockRange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stock-range-cards">
              <StockRangeCard
                label="선택기간 수익률"
                value={formatStockPercent(activeRange.return ?? company.returns?.[activeRangeKey])}
                detail={`${formatStockDate(activeRange.start_date)}~${formatStockDate(activeRange.end_date || company.latest?.date)}`}
                toneValue={activeRange.return ?? company.returns?.[activeRangeKey]}
              />
              <StockRangeCard
                label="기간 고점"
                value={formatStockPrice(activeRange.high)}
                detail={`${formatStockDate(activeRange.high_date)} 고점 · 현재 ${formatStockPercent(activeRange.drawdown_from_high)}`}
                toneValue={activeRange.drawdown_from_high}
              />
              <StockRangeCard
                label="기간 저점"
                value={formatStockPrice(activeRange.low)}
                detail={`${formatStockDate(activeRange.low_date)} 저점 · 저점 대비 ${formatStockPercent(activeRange.rebound_from_low)}`}
                toneValue={activeRange.rebound_from_low}
              />
              <StockRangeCard
                label="비교군 대비"
                value={formatStockPercent(safeNumberDiff(activeRange.return ?? company.returns?.[activeRangeKey], activePeerReturn))}
                detail={`동종 ${formatStockPercent(activePeerReturn)} · KOSPI ${formatStockPercent(activeKospiReturn)}`}
                toneValue={safeNumberDiff(activeRange.return ?? company.returns?.[activeRangeKey], activePeerReturn)}
              />
            </div>
          </section>

          <section className="stock-insight-board">
            <div>
              <span>시장 판단</span>
              <b>{buildStockMarketJudgement(company, summary, activeRange)}</b>
              <p>{buildStockMarketReason(company, summary, activeRange, activeRangeLabel, activePeerReturn, activeKospiReturn)}</p>
            </div>
          </section>

          <section className="stock-dashboard-grid">
            <Panel title="상대 주가 흐름" icon={LineChart} meta={`${activeRangeLabel} · 첫날 100 기준`}>
              <StockTrendChart rows={activeTrend} />
            </Panel>
            <Panel title="시장 지수" icon={Activity} meta="KOSPI · KOSDAQ">
              <MarketIndexCards rows={indices} />
            </Panel>
          </section>

          <section className="stock-peer-section">
            {peerGroups.map((group) => (
              <Panel
                key={group.name}
                title={group.name}
                icon={Building2}
                meta={`20일 평균 ${formatStockPercent(group.average_20d_return)}`}
              >
                <StockPeerTable rows={group.stocks || []} />
              </Panel>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function StockSourceTile({ label, status, price, change, changeRate, volume, tradedAt, empty = false }) {
  const tone = stockToneClass(changeRate);
  return (
    <article className={`stock-source-tile ${tone} ${empty ? "empty" : ""}`}>
      <div>
        <span>{label}</span>
        <em>{empty ? "미수집" : formatMarketStatus(status)}</em>
      </div>
      <b>{empty ? "-" : formatStockPrice(price)}</b>
      <strong>{empty ? "NXT 가격 미수집" : `${formatSignedNumber(change)} · ${formatStockPercent(changeRate)}`}</strong>
      <small>{formatStockTimestamp(tradedAt, "") || "시각 확인 대기"} · 거래량 {formatStockVolume(volume)}</small>
    </article>
  );
}

function StockMetricCard({ icon: Icon, label, value, detail, toneValue }) {
  return (
    <article className={`stock-metric-card ${stockToneClass(toneValue)}`}>
      <Icon />
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </article>
  );
}

function StockRangeCard({ label, value, detail, toneValue }) {
  return (
    <article className={`stock-range-card ${stockToneClass(toneValue)}`}>
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </article>
  );
}

function StockDisclosureBoard({ disclosures = {}, companyName = "인카금융서비스" }) {
  const items = Array.isArray(disclosures) ? disclosures : (disclosures.items || []);
  const visibleItems = items.slice(0, 4);
  const status = disclosures.status || (visibleItems.length ? "ok" : "empty");
  const emptyTitle = status === "error" ? "OpenDART 인증 확인 필요" : "OpenDART 연결 대기";
  const emptyMessage = status === "error"
    ? (disclosures.message || "OpenDART 호출 중 오류가 발생했습니다. GitHub Secret의 API 키 값을 확인하세요.")
    : "DART API 키와 기업 고유번호를 연결하면 기업설명회, 실적, 사업보고서 공시가 이 영역에 자동 표시됩니다.";
  const dartSearchUrl = `https://dart.fss.or.kr/dsab007/main.do?textCrpNM=${encodeURIComponent(companyName)}`;
  return (
    <section className="stock-disclosure-board">
      <div className="stock-disclosure-head">
        <div>
          <span>DART / IR CHECK</span>
          <h3>최근 공시·IR 체크</h3>
          <p>기업설명회, 실적 공시, 정기보고서처럼 주가 판단에 영향을 줄 수 있는 자료를 함께 봅니다.</p>
        </div>
        <div className="stock-disclosure-actions">
          <em>{dartDisclosureStatusLabel(status)}</em>
          <a className="ghost-button" href={dartSearchUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />DART 검색
          </a>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="stock-disclosure-list">
          {visibleItems.map((item, index) => (
            <article key={`${item.receipt_no || item.title || "dart"}-${index}`} className="stock-disclosure-card">
              <div>
                <span>{item.type || "공시"}</span>
                <em>{formatStockDate(item.date || item.raw_date)}</em>
              </div>
              <b>{item.title || "공시 제목 확인 필요"}</b>
              <p>{item.summary || "주가 판단에 영향을 줄 수 있는 공시성 이벤트로 별도 확인합니다."}</p>
              <a href={item.link || dartSearchUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, item.link || dartSearchUrl)}>
                공시 열기 <ExternalLink />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className="stock-disclosure-empty">
          <FileText />
          <div>
            <b>{emptyTitle}</b>
            <p>{emptyMessage}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function dartDisclosureStatusLabel(status) {
  if (status === "ok") return "자동 수집";
  if (status === "error") return "연결 확인";
  if (status === "not_configured") return "키 설정 필요";
  return "공시 대기";
}

function StockTrendChart({ rows = [] }) {
  const visibleRows = rows.filter((row) => row.company || row.kospi || row.peer);
  if (!visibleRows.length) return <p className="a4-empty">상대 흐름 데이터가 없습니다.</p>;
  return (
    <div className="chart-box stock-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={visibleRows} margin={{ left: 0, right: 14, top: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value))}`} />
          <Tooltip formatter={(value, name) => [formatIndexPoint(value), stockSeriesLabel(name)]} />
          <Line type="monotone" dataKey="company" name="company" stroke="#2855d9" strokeWidth={3} dot={false} connectNulls />
          <Line type="monotone" dataKey="peer" name="peer" stroke="#14805f" strokeWidth={2.5} dot={false} connectNulls />
          <Line type="monotone" dataKey="kospi" name="kospi" stroke="#b45309" strokeWidth={2.2} dot={false} strokeDasharray="5 4" connectNulls />
        </RechartsLineChart>
      </ResponsiveContainer>
      <div className="stock-chart-legend">
        <span className="company">인카금융서비스</span>
        <span className="peer">동종 평균</span>
        <span className="kospi">KOSPI</span>
      </div>
    </div>
  );
}

function MarketIndexCards({ rows = [] }) {
  return (
    <div className="market-index-grid">
      {rows.map((row) => (
        <article key={row.code} className={`market-index-card ${stockToneClass(row.latest?.change_rate)}`}>
          <span>{row.name}</span>
          <b>{formatStockPrice(row.latest?.price, 2)}</b>
          <em>{formatStockPercent(row.latest?.change_rate)}</em>
          <small>20일 {formatStockPercent(row.returns?.["20d"])} · 60일 {formatStockPercent(row.returns?.["60d"])}</small>
        </article>
      ))}
    </div>
  );
}

function StockPeerTable({ rows = [] }) {
  if (!rows.length) return <p className="a4-empty">비교 종목 데이터가 없습니다.</p>;
  return (
    <div className="stock-table-wrap">
      <table className="stock-table">
        <colgroup>
          <col className="stock-col-name" />
          <col className="stock-col-price" />
          <col className="stock-col-price" />
          <col className="stock-col-gap" />
          <col className="stock-col-return" />
          <col className="stock-col-return" />
          <col className="stock-col-drawdown" />
        </colgroup>
        <thead>
          <tr>
            <th>종목</th>
            <th>KRX</th>
            <th>NXT</th>
            <th>NXT 차이</th>
            <th>1일</th>
            <th>20일</th>
            <th>고점대비</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td><b>{row.name}</b><span>{row.code}</span></td>
              <td>{formatStockPrice(row.regular_market?.price || row.latest?.price)}</td>
              <td>{row.nxt_market?.available ? formatStockPrice(row.nxt_market?.price) : "-"}</td>
              <td className={stockToneClass(row.price_gap?.price)}>{row.price_gap?.available ? `${formatSignedNumber(row.price_gap?.price)}원` : "-"}</td>
              <td className={stockToneClass(row.returns?.["1d"])}>{formatStockPercent(row.returns?.["1d"])}</td>
              <td className={stockToneClass(row.returns?.["20d"])}>{formatStockPercent(row.returns?.["20d"])}</td>
              <td className={stockToneClass(row.range?.drawdown_from_60d_high)}>{formatStockPercent(row.range?.drawdown_from_60d_high)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GACompetitorIntel({ gaIntel }) {
  const data = gaIntel || gaCompetitorSeed;
  const labels = Array.isArray(data?.labels) ? data.labels : gaCompetitorSeed.labels;
  const companies = Array.isArray(data?.companies) && data.companies.length ? data.companies : gaCompetitorSeed.companies;
  const market = Array.isArray(data?.market) && data.market.length ? data.market : gaCompetitorSeed.market;
  const revenueTracker = Array.isArray(data?.revenueTracker) && data.revenueTracker.length
    ? data.revenueTracker
    : gaCompetitorSeed.revenueTracker;
  const companyKey = data?.companyKey || "인카금융서비스";
  const ownCompany = companies.find((row) => String(row.short || row.name || "").includes(companyKey))
    || companies.find((row) => String(row.name || "").includes("인카"))
    || companies[0]
    || {};
  const rows = buildGaCompanyRows(companies, labels);
  const ownRow = rows.find((row) => row.short === ownCompany.short) || rows[0] || {};
  const marketLatest = market[market.length - 1] || {};
  const marketIndex = buildGaMarketIndex(ownRow, marketLatest);
  const trendRows = buildGaTrendRows(labels, ownCompany, market);
  const plannerRows = rows.slice(0, 10);
  const revenueRows = normalizeRevenueTracker(revenueTracker);
  const annual2025 = revenueRows.find((row) => row.period === "2025") || {};
  const q12026 = revenueRows.find((row) => row.period === "2026Q1") || {};
  const h12026 = revenueRows.find((row) => row.period === "2026H1") || {};

  return (
    <main className="workspace ga-intel-workspace">
      <PageTitle
        eyebrow="GA Competitive Intelligence"
        title="GA 경쟁사 인텔"
        description="상단 콘솔은 인카금융서비스 기준으로 고정하고, 경쟁사와 시장 평균은 비교 맥락으로만 표시합니다."
        right={(
          <div className="page-actions">
            <a className="ghost-button" href="https://gapub.insure.or.kr/gongsimain/mainSearch.do" target="_blank" rel="noopener noreferrer">
              <ExternalLink />통합공시
            </a>
            <a className="ghost-button" href="https://dart.fss.or.kr/" target="_blank" rel="noopener noreferrer">
              <ExternalLink />DART
            </a>
          </div>
        )}
      />

      <section className="ga-hero">
        <div className="ga-hero-main">
          <span className="live-label"><span /> INCAR CONSOLE</span>
          <h2>인카금융서비스 기준 경쟁 포지션</h2>
          <p>{data?.source?.title || gaCompetitorSeed.source.title}</p>
          <div className="ga-hero-callout">
            <b>{buildGaConsoleJudgement(ownRow, marketLatest)}</b>
            <span>경쟁사 수치는 비교군이며, 상단 판단은 설계사 규모·유지율·불완전판매율·매출 추적 모두 당사 기준으로 계산합니다.</span>
          </div>
        </div>
        <div className="ga-hero-revenue">
          <span>매출 추적</span>
          <b>{formatGaRevenue(annual2025.amount)}</b>
          <em>2025 연간 · {annual2025.status || "확인"}</em>
          <small>2026 1Q {formatGaRevenue(q12026.amount)} · 상반기 {h12026.status || "공시 대기"}</small>
        </div>
      </section>

      <section className="ga-console-grid">
        <GAMetricCard icon={Users} label="설계사수" value={`${formatGaInteger(ownRow.planners)}명`} detail={`${ownRow.rank}위 · 2025년 말`} />
        <GAMetricCard icon={Gauge} label="정착률" value={formatGaPercentPlain(ownRow.stay)} detail={`시장 평균 ${formatGaPercentPlain(marketLatest.stay)}`} />
        <GAMetricCard icon={ShieldCheck} label="13회 유지율" value={formatGaPercentPlain(ownRow.retention13Life)} detail={`생보 기준 · 시장 대비 ${formatGaPointGap(ownRow.retention13Life, marketLatest.retention13Life)}`} />
        <GAMetricCard icon={AlertTriangle} label="불완전판매율" value={formatGaPercentPlain(ownRow.poorSalesLife, 2)} detail="생보 기준 · 0% 유지 추적" tone={Number(ownRow.poorSalesLife) <= 0 ? "good" : "watch"} />
      </section>

      <section className="ga-revenue-board">
        <div className="ga-section-title">
          <h2><WalletCards />매출 공시 추적</h2>
          <span>분기 · 반기 · 연간 확인값 기준</span>
        </div>
        <div className="ga-revenue-body">
          <GARevenueTrendChart rows={revenueRows} />
          <div className="ga-revenue-ledger">
            {revenueRows.map((row) => (
              <article key={row.period} className={row.amount ? "confirmed" : "pending"}>
                <div>
                  <span>{row.label}</span>
                  <b>{row.amount ? formatGaRevenue(row.amount) : row.status}</b>
                </div>
                <p>{row.note}</p>
                {row.sourceUrl ? (
                  <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
                    근거 확인 <ExternalLink />
                  </a>
                ) : <em>{row.sourceLabel}</em>}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ga-dashboard-grid">
        <Panel title="설계사 규모 비교" icon={Building2} meta="2025년 말 · 상위 10개사">
          <GAPlannerBarChart rows={plannerRows} ownShort={ownRow.short} />
        </Panel>
        <Panel title="당사 품질 지표 추이" icon={LineChart} meta="인카 vs 시장 평균">
          <GATrendChart rows={trendRows} />
        </Panel>
      </section>

      <section className="ga-dashboard-grid secondary">
        <Panel title="당사 핵심 지표" icon={Activity} meta="시장 평균 대비">
          <div className="ga-index-list">
            {marketIndex.map((item) => (
              <article key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                </div>
                <em className={item.gapClass}>{item.gap}</em>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="데이터 파이프라인" icon={RefreshCw} meta={data?.source?.updatedAt || gaCompetitorSeed.source.updatedAt}>
          <div className="ga-pipeline">
            <div><b>1</b><span>통합공시 반기 결산 수집</span></div>
            <div><b>2</b><span>동일 회사명 기준 중복 제거</span></div>
            <div><b>3</b><span>DART·실적 보도 매출 보강</span></div>
            <div><b>4</b><span>Supabase 원장 누적 후 비교</span></div>
          </div>
        </Panel>
      </section>

      <Panel title="경쟁사 비교표" icon={FileText} meta="인카금융서비스 행 강조">
        <GACompetitorTable rows={rows} ownShort={ownRow.short} />
      </Panel>
    </main>
  );
}

function GAMetricCard({ icon: Icon, label, value, detail, tone = "default" }) {
  return (
    <article className={`ga-metric-card ${tone}`}>
      <Icon />
      <span>{label}</span>
      <b>{value}</b>
      <em>{detail}</em>
    </article>
  );
}

function GAPlannerBarChart({ rows = [], ownShort = "" }) {
  if (!rows.length) return <p className="a4-empty">경쟁사 비교 데이터가 없습니다.</p>;
  return (
    <div className="chart-box ga-bar-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="short" tickLine={false} axisLine={false} width={116} tick={{ fontSize: 11, fontWeight: 800 }} />
          <Tooltip formatter={(value) => [`${formatGaInteger(value)}명`, "설계사수"]} />
          <Bar dataKey="planners" radius={[0, 7, 7, 0]} barSize={18}>
            {rows.map((row) => (
              <Cell key={row.short} fill={row.short === ownShort ? "#e8a33d" : "#2855d9"} />
            ))}
            <LabelList dataKey="planners" position="right" formatter={(value) => formatGaInteger(value)} fill="#0f1f3d" fontSize={11} fontWeight={900} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GARevenueTrendChart({ rows = [] }) {
  const chartRows = rows.map((row) => ({
    ...row,
    chartLabel: compactRevenuePeriodLabel(row.label || row.period),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
  }));
  if (!chartRows.some((row) => Number.isFinite(row.amount))) {
    return <p className="a4-empty">매출 공시 추적 데이터가 없습니다.</p>;
  }
  return (
    <div className="chart-box ga-revenue-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartRows} margin={{ left: 4, right: 18, top: 18, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="chartLabel" tickLine={false} axisLine={false} tick={{ fontSize: 11, fontWeight: 800 }} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}천억`} />
          <Tooltip formatter={(value, name, item) => [formatGaRevenue(value), item?.payload?.status || "매출"]} />
          <Bar dataKey="amount" radius={[8, 8, 0, 0]} barSize={42}>
            {chartRows.map((row) => (
              <Cell key={row.period || row.label} fill={row.status === "공시 대기" ? "#e8a33d" : "#2855d9"} />
            ))}
            <LabelList dataKey="amount" position="top" formatter={(value) => formatGaRevenue(value)} fill="#0f1f3d" fontSize={11} fontWeight={900} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GATrendChart({ rows = [] }) {
  if (!rows.length) return <p className="a4-empty">추이 데이터가 없습니다.</p>;
  return (
    <div className="chart-box ga-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={rows} margin={{ left: 0, right: 12, top: 14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
          <Tooltip formatter={(value, name) => [formatGaPercentPlain(value), gaTrendLabel(name)]} />
          <Line type="monotone" dataKey="incaRetention13" stroke="#2855d9" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="marketRetention13" stroke="#14805f" strokeWidth={2.4} dot={false} strokeDasharray="5 4" connectNulls />
          <Line type="monotone" dataKey="incaStay" stroke="#b45309" strokeWidth={2.2} dot={false} connectNulls />
          <Line type="monotone" dataKey="marketStay" stroke="#7c3aed" strokeWidth={2} dot={false} strokeDasharray="3 4" connectNulls />
        </RechartsLineChart>
      </ResponsiveContainer>
      <div className="stock-chart-legend">
        <span className="company">인카 13회 유지율</span>
        <span className="peer">시장 13회 유지율</span>
        <span className="kospi">인카 정착률</span>
        <span className="market-stay">시장 정착률</span>
      </div>
    </div>
  );
}

function GACompetitorTable({ rows = [], ownShort = "" }) {
  if (!rows.length) return <p className="a4-empty">경쟁사 표 데이터가 없습니다.</p>;
  return (
    <div className="ga-table-wrap">
      <table className="ga-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>회사</th>
            <th>설계사수</th>
            <th>2024 매출</th>
            <th>정착률</th>
            <th>13회 유지율</th>
            <th>25회 유지율</th>
            <th>불판율</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.short} className={row.short === ownShort ? "own" : ""}>
              <td>{row.rank}</td>
              <td><b>{row.short}</b><span>{row.name}</span></td>
              <td>{formatGaInteger(row.planners)}명</td>
              <td>{row.revenue2024 ? formatGaRevenue(row.revenue2024) : "-"}</td>
              <td>{formatGaPercentPlain(row.stay)}</td>
              <td>{formatGaPercentPlain(row.retention13Life)}</td>
              <td>{formatGaPercentPlain(row.retention25Life)}</td>
              <td>{formatGaPercentPlain(row.poorSalesLife, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildGaCompanyRows(companies = [], labels = []) {
  const index2024 = labels.findIndex((label) => label === "2024");
  const lastIndex = labels.length ? labels.length - 1 : 0;
  return companies
    .map((company) => {
      const planners = latestArrayValue(company.plannerTrend, lastIndex);
      const planners2024 = index2024 >= 0 ? latestArrayValue(company.plannerTrend, index2024) : null;
      return {
        ...company,
        planners,
        plannersDeltaFrom2024: Number.isFinite(planners) && Number.isFinite(planners2024) ? planners - planners2024 : null,
        stay: latestArrayValue(company.stayTrend, lastIndex),
        retention13Life: latestArrayValue(company.retention13LifeTrend, lastIndex),
        retention25Life: latestArrayValue(company.retention25LifeTrend, lastIndex),
        poorSalesLife: latestArrayValue(company.poorSalesLifeTrend, lastIndex),
      };
    })
    .filter((row) => Number.isFinite(row.planners))
    .sort((a, b) => Number(b.planners || 0) - Number(a.planners || 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildGaTrendRows(labels = [], company = {}, market = []) {
  return labels.map((period, index) => {
    const marketRow = market[index] || {};
    const marketRetention13 = Number(marketRow.retention13Life);
    const marketStay = Number(marketRow.stay);
    return {
      period,
      incaRetention13: latestArrayValue(company.retention13LifeTrend, index),
      marketRetention13: Number.isFinite(marketRetention13) ? marketRetention13 : null,
      incaStay: latestArrayValue(company.stayTrend, index),
      marketStay: Number.isFinite(marketStay) ? marketStay : null,
    };
  }).filter((row) => row.incaRetention13 !== null || row.marketRetention13 !== null || row.incaStay !== null || row.marketStay !== null);
}

function buildGaMarketIndex(ownRow = {}, marketLatest = {}) {
  return [
    {
      label: "설계사 규모",
      value: `${formatGaInteger(ownRow.planners)}명`,
      gap: `시장 전체 ${formatGaInteger(marketLatest.planners)}명 중 ${formatGaPercentPlain((Number(ownRow.planners) / Number(marketLatest.planners)) * 100, 1)}`,
      gapClass: "flat",
    },
    {
      label: "13회 유지율",
      value: formatGaPercentPlain(ownRow.retention13Life),
      gap: `시장 대비 ${formatGaPointGap(ownRow.retention13Life, marketLatest.retention13Life)}`,
      gapClass: gaGapClass(ownRow.retention13Life, marketLatest.retention13Life),
    },
    {
      label: "정착률",
      value: formatGaPercentPlain(ownRow.stay),
      gap: `시장 대비 ${formatGaPointGap(ownRow.stay, marketLatest.stay)}`,
      gapClass: gaGapClass(ownRow.stay, marketLatest.stay),
    },
    {
      label: "불완전판매율",
      value: formatGaPercentPlain(ownRow.poorSalesLife, 2),
      gap: `시장 대비 ${formatGaPointGap(ownRow.poorSalesLife, marketLatest.poorSalesLife, 2)}`,
      gapClass: Number(ownRow.poorSalesLife) <= Number(marketLatest.poorSalesLife) ? "up" : "down",
    },
  ];
}

function normalizeRevenueTracker(rows = []) {
  return rows
    .map((row) => ({
      ...row,
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    }))
    .sort((a, b) => gaRevenueSortKey(a.period || a.label) - gaRevenueSortKey(b.period || b.label));
}

function gaRevenueSortKey(value) {
  const text = String(value || "");
  const year = Number(text.match(/20\d{2}/)?.[0] || 9999);
  const quarter = /Q1|1분기/i.test(text) ? 1
    : /Q2|2분기/i.test(text) ? 2
      : /H1|상반기/i.test(text) ? 2.5
        : /Q3|3분기/i.test(text) ? 3
          : /Q4|4분기/i.test(text) ? 4
            : 9;
  return year * 10 + quarter;
}

function compactRevenuePeriodLabel(value) {
  const text = String(value || "");
  const year = text.match(/20\d{2}/)?.[0]?.slice(2) || text.slice(0, 4);
  if (/1분기|Q1/i.test(text)) return `${year} 1Q`;
  if (/2분기|Q2/i.test(text)) return `${year} 2Q`;
  if (/상반기|H1/i.test(text)) return `${year} H1`;
  if (/3분기|Q3/i.test(text)) return `${year} 3Q`;
  if (/4분기|Q4/i.test(text)) return `${year} 4Q`;
  if (/연간|20\d{2}/.test(text)) return `${year} FY`;
  return text;
}

function buildGaConsoleJudgement(ownRow = {}, marketLatest = {}) {
  const rank = ownRow.rank ? `설계사수 ${ownRow.rank}위` : "설계사수 확인";
  const retentionGap = formatGaPointGap(ownRow.retention13Life, marketLatest.retention13Life);
  const poorSales = Number(ownRow.poorSalesLife) <= 0 ? "불완전판매율 0%" : `불완전판매율 ${formatGaPercentPlain(ownRow.poorSalesLife, 2)}`;
  return `${rank}, 생보 13회 유지율 시장 대비 ${retentionGap}, ${poorSales}`;
}

function latestArrayValue(values = [], index) {
  if (!Array.isArray(values)) return null;
  const value = values[index];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatGaInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("ko-KR");
}

function formatGaRevenue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toLocaleString("ko-KR")}억원`;
}

function formatGaPercentPlain(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toFixed(digits)}%`;
}

function formatGaPointGap(left, right, digits = 2) {
  const diff = safeNumberDiff(left, right);
  if (!Number.isFinite(diff)) return "-";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(digits)}p`;
}

function gaGapClass(left, right) {
  const diff = safeNumberDiff(left, right);
  if (!Number.isFinite(diff) || diff === 0) return "flat";
  return diff > 0 ? "up" : "down";
}

function gaTrendLabel(name) {
  return {
    incaRetention13: "인카 13회 유지율",
    marketRetention13: "시장 13회 유지율",
    incaStay: "인카 정착률",
  }[name] || name;
}

const PRESS_COMPANY_OVERVIEW = "인카금융서비스는 2007년 설립된 국내 최초의 코스닥 상장 GA로, 전속 설계사 2만 명 이상을 보유하고 있으며 2022년 코스닥 이전 상장에 이어 종합자산관리회사로의 도약을 단계적으로 추진하고 있다";

const PRESS_RELEASE_TYPES = [
  { id: "plan", number: 1, title: "사업계획 보도자료", focus: "신규 전략, 사업 방향, 중장기 성장 계획을 발표합니다." },
  { id: "csr", number: 2, title: "사회공헌 보도자료", focus: "나눔 활동, 지역사회 기여, ESG 성격의 활동을 알립니다." },
  { id: "award", number: 3, title: "수상 보도자료", focus: "수상 사실, 평가 기준, 성과의 의미를 객관적으로 전달합니다." },
  { id: "performance", number: 4, title: "실적 보도자료", focus: "매출, 영업성과, 설계사 수 등 수치 기반 성과를 설명합니다." },
  { id: "partnership", number: 5, title: "제휴 보도자료", focus: "제휴 배경, 협력 범위, 고객·영업현장 기대효과를 알립니다." },
  { id: "event", number: 6, title: "행사 보도자료", focus: "행사 목적, 참석자, 주요 프로그램과 후속 계획을 정리합니다." },
];

const PRESS_CORE_FIELDS = [
  { id: "announcement", label: "1. 주요 발표 내용은 무엇인가요?", placeholder: "예: 인카금융서비스가 우수인증설계사 2,262명을 배출했습니다." },
  { id: "value", label: "2. 이 소식이 왜 중요하고 가치 있는지 설명해 주세요.", placeholder: "예: 영업조직의 전문성과 완전판매 역량을 객관적으로 보여주는 지표입니다." },
  { id: "difference", label: "3. 인카금융서비스만의 차별화 포인트는 무엇인가요?", placeholder: "예: 업계 최대 수준의 설계사 네트워크와 체계적인 교육 시스템을 갖추고 있습니다." },
];

function PressReleaseStudio({ operations }) {
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [answers, setAnswers] = useState({
    announcement: "",
    value: "",
    difference: "",
    facts: "",
  });
  const [quoteSpeaker, setQuoteSpeaker] = useState("");
  const [editableQuote, setEditableQuote] = useState("");
  const [quoteSaved, setQuoteSaved] = useState(false);
  const [selectedReporterKeys, setSelectedReporterKeys] = useState([]);
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [copied, setCopied] = useState("");
  const selectedType = PRESS_RELEASE_TYPES.find((item) => item.id === selectedTypeId);
  const coreReady = selectedType && PRESS_CORE_FIELDS.every((field) => answers[field.id].trim().length >= 4);
  const quoteReady = coreReady && quoteSpeaker;
  const reporterSource = operations?.reporters?.length ? operations.reporters : journalistRows;
  const reporterCandidates = useMemo(
    () => reporterSource.map(normalizeReporterDraft).filter((row) => row.name || row.media || row.email),
    [reporterSource],
  );
  const reportersWithEmail = reporterCandidates.filter((row) => row.email);
  const selectedReporters = reporterCandidates.filter((row) => row.email && selectedReporterKeys.includes(reporterKey(row)));
  const defaultQuote = quoteReady ? buildPressQuote(selectedType, answers, quoteSpeaker) : "";

  useEffect(() => {
    if (!quoteReady) {
      setEditableQuote("");
      setQuoteSaved(false);
      return;
    }
    setEditableQuote(defaultQuote);
    setQuoteSaved(false);
  }, [selectedTypeId, quoteSpeaker, answers.announcement, answers.value, answers.difference, answers.facts]);

  useEffect(() => {
    if (!reportersWithEmail.length) return;
    setSelectedReporterKeys((current) => {
      const valid = new Set(reportersWithEmail.map(reporterKey));
      const retained = current.filter((key) => valid.has(key));
      return retained.length ? retained : Array.from(valid);
    });
  }, [reportersWithEmail.map(reporterKey).join("|")]);

  const updateAnswer = (key, value) => {
    setAnswers((current) => ({ ...current, [key]: value }));
    setDraft(null);
  };

  const generateDraft = async () => {
    if (!quoteReady) return;
    const fallback = buildPressReleasePackage(selectedType, answers, quoteSpeaker, editableQuote, selectedReporters);
    setGeneratingDraft(true);
    setDraftError("");
    try {
      const result = await generatePressReleaseWithGemini({
        type: selectedType,
        answers,
        quoteSpeaker,
        quote: editableQuote,
        recipients: selectedReporters,
      });
      setDraft(normalizeGeminiPressDraft(result, fallback));
    } catch (error) {
      setDraft({
        ...fallback,
        notice: "Gemini 생성에 실패해 백업 초안을 표시합니다.",
      });
      setDraftError(error?.message || "gemini_press_release_failed");
    } finally {
      setGeneratingDraft(false);
    }
  };

  const toggleReporter = (row) => {
    if (!row.email) return;
    const key = reporterKey(row);
    setSelectedReporterKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setDraft(null);
  };

  const selectAllReporters = () => {
    setSelectedReporterKeys(reportersWithEmail.map(reporterKey));
    setDraft(null);
  };

  const clearReporters = () => {
    setSelectedReporterKeys([]);
    setDraft(null);
  };

  const saveQuoteTemplate = () => {
    if (!quoteReady || !editableQuote.trim()) return;
    setQuoteSaved(true);
    setDraft(null);
  };

  const resetQuoteTemplate = () => {
    setEditableQuote(defaultQuote);
    setQuoteSaved(false);
    setDraft(null);
  };

  const copySection = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("failed");
      window.setTimeout(() => setCopied(""), 1800);
    }
  };

  return (
    <main className="workspace press-release-workspace">
      <PageTitle
        eyebrow="Press Release Studio"
        title="보도자료 작성"
        description="뉴스 가치, 리드, 객관적 문장, 인용문, 기자 발송 이메일까지 한 번에 정리합니다."
        right={<span className="press-guide-badge">뉴스와이어 작성 원칙 반영</span>}
      />

      <section className="press-release-layout">
        <div className="press-release-editor">
          <Panel title="1단계 · 유형 선택" icon={Megaphone} meta="먼저 보도자료 유형을 선택합니다.">
            <div className="press-type-grid">
              {PRESS_RELEASE_TYPES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selectedTypeId === item.id ? "press-type-card active" : "press-type-card"}
                  onClick={() => {
                    setSelectedTypeId(item.id);
                    setDraft(null);
                  }}
                >
                  <span>{item.number}</span>
                  <b>{item.title}</b>
                  <em>{item.focus}</em>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2단계 · 핵심 질문" icon={FilePenLine} meta={selectedType ? selectedType.title : "유형 선택 후 입력"}>
            <div className="press-assistant-note">
              <b>{selectedType ? "네 알겠습니다. 그럼 보도자료 작성에 필요한 내용을 알려주세요." : "1, 2, 3, 4, 5, 6번 중 하나를 먼저 선택해 주세요."}</b>
              <span>내용은 짧게 적어도 됩니다. 수치, 기관명, 일정, 성과가 있으면 아래 선택 입력란에 함께 넣어주세요.</span>
            </div>
            <div className="press-field-stack">
              {PRESS_CORE_FIELDS.map((field) => (
                <label key={field.id} className="press-input-field">
                  <span>{field.label}</span>
                  <textarea
                    value={answers[field.id]}
                    onChange={(event) => updateAnswer(field.id, event.target.value)}
                    placeholder={field.placeholder}
                    disabled={!selectedType}
                  />
                </label>
              ))}
              <label className="press-input-field optional">
                <span>추가 참고자료 · 수치 · 일정 · 상대기관 · 행사 장소</span>
                <textarea
                  value={answers.facts}
                  onChange={(event) => updateAnswer("facts", event.target.value)}
                  placeholder="예: 2026년 6월, 서울 본사, 참여 설계사 수, 제휴 기관명, 전년 대비 성장률 등"
                  disabled={!selectedType}
                />
              </label>
            </div>
          </Panel>

          <Panel title="3단계 · 인용문 작성자" icon={Users} meta={coreReady ? "인용문 작성자 선택" : "핵심 질문 입력 후 선택"}>
            <div className="press-quote-choice">
              <p>인용문은 최병채 회장님과 관계자 중 어느 분으로 작성할까요?</p>
              <div>
                <button
                  type="button"
                  className={quoteSpeaker === "chairman" ? "active" : ""}
                  disabled={!coreReady}
                  onClick={() => {
                    setQuoteSpeaker("chairman");
                    setDraft(null);
                  }}
                >
                  최병채 회장
                </button>
                <button
                  type="button"
                  className={quoteSpeaker === "official" ? "active" : ""}
                  disabled={!coreReady}
                  onClick={() => {
                    setQuoteSpeaker("official");
                    setDraft(null);
                  }}
                >
                  인카금융서비스 관계자
                </button>
              </div>
            </div>
            <div className="press-quote-editor">
              <div>
                <b>인용문 기본값</b>
                <span>{quoteSaved ? "현재 초안에 반영됨" : quoteReady ? "자동 생성 기본값" : "작성자 선택 후 활성화"}</span>
              </div>
              <textarea
                value={editableQuote}
                onChange={(event) => {
                  setEditableQuote(event.target.value);
                  setQuoteSaved(false);
                  setDraft(null);
                }}
                disabled={!quoteReady}
                placeholder="핵심 질문과 인용문 작성자를 선택하면 기본 인용문이 생성됩니다."
              />
              <div className="press-quote-actions">
                <button type="button" disabled={!quoteReady} onClick={resetQuoteTemplate}>기본값 다시 생성</button>
                <button type="button" disabled={!quoteReady || !editableQuote.trim()} onClick={saveQuoteTemplate}>수정 반영</button>
              </div>
            </div>
            <button type="button" className="confirm-button press-generate-button" disabled={!quoteReady || generatingDraft} onClick={generateDraft}>
              {generatingDraft ? "Gemini가 작성 중입니다." : "알겠습니다. 지금 바로 작성하겠습니다."}
            </button>
            {draftError && <div className="press-ai-status">Gemini 연결 참고: {draftError}</div>}
          </Panel>

          <Panel title="4단계 · 기자 발송 대상" icon={Megaphone} meta={`${selectedReporters.length}/${reportersWithEmail.length}명 선택`}>
            <div className="press-mail-api-note">
              <b>메일 API 연동 가능</b>
              <span>실제 일괄 발송은 Supabase Edge Function에 메일 API 키를 넣은 뒤 활성화합니다. 브라우저에는 API 키를 저장하지 않습니다.</span>
            </div>
            <div className="press-recipient-actions">
              <button type="button" onClick={selectAllReporters} disabled={!reportersWithEmail.length}>이메일 기자 전체 선택</button>
              <button type="button" onClick={clearReporters} disabled={!selectedReporterKeys.length}>선택 해제</button>
              <button type="button" onClick={() => copySection("bcc", selectedReporters.map((row) => row.email).join("; "))} disabled={!selectedReporters.length}>
                {copied === "bcc" ? "주소 복사 완료" : "BCC 주소 복사"}
              </button>
            </div>
            <div className="press-recipient-list">
              {reporterCandidates.slice(0, 80).map((row) => {
                const key = reporterKey(row);
                const checked = selectedReporterKeys.includes(key);
                return (
                  <label key={key} className={row.email ? "press-recipient-row" : "press-recipient-row disabled"}>
                    <input type="checkbox" checked={checked} disabled={!row.email} onChange={() => toggleReporter(row)} />
                    <span>
                      <b>{row.name || "기자명 미입력"}</b>
                      <em>{row.media || row.outlet || "-"} · {row.email || "이메일 미입력"}</em>
                    </span>
                  </label>
                );
              })}
              {!reporterCandidates.length && <div className="press-recipient-empty">기자 관리 화면에 기자를 먼저 등록해 주세요.</div>}
            </div>
            <button type="button" className="press-send-disabled" disabled>
              메일 API 연결 후 일괄 발송 활성화
            </button>
          </Panel>
        </div>

        <aside className="press-release-preview">
          <Panel title="작성 결과" icon={Newspaper} meta={draft ? "배포 초안 생성 완료" : "입력 완료 후 생성"}>
            {!draft ? (
              <div className="press-empty-preview">
                <b>보도자료 작성 대기</b>
                <p>유형 선택, 핵심 질문 3개, 인용문 작성자를 입력하면 언론사 배포용 보도자료와 이메일 본문을 생성합니다.</p>
                <ul>
                  <li>도입부에는 날짜와 지역을 넣지 않습니다.</li>
                  <li>회사명은 인카금융서비스 또는 코스닥상장사 인카금융서비스로 표기합니다.</li>
                  <li>회사 개요는 지정된 문장만 사용합니다.</li>
                </ul>
              </div>
            ) : (
              <div className="press-output-stack">
                <div className="press-output-toolbar">
                  <span>{draft.notice}</span>
                  <button type="button" onClick={() => copySection("all", draft.fullText)}>{copied === "all" ? "복사 완료" : "전체 복사"}</button>
                </div>
                <PressOutputBlock title="발송 대상" text={draft.recipients || "선택된 이메일 수신자가 없습니다."} onCopy={() => copySection("recipients", draft.recipients)} copied={copied === "recipients"} />
                <PressOutputBlock title="보도자료" text={draft.pressRelease} onCopy={() => copySection("release", draft.pressRelease)} copied={copied === "release"} />
                <PressOutputBlock title="기자 발송 이메일" text={draft.email} onCopy={() => copySection("email", draft.email)} copied={copied === "email"} />
                <div className="press-finish-message">보도자료 작성이 완료되었습니다.</div>
              </div>
            )}
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function PressOutputBlock({ title, text, onCopy, copied }) {
  return (
    <section className="press-output-block">
      <div>
        <b>{title}</b>
        <button type="button" onClick={onCopy}>{copied ? "복사 완료" : "복사"}</button>
      </div>
      <pre>{text}</pre>
    </section>
  );
}

function buildPressReleasePackage(type, answers, quoteSpeaker, customQuote = "", recipients = []) {
  const cleanAnswers = {
    announcement: cleanPressLine(answers.announcement),
    value: cleanPressLine(answers.value),
    difference: cleanPressLine(answers.difference),
    facts: cleanPressLine(answers.facts),
  };
  const headline = buildPressHeadline(type, cleanAnswers);
  const subtitle = buildPressSubtitle(type, cleanAnswers);
  const lead = buildPressLead(type, cleanAnswers);
  const body = buildPressBody(type, cleanAnswers);
  const quote = cleanPressLine(customQuote) || buildPressQuote(type, cleanAnswers, quoteSpeaker);
  const emailSummary = buildEmailSummary(cleanAnswers, type);
  const recipientText = buildRecipientText(recipients);
  const pressRelease = [
    headline,
    subtitle,
    "",
    lead,
    "",
    ...body,
    "",
    quote,
    "",
    PRESS_COMPANY_OVERVIEW,
  ].filter((line) => line !== null).join("\n");
  const email = [
    `제목: [보도자료] ${headline}`,
    "",
    "[본문]",
    "",
    "안녕하세요, 인카금융서비스 마케팅부입니다.",
    "",
    "언론 발전을 위해 항상 애쓰시는 기자님의 노고에 진심으로 감사드립니다.",
    "",
    ...emailSummary,
    "",
    "바쁘시겠지만 긍정적인 검토를 부탁드립니다.",
    "",
    "늘 건강하시고 좋은 하루 보내시길 바랍니다. 감사합니다.",
    "",
    "인카금융서비스 마케팅부",
    "",
    "담당자: 최진우 과장",
    "이메일: enul459@incar.co.kr",
    "전화: 02-6212-4650",
  ].join("\n");
  return {
    notice: "그리고나서 기자들에게 보낼 이메일 본문 작성을 시작하겠습니다.",
    recipients: recipientText,
    pressRelease,
    email,
    fullText: `${recipientText}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`,
  };
}

function normalizeGeminiPressDraft(result = {}, fallback = {}) {
  const payload = result.package || result.draft || result;
  const pressRelease = String(payload.pressRelease || payload.press_release || fallback.pressRelease || "").trim();
  const email = String(payload.email || fallback.email || "").trim();
  const recipients = String(payload.recipients || fallback.recipients || "").trim();
  const notice = String(payload.notice || "Gemini API로 보도자료와 기자 발송 이메일을 작성했습니다.").trim();
  const fullText = String(payload.fullText || payload.full_text || "").trim()
    || `${recipients}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`;
  return {
    notice,
    recipients,
    pressRelease,
    email,
    fullText,
    model: result.model || "",
    usageMetadata: result.usageMetadata || {},
  };
}

function buildRecipientText(recipients = []) {
  if (!recipients.length) return "수신 대상: 선택된 이메일 기자 없음";
  const lines = recipients.map((row, index) => `${index + 1}. ${row.name || "기자명 미입력"} · ${row.media || row.outlet || "-"} · ${row.email}`);
  return [`수신 대상: ${recipients.length.toLocaleString("ko-KR")}명`, ...lines].join("\n");
}

function buildPressHeadline(type, answers) {
  const subject = stripTrailingPunctuation(answers.announcement);
  const fragments = {
    plan: `${subject}, 미래 성장 전략 본격화`,
    csr: `${subject}, 지역사회와 상생 가치 확산`,
    award: `${subject}, 전문성과 신뢰도 입증`,
    performance: `${subject}, 지속 성장 기반 강화`,
    partnership: `${subject}, 고객 가치 확대 나선다`,
    event: `${subject}, 현장 소통과 성장 방향 공유`,
  };
  return trimPressHeadline(fragments[type.id] || subject);
}

function buildPressSubtitle(type, answers) {
  const value = stripTrailingPunctuation(answers.value);
  const difference = stripTrailingPunctuation(answers.difference);
  const lines = [
    isMeaningfulPressInput(value) ? `- ${value}` : "",
    isMeaningfulPressInput(difference) ? `- ${difference}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

function buildPressLead(type, answers) {
  const announcement = sentenceObject(answers.announcement);
  if (type.id === "award" && /배출$/.test(announcement)) {
    return `인카금융서비스(대표이사 최병채, 천대권)는 ${normalizePressAchievementObject(announcement)}했다고 밝혔다.`;
  }
  const verb = {
    plan: "추진한다고 밝혔다",
    csr: "진행했다고 밝혔다",
    award: "성과를 거뒀다고 밝혔다",
    performance: "기록했다고 밝혔다",
    partnership: "협력한다고 밝혔다",
    event: "개최했다고 밝혔다",
  }[type.id] || "밝혔다";
  return `인카금융서비스(대표이사 최병채, 천대권)는 ${pressObjectPhrase(answers.announcement)} ${verb}.`;
}

function buildPressBody(type, answers) {
  const typeLead = {
    plan: "이번 계획은 회사의 중장기 성장 기반을 강화하고 고객 접점의 서비스 품질을 높이기 위해 마련됐다.",
    csr: "이번 활동은 회사가 보유한 인적·조직적 역량을 지역사회와 나누고 지속 가능한 상생 가치를 실천하기 위해 추진됐다.",
    award: "이번 수상은 회사의 영업 경쟁력과 고객 중심 운영 체계가 대외적으로 평가받은 결과라는 점에서 의미가 있다.",
    performance: "이번 성과는 영업조직의 질적 성장과 안정적인 사업 기반이 함께 반영된 결과로 풀이된다.",
    partnership: "이번 제휴는 양사의 강점을 결합해 고객과 영업현장에 실질적인 혜택을 제공하는 데 초점을 맞췄다.",
    event: "이번 행사는 주요 관계자와 현장 구성원이 함께 회사의 방향성과 실행 과제를 공유하기 위해 마련됐다.",
  }[type.id];
  const paragraphs = [];
  const value = sentenceObject(answers.value);
  const difference = sentenceObject(answers.difference);
  const facts = sentenceObject(answers.facts);

  paragraphs.push(isMeaningfulPressInput(value)
    ? `${typeLead} ${sentence(value)}`
    : `${typeLead} 회사는 이번 발표가 영업현장 전문성, 고객 신뢰, 완전판매 역량을 함께 보여주는 사례라고 설명했다.`);
  if (isMeaningfulPressInput(facts)) {
    paragraphs.push(`회사 측은 ${facts}를 주요 근거로 제시하며 발표 내용의 객관성과 실행 가능성을 강조했다.`);
  }
  paragraphs.push(isMeaningfulPressInput(difference)
    ? `인카금융서비스는 ${difference}를 차별화 포인트로 삼아 고객 신뢰와 현장 경쟁력을 동시에 높인다는 계획이다.`
    : "인카금융서비스는 체계적인 교육, 내부 관리, 현장 지원 역량을 바탕으로 고객 신뢰와 영업 경쟁력을 높인다는 계획이다.");
  paragraphs.push("인카금융서비스는 앞으로도 보험 소비자 보호와 영업현장 전문성 강화를 중심으로 지속 가능한 성장 체계를 고도화할 방침이다.");
  return paragraphs;
}

function buildPressQuote(type, answers, quoteSpeaker) {
  const speaker = quoteSpeaker === "chairman" ? "최병채 인카금융서비스 회장" : "인카금융서비스 관계자";
  const speakerJosa = quoteSpeaker === "chairman" ? "은" : "는";
  const quoteFocus = quoteSpeaker === "chairman"
    ? "회사의 지속 성장은 고객 신뢰와 현장 전문성이 함께 높아질 때 가능하다"
    : "이번 발표는 고객과 영업현장에 실질적인 가치를 제공하기 위한 실행의 일환";
  const action = {
    plan: "미래 성장 기반을 차근차근 강화하겠다",
    csr: "사회적 책임을 꾸준히 실천하겠다",
    award: "신뢰받는 금융서비스 회사로서 기준을 높여가겠다",
    performance: "질적 성장과 안정적 성과를 함께 만들어가겠다",
    partnership: "협력의 성과가 고객 혜택으로 이어지도록 하겠다",
    event: "현장과의 소통을 바탕으로 실행력을 높이겠다",
  }[type.id] || "고객 신뢰를 높여가겠다";
  const difference = sentenceObject(answers.difference);
  const strength = isMeaningfulPressInput(difference)
    ? `${difference}라는 강점을 바탕으로 `
    : "";
  return `${speaker}${speakerJosa} “${quoteFocus}”라며 “${strength}${action}”고 말했다.`;
}

function buildEmailSummary(answers, type) {
  const rows = [
    sentence(answers.announcement),
    isMeaningfulPressInput(answers.value) ? sentence(answers.value) : "",
    isMeaningfulPressInput(answers.difference) ? `${type.title.replace(" 보도자료", "")}의 핵심은 ${sentenceObject(answers.difference)}입니다.` : "",
  ].filter(Boolean);
  return rows.slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
}

function cleanPressLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/기업형\s*GA\s*/g, "")
    .trim();
}

function sentence(value) {
  const text = stripTrailingPunctuation(cleanPressLine(value));
  return text ? `${text}.` : "";
}

function sentenceObject(value) {
  return stripTrailingPunctuation(cleanPressLine(value));
}

function isMeaningfulPressInput(value) {
  const text = sentenceObject(value).trim();
  if (!text) return false;
  return !/^(없음|없다|없습니다|따로\s*없음|미정|해당\s*없음|n\/?a|null|none)$/i.test(text);
}

function pressObjectPhrase(value) {
  const text = sentenceObject(value);
  if (!text) return "주요 경영 성과를";
  if (/[을를]$/.test(text)) return text;
  if (/(명|건|개|곳|억|억원|위|회|년|월|일|%|퍼센트|포인트)$/.test(text)) return `${text}을`;
  return `${text}을`;
}

function normalizePressAchievementObject(value) {
  const text = sentenceObject(value);
  const countMatch = text.match(/^(.+?)([0-9,천만억]+(?:여)?명)\s*배출$/);
  if (countMatch) return `${countMatch[1]}${countMatch[2]}을 배출`;
  return pressObjectPhrase(text);
}

function stripTrailingPunctuation(value) {
  return cleanPressLine(value).replace(/[.。!！?？]+$/g, "");
}

function trimPressHeadline(value) {
  const text = stripTrailingPunctuation(value);
  return text.length > 58 ? `${text.slice(0, 56)}…` : text;
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
        description="트렌드, 매체 영향도, 키워드 흐름, 핵심 이슈를 보고서와 분리된 분석 화면에서 확인합니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
          </div>
        )}
      />
      <section className="media-analysis-layout media-intel-board">
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

function buildStockRangeHeadline(company = {}, summary = {}, range = {}, rangeLabel = "선택 기간") {
  const selectedReturn = Number(range.return);
  const drawdown = Number(range.drawdown_from_high);
  if (Number.isFinite(drawdown) && drawdown <= -25) return `${rangeLabel} 고점 대비 낙폭이 큰 구간입니다.`;
  if (Number.isFinite(selectedReturn) && selectedReturn <= -10) return `${rangeLabel} 기준 당사 주가 약세가 두드러집니다.`;
  if (Number.isFinite(selectedReturn) && selectedReturn >= 5) return `${rangeLabel} 기준 반등 흐름이 관찰됩니다.`;
  return summary.headline || "당사 주가와 업종 흐름을 함께 관찰합니다.";
}

function buildStockRangeFacts(company = {}, summary = {}, range = {}, rangeLabel = "선택 기간", peerReturn = null, kospiReturn = null) {
  const selectedReturn = range.return ?? company.returns?.["20d"];
  const peerGap = safeNumberDiff(selectedReturn, peerReturn);
  const kospiGap = safeNumberDiff(selectedReturn, kospiReturn);
  return [
    `${rangeLabel} 수익률은 ${formatStockPercent(selectedReturn)}입니다.`,
    `기간 고점은 ${formatStockDate(range.high_date)} ${formatStockPrice(range.high)}원이며, 현재 고점 대비 ${formatStockPercent(range.drawdown_from_high)}입니다.`,
    `기간 저점은 ${formatStockDate(range.low_date)} ${formatStockPrice(range.low)}원이며, 저점 대비 ${formatStockPercent(range.rebound_from_low)}입니다.`,
    `동종 평균 대비 ${formatStockPercent(peerGap)}, KOSPI 대비 ${formatStockPercent(kospiGap)} 차이입니다.`,
  ];
}

function buildStockMarketJudgement(company = {}, summary = {}, range = {}) {
  const selectedReturn = Number(range.return ?? company.returns?.["20d"]);
  const drawdown = Number(range.drawdown_from_high ?? company.range?.drawdown_from_60d_high);
  if (Number.isFinite(selectedReturn) && selectedReturn <= -10) return "선택 기간 약세";
  const peerGap = Number(summary.relative_to_peers);
  if (Number.isFinite(peerGap) && peerGap <= -5) return "동종 대비 부진";
  if (Number.isFinite(drawdown) && drawdown <= -20) return "고점 회복 지연";
  if (Number.isFinite(selectedReturn) && selectedReturn >= 5) return "반등 관찰 구간";
  return "중립 관찰 구간";
}

function buildStockMarketReason(company = {}, summary = {}, range = {}, rangeLabel = "선택 기간", peerReturn = null, kospiReturn = null) {
  const selectedReturn = range.return ?? company.returns?.["20d"];
  const pieces = [
    `당사 ${rangeLabel} ${formatStockPercent(selectedReturn)}`,
    `동종 평균 ${formatStockPercent(peerReturn)}`,
    `KOSPI ${formatStockPercent(kospiReturn)}`,
    `고점 ${formatStockDate(range.high_date)} 대비 ${formatStockPercent(range.drawdown_from_high)}`,
  ];
  return `${pieces.join(" · ")} 기준으로 주가성 기사와 실제 가격 흐름을 함께 점검합니다.`;
}

function Scraps({ scraps, onOpenMonitoring, onScrapSaved }) {
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
            <ArticleFeed rows={scraps} scraps={scraps} onScrapSaved={onScrapSaved} />
          </Panel>
        </div>
      </section>
    </main>
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

function Reports({ data, period, setPeriod, articles, allArticles = [], scraps, onOpenMonitoring, operations }) {
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
  return (
    <main className="workspace report-workspace">
      <PageTitle
        eyebrow={edition.kicker}
        title="일간/주간/월간 보고서"
        description="화면 분석과 분리해 A4 세로 한 장으로 출력할 보고서 기준과 콘텐츠 밀도를 관리합니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            {period === "monthly" && (
              <MonthSelect
                months={monthOptions}
                value={selectedMonth}
                onChange={setReportMonth}
              />
            )}
            <button className="primary-button" onClick={() => printCurrentView(`${edition.title} ${reportData.scope || ""}`)}>
              <Download />인쇄/PDF 저장
            </button>
          </div>
        )}
      />
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
  const secondary = expandedIssues
    .filter((issue) => !sameIssue(issue, lead))
    .slice(0, period === "daily" ? 4 : 5);
  const reportTrend = trendRows?.length
    ? trendRows
    : buildReportToneTrend(reportArticles, period, data.toneTrend);
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
  const insightLines = buildA4ReportInsights(period, data, lead, issues, articles, scope);
  const stats = buildA4ReportStats(summary, articles);
  const pressRows = (data.pressInfluence || []).filter((item) => !isOfficialRegulatorSource(item.source)).slice(0, 5);
  const scrapRows = period === "daily" ? [] : scraps.slice(0, 3);
  const observationRows = buildA4ObservationRows(period, data, lead, issues, articles, keywordRows, pressRows, scope);
  const toneRows = buildA4ToneLedger(articles);
  const reportIssues = [lead, ...issues].filter((item) => item?.title).slice(0, period === "daily" ? 5 : 6);
  return (
    <article className={`a4-report-sheet ${period}`}>
      <header className="a4-masthead">
        <div className="a4-topline">
          <span>{edition.issue}</span>
          <span>{scope.scopeLabel || data.scope || "-"}</span>
          <span>{data.generatedAt || "-"}</span>
        </div>
        <div className="a4-title-row">
          <div>
            <p>{edition.kicker}</p>
            <h2>{edition.title}</h2>
            <em>{edition.subtitle}</em>
          </div>
          <div className={`a4-risk-badge ${String(summary.risk || "LOW").toLowerCase()}`}>
            <span>리스크</span>
            <b>{summary.risk || "LOW"}</b>
          </div>
        </div>
        <A4MetricStrip stats={stats} onOpenMonitoring={onOpenMonitoring} />
      </header>

      <section className="a4-front">
        <article className="a4-lead">
          <span>핵심 요약</span>
          <h3>{buildA4ReportHeadline(period, data, lead, scope)}</h3>
          <ul className="a4-executive-lines">
            {insightLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="a4-article-meta">
            {lead?.tone && <Chip tone={lead.tone}>{lead.tone}</Chip>}
            {lead?.category && <Chip>{lead.category}</Chip>}
            <span>{formatA4ArticleMeta(lead, scope.scopeLabel || data.scope)}</span>
            {lead?.link && lead.link !== "#" && (
              <a href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
                기사 열기
              </a>
            )}
          </div>
        </article>
        <aside className="a4-insight">
          <span>집계 기준</span>
          <dl className="a4-basis-list">
            <div>
              <dt>기간</dt>
              <dd>{scope.scopeLabel || data.scope || "-"}</dd>
            </div>
            <div>
              <dt>방식</dt>
              <dd>{scope.ruleLabel}</dd>
            </div>
            <div>
              <dt>기준</dt>
              <dd>{scope.basisLabel}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="a4-report-body">
        <div className="a4-report-main-column">
          <A4Panel title="핵심 이슈와 요약" meta={`${reportIssues.length.toLocaleString("ko-KR")}건`}>
            <div className="a4-issue-list">
              {reportIssues.map((issue) => (
                <A4IssueRow key={`${issue.source}-${issue.title}-${issue.time || issue.date}`} issue={issue} />
              ))}
              {!reportIssues.length && <p className="a4-empty">기간 내 핵심 기사 데이터가 없습니다.</p>}
            </div>
          </A4Panel>
        </div>

        <div className="a4-report-side-column">
          <A4Panel title={scope.trendTitle} meta={scope.trendMeta}>
            <A4ToneMini rows={trendRows} />
          </A4Panel>

          <A4Panel title="키워드별 기사량" meta="선정 키워드">
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
        <span>보고 기준: {scope.scopeLabel || data.scope || "-"}</span>
        <span>{scope.ruleLabel} · 수집 기사와 수동 분류 보정 반영</span>
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
  const lines = buildArticleSummaryLines(issue).slice(0, 2);
  return (
    <article className="a4-issue-row">
      <div>
        <Chip tone={issue.tone}>{issue.tone}</Chip>
        <Chip>{issue.category || "분류"}</Chip>
        <span>{formatA4ArticleMeta(issue)}</span>
      </div>
      <h4>{issue.title}</h4>
      {lines.length > 0 && (
        <ul className="summary-lines dense">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
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

function buildA4ReportInsights(period, data, lead, issues = [], articles = [], reportScope = {}) {
  const summary = data.summary || {};
  const periodLabel = periodScopeLabel(period);
  const ownCount = Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0);
  const negativeCount = Number(summary.ownNegative || articles.filter((item) => item.tone === "부정" && isOwnArticle(item)).length || 0);
  const cautionCount = Number(summary.caution || articles.filter((item) => item.tone === "주의").length || 0);
  const policyCount = articles.filter((item) => item.category === "정책/규제").length;
  const topic = lead ? a4TopicLabel(lead) : "기간 대표 이슈";
  const scopeLabel = reportScope.scopeLabel || data.scope || periodLabel;
  const lines = [
    `${scopeLabel} 기준 분석 기사 ${Number(summary.analyzed || articles.length || 0).toLocaleString("ko-KR")}건 중 당사 언급 ${ownCount.toLocaleString("ko-KR")}건을 확인했습니다.`,
    negativeCount > 0
      ? `당사 부정 ${negativeCount.toLocaleString("ko-KR")}건은 즉시 확인 대상으로 분리하고, 관련 보도 묶음까지 함께 점검합니다.`
      : `직접 부정은 제한적이며, 당사 언급은 성과·시장성·업계 흐름으로 나눠 봅니다.`,
    cautionCount > 0
      ? `주의 ${cautionCount.toLocaleString("ko-KR")}건은 시장 평가, 규제, 영업환경 신호로 별도 추적합니다.`
      : "주의 신호는 낮고 일반 동향 확인 비중이 높습니다.",
    lead?.title
      ? `대표 이슈는 ${topic}이며, 핵심 헤드라인은 "${lead.title}"입니다.`
      : policyCount > 0
        ? `정책/규제 기사 ${policyCount.toLocaleString("ko-KR")}건은 영업 환경 변화 관점에서 확인합니다.`
      : issues[0]?.title
        ? `핵심 기사 "${issues[0].title}"의 후속 보도 여부를 확인합니다.`
        : "반복 노출 매체와 키워드 변화는 다음 보고 주기에 이어서 확인합니다.",
  ];
  return dedupeSummaryLines(lines).slice(0, 4);
}

function buildA4ObservationRows(period, data, lead, issues = [], articles = [], keywordRows = [], pressRows = [], reportScope = {}) {
  const summary = data.summary || {};
  const ownCount = Number(summary.ownMentions || articles.filter(isOwnArticle).length || 0);
  const riskCount = Number(summary.ownNegative || 0) + Number(summary.caution || 0);
  const topKeyword = keywordRows.find((row) => Number(row.value || 0) > 0);
  const topPress = pressRows[0];
  const periodLabel = reportScope.shortLabel || periodScopeLabel(period);
  const leadTopic = lead ? a4TopicLabel(lead) : "대표 이슈";
  return [
    {
      label: "기간 기준",
      body: `${periodLabel} 기준으로만 집계해 이전 기간 기사와 섞이지 않도록 구성했습니다.`,
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
      body: issues[0]?.title ? `${leadTopic} 관련 후속 보도와 같은 이슈 묶음을 이어서 확인합니다.` : "반복 노출 이슈는 다음 보고 주기에 계속 누적합니다.",
    },
  ];
}

function buildA4ReportHeadline(period, data, lead, reportScope = {}) {
  const summary = data.summary || {};
  const ownNegative = Number(summary.ownNegative || 0);
  const caution = Number(summary.caution || 0);
  const topic = lead ? a4TopicLabel(lead) : "언론 동향";
  if (ownNegative > 0) return `${reportScope.shortLabel || periodScopeLabel(period)} 당사 리스크 점검`;
  if (period === "monthly") return `${reportScope.month || reportScope.shortLabel || "월간"} 언론 흐름 요약`;
  if (period === "weekly") return `${reportScope.shortLabel || "해당 주차"} ${topic} 중심 보도 흐름`;
  if (caution > 0) return `당일 주의 신호와 당사 언급 점검`;
  return `당일 언론 동향 핵심 요약`;
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
  const scope = data.periodScope || {};
  const date = scope.scopeLabel || data.scope || data.generatedAt || "";
  const meta = {
    daily: {
      kicker: "Daily Report",
      title: "일일 언론 동향 보고서",
      subtitle: "당일 수집 기사 기준 핵심 이슈와 즉시 확인할 리스크를 정리합니다.",
      issue: `${date} · 당일 집계`,
    },
    weekly: {
      kicker: "Weekly Report",
      title: "주간 언론 동향 보고서",
      subtitle: "해당 주차의 반복 노출, 논조 변화, 관리 이슈를 한 장으로 요약합니다.",
      issue: `${date} · 주차 집계`,
    },
    monthly: {
      kicker: "Monthly Report",
      title: "월간 언론 동향 보고서",
      subtitle: "집계월 기준 누적 기사, 매체 영향도, 키워드 흐름을 정리합니다.",
      issue: `${scope.month || date} · 집계월`,
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
  const tabs = [
    ["media", "언론사 관리", Building2],
    ["reporters", "기자 관리", Users],
    ["ads", "광고비 관리", WalletCards],
    ["keywords", "키워드/문맥", Settings],
    ["feedback", "분류 피드백", FilePenLine],
  ];
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Operations"
        title="운영 관리"
        description="언론사, 기자, 광고비, 키워드, 분류 피드백을 운영 데이터 기준으로 관리합니다."
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
      <section className="admin-crud-panel">
        <div className="management-tabs admin-tabs-rail">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon />{label}
            </button>
          ))}
        </div>
        <div className="admin-panel-body">
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
        </div>
      </section>
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
  const [draftAliases, setDraftAliases] = useState([]);
  const [draftMediaRows, setDraftMediaRows] = useState([]);
  const aliasRows = useMemo(() => mergeAliasRows(aliases, draftAliases), [aliases, draftAliases]);
  const managedRows = useMemo(() => mergeMediaRows(rows, aliasRows, draftMediaRows), [rows, aliasRows, draftMediaRows]);
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
    try {
      const saved = await saveMediaRelation(item);
      const savedRow = Array.isArray(saved) && saved[0] ? normalizeMediaDraft(saved[0]) : item;
      setDraftMediaRows((current) => upsertMediaLocal(current, savedRow));
      if (host) {
        await savePressAlias(host, item.name);
        setDraftAliases((current) => upsertAliasRow(current, { host, press_name: item.name }));
      }
      setMediaForm(emptyMediaForm);
      setManagingMedia(false);
      setMediaStatus("운영 DB 저장 완료");
    } catch (error) {
      setMediaStatus(error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 저장하세요."
        : "운영 DB 저장 실패 · 연결과 권한을 확인하세요.");
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
                <td>
                  <div className="press-history-stack">
                    <b>{row.owner || row.leadReporter || "-"}</b>
                    <span>{[row.beat, row.email || row.phone].filter(Boolean).join(" · ") || "담당 정보 없음"}</span>
                  </div>
                </td>
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
  const [draftState, setDraftState] = useState({ rows: [], hidden: [] });
  const managedRows = useMemo(() => mergeReporterRows(rows, draftState), [rows, draftState]);
  const reporterSignals = useMemo(() => buildReporterCrmSignals(managedRows), [managedRows]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return managedRows;
    return managedRows.filter((row) =>
      `${row.name} ${row.outlet || row.media} ${row.beat} ${row.status} ${row.contactDate} ${row.email} ${row.phone} ${row.request} ${row.memo}`.toLowerCase().includes(term),
    );
  }, [managedRows, query]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
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
    try {
      const saved = await saveReporterProfile(item);
      const savedRow = Array.isArray(saved) && saved[0] ? reporterDraftFromRemote(saved[0]) : item;
      setDraftState((current) => upsertReporterLocal(current, savedRow, item.id));
      setForm(emptyReporterForm);
      setStatus("운영 DB 저장 완료");
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 저장하세요."
        : "운영 DB 저장 실패 · 연결과 권한을 확인하세요.");
    }
  };

  const handleDeleteReporter = async (row) => {
    try {
      if (/^\d+$/.test(String(row.id || ""))) {
        await deleteReporterProfile(row.id);
        setDraftState((current) => hideReporterLocal(current, row));
        setStatus("운영 DB 삭제 완료");
      } else {
        setDraftState((current) => hideReporterLocal(current, row));
        setStatus("현재 화면에서 제외했습니다.");
      }
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 삭제하세요."
        : "운영 DB 삭제 실패 · 연결과 권한을 확인하세요.");
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
              <th>연락처</th>
              <th>최근 접촉</th>
              <th>소속 매체 이력</th>
              <th>요청/선호</th>
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
                <td>
                  <div className="press-history-stack">
                    <b>{row.email || "-"}</b>
                    <span>{row.phone || "-"}</span>
                  </div>
                </td>
                <td>{row.contactDate || row.date || "-"}</td>
                <td>
                  <div className="press-history-stack">
                    <b>{row.recent}</b>
                    <span>당사 {Number(row.mediaOwnCount || 0).toLocaleString("ko-KR")} · 부정 {Number(row.mediaNegativeCount || 0).toLocaleString("ko-KR")}</span>
                  </div>
                </td>
                <td>{row.request || "-"}</td>
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
  const [draftKeywords, setDraftKeywords] = useState([]);
  const rows = useMemo(
    () => mergeKeywordRows(keywords.length ? keywords : keywordRowsFromGroups(), draftKeywords),
    [keywords, draftKeywords],
  );
  const grouped = useMemo(() => groupKeywordRows(rows), [rows]);

  const handleAddKeyword = async () => {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      setStatus("추가할 키워드를 입력하세요.");
      return;
    }
    const nextKeyword = { keyword: cleanKeyword, category, enabled: true };
    try {
      await saveMonitorKeyword(cleanKeyword, category);
      setDraftKeywords((current) => upsertKeywordRow(current, nextKeyword));
      setKeyword("");
      setStatus("운영 DB 저장 완료");
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 저장하세요."
        : "운영 DB 저장 실패 · 연결과 권한을 확인하세요.");
    }
  };

  return (
    <section className="content-grid two keyword-management-grid">
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

function ArticleFeed({ rows, compact = false, showTime = false, scraps = [], onFeedbackSaved, onScrapSaved }) {
  return (
    <div className={compact ? "feed-table compact" : "feed-table"}>
      {rows.map((row) => {
        const related = Array.isArray(row.relatedArticles) ? row.relatedArticles : [];
        const hasRelated = related.length > 1;
        const scrapped = isArticleScrapped(row, scraps);
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
                <ArticleScrapButton article={row} scrapped={scrapped} onScrapSaved={onScrapSaved} />
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

function ArticleScrapButton({ article, scrapped = false, onScrapSaved }) {
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
  if (canonical === "own" || /당사/.test(text)) return "당사";
  if (canonical === "regulation" || /정책|규제/.test(text)) return "정책/규제";
  if (canonical === "competitor" || /경쟁|GA|보험사/.test(text)) return "경쟁사";
  if (canonical === "industry" || /업계/.test(text)) return "업계동향";
  return text || "기타";
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
    : confirmedCount
      ? `오늘 발송 확인 ${confirmedCount}회`
      : "첫 발송 전";
  const statusLabel = dueCount ? status : confirmedCount ? "ok" : "pending";
  return {
    title: "일일보고서",
    icon: CalendarDays,
    status: statusLabel,
    label: dueCount ? healthStatusLabel(status) : confirmedCount ? "정상" : "대기",
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

function resolveMonitoringDateRange(articles = [], preset = {}) {
  if (preset.startDate || preset.endDate) {
    return {
      start: preset.startDate || preset.endDate || "",
      end: preset.endDate || preset.startDate || "",
    };
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

function stockToneClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "flat";
  return number > 0 ? "up" : "down";
}

function formatStockPrice(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "-";
  return `${number.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatStockPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatSignedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
}

function formatStockVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}백만`;
  if (number >= 10000) return `${Math.round(number / 10000).toLocaleString("ko-KR")}만`;
  return number.toLocaleString("ko-KR");
}

function formatStockTradingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}억원`;
  if (number >= 1000000) return `${Math.round(number / 1000000).toLocaleString("ko-KR")}백만원`;
  return `${Math.round(number).toLocaleString("ko-KR")}원`;
}

function formatStockTimestamp(value, fallback = "") {
  if (!value) return fallback || "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || String(value).slice(0, 16);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function formatStockDate(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text.length >= 10 ? text.slice(5, 10) : text;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeNumberDiff(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return null;
  return Number((leftNumber - rightNumber).toFixed(2));
}

function averagePeerReturnByPeriod(peerGroups = [], key = "20d") {
  const values = peerGroups
    .flatMap((group) => group.stocks || [])
    .map((stock) => Number(stock.returns?.[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function indexReturnByPeriod(indices = [], code = "KOSPI", key = "20d") {
  const row = indices.find((item) => String(item.code || "").toUpperCase() === code);
  const value = Number(row?.returns?.[key]);
  return Number.isFinite(value) ? value : null;
}

function sliceStockTrend(rows = [], rangeKey = "60d") {
  const count = Number(String(rangeKey).replace(/[^\d]/g, ""));
  if (!count || rows.length <= count) return rows;
  return rows.slice(-count);
}

function formatMarketStatus(value) {
  const text = String(value || "").toUpperCase();
  if (text === "OPEN") return "장중";
  if (text === "CLOSE" || text === "CLOSED") return "마감";
  if (text === "PREOPEN") return "개장 전";
  if (!text) return "상태 확인";
  return text;
}

function formatIndexPoint(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toFixed(2)}pt`;
}

function stockSeriesLabel(name) {
  return {
    company: "인카금융서비스",
    peer: "동종 평균",
    kospi: "KOSPI",
  }[name] || name;
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
