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
const TONE_FILTER_OPTIONS = ["??", "??", "??", "??", "??"];
const TONE_SORT_WEIGHT = new Map(TONE_FILTER_OPTIONS.map((label, index) => [label, index]));

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
    negative: "??",
    danger: "??",
    caution: "??",
    warning: "??",
    positive: "??",
    neutral: "??",
    exclude: "??",
    noise: "??",
    "??": "??",
    "??": "??",
    "??": "??",
    "??": "??",
    "??": "??",
  }[tone] || "";
}

function normalizeDeepLinkCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return {
    own: "??",
    company: "??",
    competitor: "GA",
    regulation: "??/??",
    industry: "???",
    "??": "??",
    "ga": "GA",
    "???": "???",
    "??/??": "??/??",
  }[category] || "";
}

function App() {
  const initialRoute = useMemo(() => readInitialRoute(), []);
  const [activeSection, setActiveSection] = useState(initialRoute.section);
  const [period, setPeriod] = useState("daily");
  const [operations, setOperations] = useState({ status: "loading", message: "?? ?? ?", articles: [] });
  const [loginOpen, setLoginOpen] = useState(false);
  const [monitoringPreset, setMonitoringPreset] = useState(initialRoute.monitoringPreset);
  const [working, setWorking] = useState(false);
  const [workLabel, setWorkLabel] = useState("");
  const workTimers = useRef([]);

  const clearWorkTimers = () => {
    workTimers.current.forEach((timer) => window.clearTimeout(timer));
    workTimers.current = [];
  };

  const finishWorkStatus = (label) => {
    setWorking(true);
    setWorkLabel(`${label} ??`);
    clearWorkTimers();
    workTimers.current.push(window.setTimeout(() => {
      setWorking(false);
      setWorkLabel("");
    }, 7000));
  };

  const refreshOperations = async (options = {}) => {
    const trigger = options.trigger === true;
    const label = options.label || (options.workflow === "regulator-releases.yml" ? "???? ???? ??" : "?? ????? ??");
    clearWorkTimers();
    setWorking(true);
    setWorkLabel(`${label} ?? ?`);
    setOperations((current) => ({
      ...current,
      status: trigger ? current.status : "loading",
      message: trigger ? `${label} ?? ?` : "?? ?? ?",
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
        triggerMessage = `${label} ?? ??`;
      } catch (error) {
        triggerMessage = `${label} ?? ??: ${error?.message || "?? ??"}`;
        triggerFailed = true;
      }
    }
    const next = await loadOperationalData();
    setOperations(triggerMessage ? { ...next, message: `${triggerMessage} ? ${next.message}` } : next);
    if (trigger && triggerFailed) {
      setWorkLabel(triggerMessage);
      workTimers.current.push(window.setTimeout(() => {
        setWorking(false);
        setWorkLabel("");
      }, 10000));
      return;
    }
    if (trigger) {
      setWorkLabel(`${label} ?? ?? ?`);
      workTimers.current.push(window.setTimeout(async () => {
        setWorkLabel(`${label} ?? ?? ?`);
        const delayed = await loadOperationalData();
        setOperations({ ...delayed, message: `${label} ?? ?? ? ? ${delayed.message}` });
      }, 20000));
      workTimers.current.push(window.setTimeout(async () => {
        setWorkLabel(`${label} ?? ?? ?`);
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
          label: "???? ??",
          cadence: "24?? ? 5?",
          latest: operations.watchRuns[0].latest,
          state: operations.watchRuns[0].state,
        },
        ...watchJobs.filter((job) => job.label !== "???? ??"),
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
      <aside className="side-nav" aria-label="?? ??">
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
  const userText = "??? 1611499 ???";

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">IN</div>
        <div>
          <strong>?? ?? ????</strong>
          <span>??? ?? ? ??? ? ?? ??</span>
        </div>
      </div>
      <div className="header-user-area">
        {working && <span className="work-status">?? ?{workLabel ? ` ? ${workLabel}` : ""}</span>}
        <div className="user-chip">
          <span>{userText}</span>
        </div>
      </div>
    </header>
  );
}

function PeriodControl({ period, setPeriod, compact = false }) {
  return (
    <div className={compact ? "period-control compact" : "period-control"} aria-label="?? ??">
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
    setStatus("?? DB ?? ?");
    try {
      const result = await verifyDashboardLogin(employeeNo.trim(), password);
      if (!result?.ok) {
        setStatus(result?.message || "??? ??? ??? ???.");
        return;
      }
      await onLoggedIn();
    } catch {
      setStatus("Supabase ?? ?? ??? ??? ??? ???.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="login-panel" onSubmit={submit}>
        <button type="button" className="icon-button close" onClick={onClose} aria-label="??">
          <X />
        </button>
        <h2>?? ??? ??</h2>
        <p>?? ????? ?? ?? ????? ??? ??, ???, ??, ??? ???? ?????.</p>
        <label>
          <span>??</span>
          <input value={employeeNo} onChange={(event) => setEmployeeNo(event.target.value)} autoFocus />
        </label>
        <label>
          <span>????</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {status && <div className="login-status">{status}</div>}
        <button className="primary-button" disabled={submitting}>
          <LogIn />??
        </button>
      </form>
    </div>
  );
}

function Overview({ data, articles, jobs, notifications, setActiveSection, onOpenMonitoring, operations, isWorking, onRefreshOperations }) {
  const { summary } = data;
  const isLoading = operations?.status === "loading" || isWorking;
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${data.label} ? ${data.scope}`}
        title="??? ????"
        description="?? ??? ?? ?? ??, ?? ???, ???, ??? ?? ??? 5? ??? ?????."
        right={(
          <button
            type="button"
            className="ghost-button"
            onClick={() => onRefreshOperations?.({ trigger: true, source: "overview_issues" })}
            disabled={isLoading}
          >
            <RefreshCw />??
          </button>
        )}
      />

      <section className="briefing-card">
        <div>
          <span className="live-label"><span /> LIVE MEDIA BRIEFING</span>
          <h2>{summary.headline}</h2>
        </div>
      </section>

      <KpiGrid summary={summary} onOpenMonitoring={onOpenMonitoring} />

      <section className="dashboard-grid">
        <div className="main-column">
          <Panel title="?? ??" icon={Newspaper} meta="??? ?? 5? ??">
            <IssueList issues={data.issues} />
          </Panel>
        </div>
        <div className="middle-column">
          <Panel title="??? ???" icon={LineChart} meta="?? ??">
            <CategoryChart rows={data.categoryFlow} />
          </Panel>
          <Panel title="??? ???" icon={Building2} meta="??? ? ?? ? ??">
            <PressInfluence rows={data.pressInfluence} onOpenMonitoring={onOpenMonitoring} />
          </Panel>
        </div>
        <div className="side-column">
          <WatchPanel jobs={jobs} risk={summary.risk} />
          <AiUsagePanel status={operations?.aiStatus} />
          <Panel title="??? ?? ??" icon={Bell} meta={`${notifications.length.toLocaleString("ko-KR")}?`}>
            <NotificationList rows={notifications} />
          </Panel>
          <Panel title="??? ???" icon={CalendarDays} meta="???">
            <JobRows rows={jobs} />
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
    ? `${filtered.length.toLocaleString("ko-KR")}? ? ?? ${grouped.length.toLocaleString("ko-KR")}?`
    : `${filtered.length.toLocaleString("ko-KR")}?`;
  const isLoading = operations?.status === "loading" || isWorking;

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Live Monitoring"
        title="??? ????"
        description="?? ??? ?? 5?? ??? ??, ?? ??? ?? ?? ??? ??? ?? ?? ???."
        right={(
          <div className="page-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onRefreshOperations?.({ trigger: true, source: "monitoring_feed" })}
              disabled={isLoading}
            >
              <RefreshCw />??
            </button>
            <button className="primary-button"><Download />CSV ??</button>
          </div>
        )}
      />
      <section className="filter-card">
        <label>
          <span>?? ???</span>
          <input type="date" value={startDateInput} onChange={(event) => setStartDateInput(event.target.value)} />
        </label>
        <label>
          <span>?? ???</span>
          <input type="date" value={endDateInput} onChange={(event) => setEndDateInput(event.target.value)} />
        </label>
        <button className="primary-button filter-action" onClick={applyDateFilter}>
          ??
        </button>
        <label className="tone-filter">
          <span>??</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">??</option>
            {TONE_FILTER_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="sort-filter">
          <span>??</span>
          <select value={viewMode} onChange={(event) => { setViewMode(event.target.value); setVisible(30); }}>
            <option value="related">???</option>
            <option value="latest">???</option>
          </select>
        </label>
        <label>
          <span>??</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">??</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>???</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">??</option>
            {sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="wide-filter">
          <span>???</span>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setQuery(queryInput);
                setVisible(30);
              }
            }}
            placeholder="??, ???, ??? ??"
          />
        </label>
        <button className="primary-button" onClick={() => { setQuery(queryInput); setVisible(30); }}>
          ??
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
          ???
        </button>
      </section>
      <section className="monitoring-layout">
        <Panel title="?? ?? ??" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed rows={visibleRows.slice(0, visible)} onFeedbackSaved={() => onRefreshOperations?.()} />
          {visibleRows.length > visible && (
            <button className="ghost-button full" onClick={() => setVisible((count) => count + 30)}>
              ???
            </button>
          )}
        </Panel>
        <Panel title="?? ?? ??" icon={ShieldCheck} meta="??? ??? ??">
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
        title="???? ????"
        description="??????????? ????? ?? ?? ???? ?? ??/?? ??? ??? ?????."
        right={(
          <div className="page-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onRefreshOperations?.({ trigger: true, workflow: "regulator-releases.yml", source: "regulator_releases", label: "???? ???? ??" })}
              disabled={operations?.status === "loading" || isWorking}
            >
              <RefreshCw />??
            </button>
          </div>
        )}
      />
      <section className="filter-card regulator-filter">
        <label className="wide-filter">
          <span>???</span>
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setQuery(queryInput);
            }}
            placeholder="??, ??, ?? ??"
          />
        </label>
        <label>
          <span>??</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">??</option>
            {sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>??</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">??</option>
            {tones.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className="primary-button filter-action" onClick={() => setQuery(queryInput)}>
          ??
        </button>
        <button className="ghost-button compact-button" onClick={resetFilters}>
          ???
        </button>
      </section>
      <RegulatorDirectionPanel rows={analysisRows} selectedCount={selectedRows.length} totalCount={filteredRows.length} />
      <Panel title="???? ??" icon={FileText} meta={`${filteredRows.length.toLocaleString("ko-KR")}?`}>
        <div className="regulator-list-actions">
          <button className="ghost-button compact-button" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? "?? ??" : "?? ?? ??"}
          </button>
          <span>{selectedRows.length ? `${selectedRows.length.toLocaleString("ko-KR")}? ?? ?? ?` : "???? ? ??? ?? ???? ???? ????"}</span>
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
        <h2><ShieldCheck />?? ??? ??</h2>
        <span>{selectedCount ? `${selectedCount.toLocaleString("ko-KR")}? ??` : `?? ${Math.min(totalCount, rows.length).toLocaleString("ko-KR")}? ??`}</span>
      </div>
      <div className="regulator-analysis-body">
        <div className="regulator-analysis-lead">
          <b>{analysis.headline}</b>
          <p>{analysis.summary}</p>
          <div className="regulator-watch-list">
            <span>?? ?? ???</span>
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
                <b>{theme.count.toLocaleString("ko-KR")}?</b>
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
              <span className="sr-only">???? ??</span>
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
                aria-label="???? ??"
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
        eyebrow={`${scopeLabel} ??`}
        title="??? ?? ???"
        description="?? ???????? ??, ??? ???, ???? ???, ?? ??? ?? ???."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            <button className="primary-button" onClick={() => printCurrentView("??? ?? ???")}>
              <FileText />??/PDF ??
            </button>
          </div>
        )}
      />
      <AnalysisDrillCards data={data} onOpenMonitoring={onOpenMonitoring} />
      <section className="media-analysis-layout">
        <div className="media-analysis-column">
          <Panel title="?? ?? ??" icon={Activity} meta="?? 31? ? ??/??/??">
            <ToneTrend rows={dailyTrend} />
          </Panel>
          <Panel title="???? ???" icon={LineChart} meta="?? ??? 10?">
            <CategoryChart rows={keywordRows} tall onOpenMonitoring={onOpenMonitoring} drillBy="keyword" labelWidth={132} />
            <KeywordBrief rows={keywordRows} />
          </Panel>
          <Panel title="?? ???" icon={Gauge} meta="?? ?? ??">
            <InsightList insights={observations} />
          </Panel>
        </div>
        <div className="media-analysis-column">
          <Panel title="??? ???" icon={Building2} meta="?? ?? ?? ??">
            <PressInfluence rows={data.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="?? ??" icon={Newspaper} meta={`${issueRows.length}?`}>
            <MonthlyIssueDigest issues={issueRows} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function AnalysisDrillCards({ data, onOpenMonitoring }) {
  const cards = [
    { label: "?? ??", value: `${data.summary.ownNegative}?`, tone: "negative", preset: { tone: "??" }, detail: "?? ?? ??" },
    { label: "?? ??", value: `${data.summary.caution}?`, tone: "caution", preset: { tone: "??" }, detail: "??????? ??" },
    { label: "?? ??", value: `${(data.toneTrend || []).reduce((sum, row) => sum + Number(row.positive || 0), 0)}?`, tone: "positive", preset: { tone: "??" }, detail: "?? ?? ??" },
    { label: "?? ??", value: `${data.summary.ownMentions}?`, tone: "default", preset: { category: "??" }, detail: "??? ?? ??" },
    { label: "GA/???", value: `${data.summary.gaInsurance}?`, tone: "positive", preset: { category: "GA" }, detail: "?? ?? ??" },
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

function Scraps({ scraps, onOpenMonitoring }) {
  const [prompt, setPrompt] = useState("?? ?? ???? ?? ??? ????? ??? ? ?? ?? ??? ?? ????.");
  const grouped = groupArticles(scraps, "category").slice(0, 5).map(([name, value]) => ({ name, value }));
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Scrap File"
        title="?? ?? ???"
        description="?? ??? ?? ?? ??, ?? ??, ?? ????? ?? ???? ?? ?????."
        right={<button className="primary-button"><FileText />??? ???</button>}
      />
      <section className="scrap-workspace-v2">
        <Panel title="??? ??" icon={Bookmark} meta={`${scraps.length}?`}>
          <div className="scrap-preset-row-v2">
            {["?? ??", "?? ??", "?? ??"].map((label) => (
              <button key={label} className="ghost-button" onClick={() => setPrompt(`${label} ???? ??? ??? ?? ??, ???, ?? ?? ???? ????.`)}>
                {label}
              </button>
            ))}
          </div>
          <textarea className="scrap-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="scrap-analysis-preview">
            <b>?? ??</b>
            <p>??? {scraps.length}? ? ?? ??, ?? ??, ??/GA ??? ??? ??? ??? ??? ? ????.</p>
          </div>
          <div className="scrap-actions-v2">
            <button className="primary-button">??? ??</button>
            <button className="ghost-button">JSON ??</button>
            <button className="ghost-button">?? ??</button>
          </div>
        </Panel>
        <div className="scrap-side-stack">
          <Panel title="??? ??" icon={LineChart} meta="?? ??">
            <CategoryChart rows={grouped.length ? grouped : [{ name: "???", value: scraps.length }]} mini onOpenMonitoring={onOpenMonitoring} />
          </Panel>
          <Panel title="??? ?? ??" icon={Newspaper} meta={`${scraps.length}?`}>
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
            <span>{item.source} ? {item.tone} ? {item.scrapedAt || item.date || "-"}</span>
            <ArticleSummaryBlock item={item} dense />
          </div>
        </article>
      ))}
      {!rows.length && <p>???? ??? ????.</p>}
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
    if (typeof window !== "undefined" && !window.confirm("??? ?? ???? ??? ??????")) return;
    setDraft(buildRiskResponseDraft(draftType, activeArticle, facts));
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Risk Response"
        title="??? ????"
        description="?? ????? ??? ?? URL? ???? ????? ?? ??? ?????."
        right={(
          <button
            className="ghost-button"
            onClick={() => onRefreshOperations?.({ trigger: true, label: "??? ?? ??", source: "risk_center_refresh" })}
          >
            <RefreshCw />??
          </button>
        )}
      />
      <section className="risk-layout">
        <Panel title="?? URL / ?? ??" icon={ShieldCheck} meta={facts.tone || "??"}>
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
              placeholder="?? URL"
            />
            <button className="primary-button" onClick={() => applyUrl(articleUrl)}>??</button>
          </div>
          <div className="fact-grid">
            <Fact label="?? ??" value={facts.claim} />
            <Fact label="?? ???" value={facts.relevance} />
            <Fact label="??" value={facts.tone} />
            <Fact label="?? ??" value={facts.intensity} />
          </div>
          <div className="risk-recent-list">
            <div className="risk-section-head">
              <b>?? ??/?? ??</b>
              <span>{riskArticles.length.toLocaleString("ko-KR")}?</span>
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
                    {article.source} ? {[article.date, article.time].filter(Boolean).join(" ") || "-"}
                    {Number(article.relatedCount || 1) > 1 ? ` ? ?? ${article.relatedCount}?` : ""}
                  </em>
                </span>
                <b>{article.title}</b>
                <ArticleSummaryBlock item={article} dense />
              </button>
            ))}
            {!riskArticles.length && (
              <div className="risk-empty">?? ??/?? ?? ???? ????.</div>
            )}
          </div>
        </Panel>
        <Panel title="?? ??" icon={FilePenLine} meta={draft ? "?? ??" : "?? ? ??"}>
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => { setDraftType("press"); setDraft(""); }}>?? ???</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => { setDraftType("internal"); setDraft(""); }}>?? ???</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "?? ??? ??" : "?? ??? ??"}</b>
            <p>{draft || "???? ??? ??? ? ??? ?????."}</p>
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
                <ExternalLink />?? ??
              </a>
            )}
            <button className="primary-button confirm-button" onClick={handleGenerateDraft}>?? ??</button>
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
        title="??? ????"
        description="?? URL? ??? ?? ??, ?? ???, ??? ???? ??? ??? ?????."
      />
      <section className="risk-layout">
        <Panel title="?? URL / ?? ??" icon={ShieldCheck} meta="?? ? ??">
          <div className="url-box">
            <input placeholder="?? URL? ??????" defaultValue="https://www.mk.co.kr/news/stock/12034143" />
            <button className="primary-button">??</button>
          </div>
          <div className="fact-grid">
            <Fact label="?? ??" value="???? ? ??? ??" />
            <Fact label="?? ???" value="?? ?? ??" />
            <Fact label="??" value="??" />
            <Fact label="?? ??" value="???? ? ?? ? ??" />
          </div>
        </Panel>
        <Panel title="?? ??" icon={FilePenLine} meta="?? ??">
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => setDraftType("press")}>?? ???</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => setDraftType("internal")}>?? ???</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "?? ??? ??" : "?? ??? ??"}</b>
            <p>
              ?? ??? ?? ??? ?? ??? ?? ???, ?? ??? ????? ?? ?? ? ?? ??? ?? ???? ??? ???? ?????.
            </p>
          </div>
          <button className="primary-button confirm-button">??? ??????</button>
        </Panel>
      </section>
    </main>
  );
}

function selectRiskCenterArticles(articles = []) {
  const usable = articles
    .filter((article) => article?.title && article.link && article.link !== "#")
    .filter((article) => !isOfficialRegulatorSource(article.source));
  const negative = usable.filter((article) => article.tone === "??" || String(article.riskLevel || "").toUpperCase() === "HIGH");
  const caution = usable.filter((article) => article.tone === "??" || String(article.riskLevel || "").toUpperCase() === "MEDIUM");
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
  if (/????/.test(text) && /??/.test(text) && /??|??|???/.test(text)) return "risk:jeonse-youth-support";
  if (/?????/.test(text) && /????|???|?? ??|????/.test(text)) return "risk:planner-privacy-controller";
  if (/???????|?? ??|????|?? ??|????/.test(text)) return "risk:incar-scandal-illegal-sales";
  if (/????/.test(text) && /?? ??|????|???|???/.test(text)) return "risk:incar-agency-control";
  if (/??|?? db|??db|db ??|?? ??/.test(text) && /??|????|??/.test(text)) return "risk:impersonation-customer-db";
  if (/????|????|????|??/.test(text) && /??|ga|???|???/.test(text)) return "risk:insurance-privacy-security";
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
  return /????|??|??|??|???|??|????|???|?????|????|????|???|????|??|??|??db|???|????|??|????/.test(token);
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
  if (/????/.test(text) && /??/.test(text)) {
    lines.push("???? ?? ?? ??? ??? ???? ???? ?????.");
    lines.push("?? ?? ????? ????? ???? ??? ??? ??? ?? ???? ?????.");
  } else if (/?????/.test(text) && /????|???|?? ??|????/.test(text)) {
    lines.push("?????? ???? ?? ??? ?? ??? ?? ??? ?? ?????.");
    lines.push("GA? ???? ?? ??? ??? ? ? ?? ?? ?? ??? ?????.");
  } else if (/???????|?? ??|????|?? ??|????/.test(text)) {
    lines.push("GA ?? ??? ?? ?? ??? ?? ??? ?? ?????.");
    lines.push("??? ?? ??? ????, ?? ?? ?? ???? ?? ???? ???.");
  } else if (/??|?? DB|??DB|DB ??|?? ??/i.test(text)) {
    lines.push("??? ??? ?? DB ?? ??? ??? ????? ??? ?????.");
    lines.push("?? ???, ?? ??, ?? ?? ???? ??? ???? ???.");
  } else if (/?? ??|????|???|???/.test(text) && /????/.test(text)) {
    lines.push("????? ??? ?? ??? ?? ?? ?? ??? ?????.");
    lines.push("?? ??, ?? ??, ?? ??? ?? ????? ???? ???.");
  } else {
    const topic = summarizeRiskTitleTopic(representative.title);
    lines.push(`${topic} ?? ??? ???, ????? ?? ???? ???? ???.`);
  }
  if (count > 1) lines.push(`?? ??? ?? ?? ?? ${count.toLocaleString("ko-KR")}?? ?? ?????.`);
  return dedupeSummaryLines(lines, summaryTitleKeys({ ...representative, relatedArticles: articles })).slice(0, 3);
}

function summarizeRiskTitleTopic(title = "") {
  const clean = cleanSummaryText(title)
    .replace(/\s*[-??]\s*[^-??]{2,30}$/u, "")
    .replace(/^[\[?][^\]?]+[\]?]\s*/u, "");
  const tokens = articleTokens(clean).filter((token) => !/??|??|??|??|???|????/.test(token));
  return tokens.slice(0, 5).join(" ") || "?? ??";
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
    title: articleUrl ? "URL ?? ??" : "?? ?? ??",
    link: articleUrl,
    source: host || "?? ??",
    tone: articleUrl ? "??" : "?? ??",
    category: "?? URL",
    summary: "",
  };
}

function buildRiskCenterFacts(article = {}, articleUrl = "") {
  const summaryLines = buildArticleSummaryLines(article);
  const claim = summaryLines[0]
    || compactArticleSummary(article)
    || cleanSummaryText(article.title)
    || (articleUrl ? "URL ???? ?? ?? ??? ?????." : "?? ??/?? ??? ?????.");
  const tone = article.tone && article.tone !== "?? ??"
    ? article.tone
    : String(article.riskLevel || "").toUpperCase() === "HIGH"
      ? "??"
      : articleUrl
        ? "??"
        : "?? ??";
  return {
    claim,
    relevance: buildRiskRelevance(article),
    tone,
    intensity: buildRiskIntensity(article, tone),
  };
}

function buildRiskRelevance(article = {}) {
  if (!article?.title || article.title === "?? ?? ??") return "?? ??";
  if (isOwnArticle(article)) return "?? ?? ??";
  if (article.category === "GA" || /GA|?????|???|????/i.test(`${article.title} ${article.summary} ${article.keyword}`)) {
    return "??/GA ??";
  }
  return "?? ??";
}

function buildRiskIntensity(article = {}, tone = "") {
  if (tone === "??" && isOwnArticle(article)) return "?? ??";
  if (tone === "??") return "?? ?? ??";
  if (tone === "??") return "????";
  return "??";
}

function buildRiskResponseDraft(type, article = {}, facts = {}) {
  const title = cleanSummaryText(article.title || "?? ?? ??");
  const source = article.source ? `${article.source} ??` : "?? ??";
  const claim = facts.claim || "?? ?? ??? ?????.";
  const relevance = facts.relevance || "??? ?? ??";
  if (type === "internal") {
    return [
      `?? ??? ${source} "${title}"???.`,
      `?? ??? ${facts.tone || "?? ??"}??, ?? ???? ${relevance}? ?????.`,
      `?? ??? ${claim}`,
      `????, ????? ??, ?? ?? ???? ??? ? ?? ? ?? ???? ??? ???????.`,
    ].join("\n");
  }
  return [
    `?? ??? ??? ?? ?? ??? ?? ??? ${claim}`,
    `??? ?? ?? ? ????? ??? ??? ???? ???, ???? ?? ??? ???? ???? ??? ?? ?????.`,
    `???? ??????? ??? ? ? ?? ??? ?? ??? ??? ?? ??? ???????.`,
    `?? ??? ???? ?? ??? ???? ????????.`,
  ].join("\n");
}

function Reports({ data, period, setPeriod, articles, scraps, onOpenMonitoring }) {
  const { summary } = data;
  const edition = publicationMeta(period, data);
  const reportArticles = articles || [];
  const expandedIssues = expandReportIssues(data.issues, reportArticles, period);
  const lead = buildReportLead(period, data, reportArticles, expandedIssues);
  const secondary = expandedIssues
    .filter((issue) => !sameIssue(issue, lead))
    .slice(0, period === "daily" ? 3 : 7);
  const reportTrend = buildDailyToneTrend(reportArticles, period === "weekly" ? 7 : 31, data.toneTrend);
  return (
    <main className="workspace report-workspace">
      <PageTitle
        eyebrow={edition.kicker}
        title="??/??/?? ???"
        description="??, ??, ?? ???? ?? ????? ???? ??? ???? ?????."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            <button className="primary-button" onClick={() => printCurrentView(`${edition.title} ${data.scope || ""}`)}>
              <Download />??/PDF ??
            </button>
          </div>
        )}
      />
      <section className={`report-sheet publication-sheet ${period}`}>
        <header className="publication-masthead">
          <div className="publication-topline">
            <span>{edition.issue}</span>
            <span>{data.scope}</span>
            <span>INCAR MEDIA DESK</span>
          </div>
          <div className="masthead-main">
            <div>
              <h1>{edition.title}</h1>
              <p>{edition.subtitle}</p>
            </div>
          </div>
        </header>

        <div className="publication-body">
          <article className="lead-story">
            <span className="section-label">Front Page</span>
            <h2>{lead?.title || summary.headline}</h2>
            <ArticleSummaryBlock item={lead || { title: summary.headline, summary: summary.headline, category: data.label, tone: summary.risk === "LOW" ? "??" : "??" }} />
            <div className="story-meta">
              {lead?.tone && <Chip tone={lead.tone}>{lead.tone}</Chip>}
              {lead?.category && <Chip>{lead.category}</Chip>}
              <span>{lead?.source || data.label} ? {lead?.publishedAt || data.scope}</span>
            </div>
          </article>

          <aside className="front-rail">
            <ReportMetricBoard
              summary={summary}
              articles={reportArticles}
              period={period}
              onOpenMonitoring={onOpenMonitoring}
            />
          </aside>

          <section className="paper-section story-grid">
            <div className="paper-section-head">
              <span>Inside Pages</span>
              <b>?? ??</b>
            </div>
            {secondary.map((issue) => <ReportStory key={`${issue.source}-${issue.title}`} issue={issue} />)}
          </section>

          <section className="paper-section analysis-page">
            <div className="paper-section-head">
              <span>Media Map</span>
              <b>??? ???</b>
            </div>
            <PressInfluence rows={data.pressInfluence} compact onOpenMonitoring={onOpenMonitoring} />
          </section>

          <section className="paper-section chart-page">
            <div className="paper-section-head">
              <span>Data Page</span>
              <b>??? ??</b>
            </div>
            <CategoryChart rows={data.categoryFlow} mini />
          </section>

          {period !== "daily" && (
            <>
              <section className="paper-section trend-page">
                <div className="paper-section-head">
                  <span>Trend Page</span>
                  <b>?? ??</b>
                </div>
                <ToneTrend rows={reportTrend} compact />
              </section>
              <section className="paper-section scrap-page">
                <div className="paper-section-head">
                  <span>Scrap File</span>
                  <b>??? ??</b>
                </div>
                <ScrapDigest scraps={scraps} />
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function publicationMeta(period, data) {
  const date = data.scope || data.generatedAt || "";
  const meta = {
    daily: {
      kicker: "Daily Edition",
      title: "INCAR MEDIA DAILY",
      subtitle: "??? ?? ??? ???? ?? ?? ???",
      issue: `${date} ? Daily No. 01`,
    },
    weekly: {
      kicker: "Weekly Edition",
      title: "INCAR MEDIA WEEKLY",
      subtitle: "? ?? ?? ??? ??? ??? ?? ???",
      issue: `${date} ? Weekly Review`,
    },
    monthly: {
      kicker: "Monthly Edition",
      title: "INCAR MEDIA MONTHLY",
      subtitle: "?? ?? ???? ???? ?? ?? ?? ???",
      issue: `${date} ? Monthly Desk`,
    },
  };
  return meta[period] || meta.daily;
}

function buildReportLead(period, data, articles, issues) {
  if (period === "daily") {
    return issues[0] || {
      tone: data.summary.risk === "LOW" ? "??" : "??",
      category: "???",
      source: data.label,
      title: data.summary.headline,
      summary: data.summary.headline,
      publishedAt: data.scope,
    };
  }
  const frontArticle = selectReportFrontArticle(articles, issues);
  const topCategories = groupArticles(articles, "category").slice(0, 2).map(([name]) => name).join("?") || "?? ??";
  const riskText = data.summary.ownNegative > 0
    ? `?? ?? ${data.summary.ownNegative}?? ?? ?? ???? ????`
    : "?? ?? ??? ?????";
  const cadence = period === "weekly" ? "?? ?" : "?? ?";
  if (frontArticle) {
    const ownPositive = isOwnArticle(frontArticle) && frontArticle.tone === "??";
    const ownNeutral = isOwnArticle(frontArticle) && frontArticle.tone === "??";
    const leadLines = buildArticleSummaryLines(frontArticle);
    return {
      ...frontArticle,
      category: frontArticle.category || "??",
      source: frontArticle.source || "INCAR Media Desk",
      summary: compactArticleSummary(frontArticle),
      summaryLines: unique([
        ownPositive
          ? `${cadence} ?? ????? ??? ??? ?? ???? ?????.`
          : ownNeutral
            ? `${cadence} ?? ?? ?? ??? ?? ?? ??? ?????.`
            : `${cadence} ?? ??? ??? ?????.`,
        ...leadLines,
        `?? ?? ${data.summary.ownMentions}?, ?? ?? ${data.summary.ownNegative}?, ?? ${data.summary.caution}?? ??? ???.`,
      ]).slice(0, 4),
      publishedAt: frontArticle.publishedAt || frontArticle.time || frontArticle.date || data.scope,
    };
  }
  const leadIssue = issues[0];
  return {
    tone: data.summary.risk === "LOW" ? "??" : "??",
    category: period === "weekly" ? "?? ??" : "?? ??",
    source: "INCAR Media Desk",
    title: leadIssue?.title || `${cadence} ?? ??? ${topCategories} ???? ??`,
    summary: `${riskText}, ?? ??? ??? ?? ??? ??? ?????. ${topCategories} ???? ?? ??? ????, ?? ?? ${data.summary.ownMentions}?? ??? ??? ?? ?????.`,
    summaryLines: [
      `${cadence} ?? ??? ${topCategories} ???? ??????.`,
      riskText,
      `?? ?? ${data.summary.ownMentions}?, ?? ?? ${data.summary.ownNegative}?, ?? ${data.summary.caution}?? ??? ?????.`,
      leadIssue?.title ? `?? ????? "${leadIssue.title}"???.` : "?? ??? ?? ? ???? ??? ???? ??????.",
    ],
    publishedAt: data.scope,
  };
}

function selectReportFrontArticle(articles = [], issues = []) {
  const candidates = [...articles, ...issues]
    .filter((item) => item && item.title && item.tone !== "??");
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
  if (own && item.tone === "??") score += 900;
  if (own && item.tone === "??") score += 520;
  if (own && item.tone === "??") score += 360;
  if (own && item.tone === "??") score += 240;
  if (/????|??|??|??|??|??|1?|??|??|?????/.test(text)) score += own ? 180 : 40;
  if (/??|??|??|??|??|????|????/.test(text)) score += own ? 220 : 80;
  if (item.category === "??/??") score += 45;
  if (item.tone === "??") score += 35;
  if (item.tone === "??") score += 80;
  if (item.tone === "??") score += 70;
  if (/?????|???|??|??|????|????? ??/.test(text) && !own) score -= 300;
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
    { label: "??", value: summary.collected.toLocaleString("ko-KR"), preset: {} },
    { label: "??", value: summary.analyzed.toLocaleString("ko-KR"), preset: {} },
    { label: "??", value: summary.ownMentions, preset: { category: "??" } },
    { label: "GA/???", value: summary.gaInsurance, preset: { category: "GA" } },
  ];
  return (
    <section className={`report-metric-board ${showLedger ? "has-ledger" : ""}`}>
      <button className={`report-risk-line ${summary.risk.toLowerCase()}`} onClick={() => onOpenMonitoring?.({ category: "??" })}>
        <span>??? ??</span>
        <b>{summary.risk}</b>
        <em>?? {summary.ownNegative} ? ?? {summary.caution}</em>
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
            <b>?? ?? ??</b>
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
    <article className="report-story">
      <div>
        <Chip tone={issue.tone}>{issue.tone}</Chip>
        <Chip>{issue.category}</Chip>
      </div>
      <h3>{issue.title}</h3>
      <ArticleSummaryBlock item={issue} dense />
      <span>{issue.source} ? {issue.publishedAt}</span>
    </article>
  );
}

function ReportLedger({ articles, compact = false }) {
  const rows = [
    { label: "?? ?? ??", value: articles.filter(isOwnArticle).length, preset: "??" },
    { label: "??/?? ??", value: articles.filter((item) => ["??", "??"].includes(item.tone)).length, preset: "???" },
    { label: "GA???? ??", value: articles.filter((item) => ["GA", "???"].includes(item.category)).length, preset: "??" },
    { label: "??/??? ??", value: articles.filter((item) => item.tone === "??" || item.category === "??").length, preset: "??" },
  ];
  return (
    <div className={`report-ledger ${compact ? "compact" : ""}`}>
      {rows.map((row) => (
        <article key={row.label}>
          <span>{row.label}</span>
          <b>{row.value.toLocaleString("ko-KR")}?</b>
          <em>{row.preset}</em>
        </article>
      ))}
    </div>
  );
}

function AdSpendChart({ rows, color = "#2855d9", compact = false }) {
  if (!rows.length) {
    return <div className="chart-empty">??? ?? ???? ????.</div>;
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

function Management({ management, operations }) {
  const [tab, setTab] = useState("media");
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Operations"
        title="?? ??"
        description="???, ??, ??? ??? ???? ??? ?? ?? ?? ??? ??? ?????."
        right={<DataSourcePill operations={operations} />}
      />
      <ManagementSummary management={management} />
      <div className="management-tabs">
        {[
          ["media", "??? ??", Building2],
          ["reporters", "?? ??", Users],
          ["ads", "??? ??", WalletCards],
          ["keywords", "???/??", Settings],
          ["feedback", "?? ???", FilePenLine],
        ].map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon />{label}
          </button>
        ))}
      </div>
      {tab === "media" && <MediaManagement rows={management.media} aliases={operations.aliases || []} />}
      {tab === "reporters" && <ReporterManagement rows={management.reporters} />}
      {tab === "ads" && <AdManagement rows={management.ads} />}
      {tab === "keywords" && <KeywordManagement keywords={operations.keywords || []} />}
      {tab === "feedback" && <FeedbackManagement feedback={operations.feedback || []} operations={operations} />}
    </main>
  );
}

function ManagementSummary({ management }) {
  const totalAd = management.ads.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <section className="management-summary">
      <StatCard icon={Building2} label="?? ???" value={`${management.media.length.toLocaleString("ko-KR")}?`} />
      <StatCard icon={Users} label="?? ???" value={`${management.reporters.length.toLocaleString("ko-KR")}?`} />
      <StatCard icon={WalletCards} label="??? ??" value={formatMoney(totalAd)} />
      <StatCard icon={Megaphone} label="?? ??" value={`${keywordGroups.length}? ??`} />
    </section>
  );
}

function MediaManagement({ rows, aliases = [] }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [mediaStatus, setMediaStatus] = useState("");
  const [mediaForm, setMediaForm] = useState(emptyMediaForm);
  const [managingMedia, setManagingMedia] = useState(false);
  const [localAliases, setLocalAliases] = useState(() => readLocalRows(PRESS_ALIAS_DRAFT_KEY));
  const [localMediaRows, setLocalMediaRows] = useState(() => readLocalRows("news_monitor_media_relation_drafts_v1"));
  const aliasRows = useMemo(() => mergeAliasRows(aliases, localAliases), [aliases, localAliases]);
  const managedRows = useMemo(() => mergeMediaRows(rows, aliasRows, localMediaRows), [rows, aliasRows, localMediaRows]);
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
      status: row.status || "??",
      owner: row.owner || "",
      contactDate: row.contactDate || "",
      beat: row.beat || "",
      leadReporter: row.leadReporter || "",
      email: row.email || "",
      phone: row.phone || "",
      memo: row.memo || "",
    });
    setManagingMedia(true);
    setMediaStatus(row.name ? `${row.name} ?? ??? ?? ????.` : "? ??? ??? ?????.");
  };

  const handleSaveMedia = async () => {
    const item = normalizeMediaDraft(mediaForm);
    if (!item.name) {
      setMediaStatus("????? ???? ???.");
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
      setMediaStatus("Supabase ?? ??");
    } catch {
      setMediaStatus("?? ?? ?? ?? ? ?? ?? ?? ? DB ??");
    }
  };

  return (
    <Panel title="??? ??" icon={Building2} meta={`${managedRows.length.toLocaleString("ko-KR")}?`}>
      <div className="management-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="????, ???, ?? ??" />
        <button className="ghost-button">?? ??</button>
        <button className="primary-button" onClick={() => handleManageMedia()}>??? ??</button>
      </div>
      {managingMedia && (
        <div className="operation-form media-detail-form">
          <label>
            <span>????</span>
            <input value={mediaForm.name} onChange={(event) => updateMediaForm("name", event.target.value)} placeholder="?: ????" />
          </label>
          <label>
            <span>?? URL/???</span>
            <input value={mediaForm.url} onChange={(event) => updateMediaForm("url", event.target.value)} placeholder="https://example.co.kr" />
          </label>
          <label>
            <span>??</span>
            <select value={mediaForm.grade} onChange={(event) => updateMediaForm("grade", event.target.value)}>
              {["A", "B", "C", "??"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>?? ??</span>
            <select value={mediaForm.status} onChange={(event) => updateMediaForm("status", event.target.value)}>
              {["??", "??", "??", "??"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>???</span>
            <input value={mediaForm.owner} onChange={(event) => updateMediaForm("owner", event.target.value)} placeholder="??? / ???" />
          </label>
          <label>
            <span>?? ???</span>
            <input type="date" value={mediaForm.contactDate} onChange={(event) => updateMediaForm("contactDate", event.target.value)} />
          </label>
          <label>
            <span>?? ??</span>
            <input value={mediaForm.beat} onChange={(event) => updateMediaForm("beat", event.target.value)} placeholder="??/GA, ??, ????" />
          </label>
          <label>
            <span>?? ??</span>
            <input value={mediaForm.leadReporter} onChange={(event) => updateMediaForm("leadReporter", event.target.value)} placeholder="?? ?? ??" />
          </label>
          <label>
            <span>???</span>
            <input value={mediaForm.email} onChange={(event) => updateMediaForm("email", event.target.value)} placeholder="desk@example.co.kr" />
          </label>
          <label>
            <span>??</span>
            <input value={mediaForm.phone} onChange={(event) => updateMediaForm("phone", event.target.value)} placeholder="02-0000-0000" />
          </label>
          <label className="media-memo-field">
            <span>?? ??</span>
            <textarea value={mediaForm.memo} onChange={(event) => updateMediaForm("memo", event.target.value)} placeholder="???? ?? ??, ?? ??, ????, ?? ?? ??" />
          </label>
          <div className="operation-form-actions media-detail-actions">
            <button className="ghost-button" onClick={() => { setManagingMedia(false); setMediaForm(emptyMediaForm); setMediaStatus(""); }}>??</button>
            <button className="primary-button" onClick={handleSaveMedia}>?? ?? ??</button>
          </div>
          {mediaStatus && <p className="status-note">{mediaStatus}</p>}
        </div>
      )}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>???</th>
              <th>?? ??</th>
              <th>??</th>
              <th>??</th>
              <th>??</th>
              <th>?? ??</th>
              <th>???</th>
              <th>??</th>
              <th>??</th>
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
                <td><Chip tone={row.status}>{row.status || "??"}</Chip></td>
                <td>{row.owner || "-"}</td>
                <td>{row.contactDate || "-"}</td>
                <td>{Number(row.total || 0).toLocaleString("ko-KR")}?</td>
                <td>{row.memo || "-"}</td>
                <td>
                  <button className="ghost-button compact-button" onClick={() => handleManageMedia(row)}>??</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 15 && (
        <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "??" : "???"}
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
      status: row.status || "??",
      contactDate: row.contactDate || row.date || "",
      email: row.email || "",
      phone: row.phone || "",
      request: row.request || "",
      memo: row.memo || "",
    });
    setStatus("??? ?? ??? ?? ????.");
  };

  const handleSaveReporter = async () => {
    const item = normalizeReporterDraft(form);
    if (!item.name || !item.media) {
      setStatus("???? ???? ???? ???.");
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
      setStatus("Supabase ?? ??");
    } catch {
      setStatus("?? ?? ?? ?? ? ?? ?? ?? ? DB ??");
    }
  };

  const handleDeleteReporter = async (row) => {
    const key = reporterKey(row);
    const nextState = hideReporterLocal(localState, row);
    persistLocalState(nextState);
    try {
      if (/^\d+$/.test(String(row.id || ""))) {
        await deleteReporterProfile(row.id);
        setStatus("Supabase ?? ??");
      } else {
        setStatus("?? ???? ??????.");
      }
    } catch {
      persistLocalState({ ...nextState, hidden: unique([...nextState.hidden, key]) });
      setStatus("?? ???? ??????. ?? ?? ?? ? DB ?? ??");
    }
  };

  return (
    <Panel title="?? ??" icon={Users} meta={`${managedRows.length.toLocaleString("ko-KR")}?`}>
      <div className="operation-form reporter-form">
        <label>
          <span>???</span>
          <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="?: ???" />
        </label>
        <label>
          <span>???</span>
          <input value={form.media} onChange={(event) => updateForm("media", event.target.value)} placeholder="?: ????" />
        </label>
        <label>
          <span>?? ??</span>
          <input value={form.beat} onChange={(event) => updateForm("beat", event.target.value)} placeholder="??/GA, ????" />
        </label>
        <label>
          <span>?? ??</span>
          <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
            {["??", "??", "??", "??"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>?? ???</span>
          <input type="date" value={form.contactDate} onChange={(event) => updateForm("contactDate", event.target.value)} />
        </label>
        <label>
          <span>???</span>
          <input value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="reporter@example.co.kr" />
        </label>
        <label>
          <span>??</span>
          <input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="010-0000-0000" />
        </label>
        <label>
          <span>??/??</span>
          <input value={form.request} onChange={(event) => updateForm("request", event.target.value)} placeholder="?? ??, ??, ?? ??" />
        </label>
        <label className="reporter-memo-field">
          <span>??</span>
          <textarea value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="?? ??, ????, ?? ??" />
        </label>
        <div className="operation-form-actions reporter-actions">
          <button className="ghost-button" onClick={() => { setForm(emptyReporterForm); setStatus(""); }}>???</button>
          <button className="primary-button" onClick={handleSaveReporter}>{form.id ? "?? ??" : "?? ??"}</button>
        </div>
        {status && <p className="status-note">{status}</p>}
      </div>
      <div className="management-toolbar reporter-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="???, ???, ??, ?? ??" />
        <button className="ghost-button" onClick={() => setQuery(form.media || form.name)}>?? ?? ??</button>
        <button className="primary-button" onClick={handleSaveReporter}>?? ?? ??</button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>??</th>
              <th>???</th>
              <th>??</th>
              <th>??</th>
              <th>?? ??</th>
              <th>?? ??</th>
              <th>??</th>
              <th>??</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id || `${row.name}-${row.outlet}`}>
                <td><b>{row.name}</b></td>
                <td>{row.outlet || row.media}</td>
                <td>{row.beat || "-"}</td>
                <td><Chip tone={row.status}>{row.status || "??"}</Chip></td>
                <td>{row.contactDate || row.date || "-"}</td>
                <td>{row.recent}</td>
                <td>{row.memo || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost-button" onClick={() => handleEditReporter(row)}>??</button>
                    <button className="ghost-button danger" onClick={() => handleDeleteReporter(row)}>??</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRows.length > 15 && (
        <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "??" : "???"}
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
    <Panel title="??? ??" icon={WalletCards} meta={`${rows.length.toLocaleString("ko-KR")}?`}>
      <div className="ad-summary-row">
        <StatCard icon={WalletCards} label="? ???" value={formatMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0))} />
        <StatCard icon={CalendarDays} label="?? ?" value={`${unique(rows.map((row) => row.month)).length}??`} />
        <StatCard icon={Building2} label="?? ?" value={`${unique(rows.map((row) => row.media)).length}?`} />
      </div>
      <div className="ad-chart-grid">
        <article className="ad-chart-card wide">
          <div>
            <b>?? ?? ??</b>
            <span>{adData.monthly.length.toLocaleString("ko-KR")}??</span>
          </div>
          <AdSpendChart rows={adData.monthly} color="#2855d9" />
        </article>
        <article className="ad-chart-card">
          <div>
            <b>??? ??</b>
            <span>?? 6?</span>
          </div>
          <AdSpendChart rows={adData.media} color="#14805f" compact />
        </article>
        <article className="ad-chart-card">
          <div>
            <b>??? ??</b>
            <span>??</span>
          </div>
          <AdSpendChart rows={adData.type} color="#b45309" compact />
        </article>
      </div>
      <div className="management-toolbar ad-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="???, ?? ??" />
        <button className="ghost-button">?? ??</button>
        <button className="ghost-button" onClick={() => printAdReport(rows)}><Download />??/PDF ??</button>
        <button className="primary-button">??? ??</button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>?</th>
              <th>??</th>
              <th>??</th>
              <th>??</th>
              <th>??</th>
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
          {showAll ? "??" : "???"}
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
      setStatus("??? ???? ?????.");
      return;
    }
    const nextKeyword = { keyword: cleanKeyword, category, enabled: true };
    const nextLocal = upsertKeywordRow(localKeywords, nextKeyword);
    setLocalKeywords(nextLocal);
    writeLocalRows(KEYWORD_DRAFT_KEY, nextLocal);
    setKeyword("");
    try {
      await saveMonitorKeyword(cleanKeyword, category);
      setStatus("Supabase ?? ??");
    } catch {
      setStatus("?? ?? ?? ?? ? ?? ?? ?? ? DB ??");
    }
  };

  return (
    <section className="content-grid two">
      <Panel title="?? ??? ???" icon={Settings} meta={`${rows.length.toLocaleString("ko-KR")}?`}>
        <div className="operation-form keyword-add-form">
          <label>
            <span>?? ??</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {keywordCategories.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>???</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddKeyword();
              }}
              placeholder="?: ???????"
            />
          </label>
          <div className="operation-form-actions">
            <button className="primary-button" onClick={handleAddKeyword}>??? ??</button>
          </div>
          {status && <p className="status-note">{status}</p>}
        </div>
        <div className="keyword-manager-list">
          {grouped.map((group) => (
            <article key={group.category} className="keyword-manager-group">
              <div>
                <b>{keywordCategoryLabel(group.category)}</b>
                <span>{group.items.length.toLocaleString("ko-KR")}?</span>
              </div>
              <p>{keywordCategoryRule(group.category)}</p>
              <div className="keyword-chip-grid">
                {group.items.map((item) => <Chip key={`${item.category}-${item.keyword}`} tone={keywordCategoryTone(item.category)}>{item.keyword}</Chip>)}
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="?? ??" icon={ShieldCheck} meta="??????????????">
        <RuleStack />
      </Panel>
    </section>
  );
}

function FeedbackManagement({ feedback = [], operations }) {
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

  const openLogin = () => window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
  const approveCandidate = async (candidate) => {
    if (needsLogin) {
      setStatus("?? DB ??? ?????. ????? ?????.");
      openLogin();
      return;
    }
    try {
      await saveMonitorKeyword(candidate.keyword, candidate.category);
      setStatus(`${candidate.keyword} ?? ??? ${keywordCategoryLabel(candidate.category)}? ??????.`);
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") ? "?? DB ??? ?????." : "?? ?? ?? ? ??? ?????.");
      if (error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")) openLogin();
    }
  };

  return (
    <section className="content-grid two">
      <Panel title="?? ?? ??" icon={ShieldCheck} meta={`${candidates.length.toLocaleString("ko-KR")}?`}>
        {needsLogin && (
          <div className="status-note feedback-login-note">
            ??? ?? ??? ?? DB ???? ?????.
            <button className="ghost-button compact-button" onClick={openLogin}>?? DB ??</button>
          </div>
        )}
        <div className="feedback-candidate-list">
          {candidates.length ? candidates.slice(0, 8).map((candidate) => (
            <article key={candidate.key} className="feedback-candidate">
              <div>
                <Chip tone={keywordCategoryTone(candidate.category)}>{candidate.action}</Chip>
                <b>{candidate.label}</b>
                <span>{candidate.count.toLocaleString("ko-KR")}? ?? ? {candidate.example}</span>
              </div>
              <button className="ghost-button compact-button" onClick={() => approveCandidate(candidate)}>
                ?? ??
              </button>
            </article>
          )) : (
            <div className="empty-state">?? ???? ??? ?? ??? ??? ???? ????.</div>
          )}
        </div>
        {status && <p className="status-note">{status}</p>}
      </Panel>
      <Panel title="?? ?? ??" icon={FilePenLine} meta={`${rows.length.toLocaleString("ko-KR")}?`}>
        <div className="management-toolbar feedback-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="???, ??/?? ??, ?? ??" />
          <button className="ghost-button compact-button" onClick={() => setQuery("")}>???</button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table feedback-table">
            <thead>
              <tr>
                <th>???</th>
                <th>??</th>
                <th>??</th>
                <th>??</th>
                <th>??</th>
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
                        ?? ??
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
        {filteredRows.length > 15 && (
          <button className="ghost-button full" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "??" : "???"}
          </button>
        )}
      </Panel>
    </section>
  );
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
    { label: "????", value: summary.collected.toLocaleString("ko-KR"), icon: Newspaper, preset: {} },
    { label: "????", value: summary.analyzed.toLocaleString("ko-KR"), icon: Gauge, preset: {} },
    { label: "????", value: summary.ownMentions, icon: Building2, preset: { category: "??" } },
    { label: "????", value: summary.ownNegative, icon: AlertTriangle, tone: "negative", preset: { category: "??", tone: "??" } },
    { label: "??", value: summary.caution, icon: Bell, tone: "caution", preset: { tone: "??" } },
    { label: "GA/???", value: summary.gaInsurance, icon: Activity, tone: "positive", preset: { category: "GA" } },
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

function MonthlyIssueDigest({ issues }) {
  const [lead, ...rest] = issues;
  if (!lead) {
    return <div className="monthly-issue-empty">?? 1?? ???? ??? ?? ??? ????.</div>;
  }
  return (
    <div className="monthly-issue-digest">
      <article className="monthly-issue-lead">
        <div className="issue-meta">
          <Chip tone={lead.tone}>{lead.tone}</Chip>
          <Chip>{lead.category}</Chip>
          <span>{formatIssueMeta(lead)}</span>
        </div>
        <span className="monthly-issue-kicker">Headline</span>
        <h3>{lead.title}</h3>
        <ArticleSummaryBlock item={lead} />
        {lead.link && lead.link !== "#" && (
          <a className="article-link-button" href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
            <ExternalLink />?? ??
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
              <a href={issue.link} target="_blank" rel="noopener noreferrer" aria-label="?? ??" onClick={(event) => openArticleLink(event, issue.link)}>
                <ExternalLink />
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function IssueList({ issues, compact = false }) {
  return (
    <div className={compact ? "issue-list compact" : "issue-list"}>
      {issues.map((issue) => (
        <article className="issue-card" key={`${issue.source}-${issue.title}`}>
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
              <ExternalLink />?? ??
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
    ? `${baseSource} ? ${relatedSourceCount - 1}?`
    : issue.source || baseSource;
  const parts = [
    sourceLabel,
    issue.publishedAt || issue.time || issue.date,
  ].filter(Boolean);
  return parts.join(" ? ");
}

function RelatedIssueDetails({ issue = {}, compact = false }) {
  const related = Array.isArray(issue.relatedArticles) ? issue.relatedArticles : [];
  if (related.length <= 1) return null;
  return (
    <details className={compact ? "issue-related-details compact" : "issue-related-details"}>
      <summary>?? ?? {related.length.toLocaleString("ko-KR")}? ??</summary>
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
                  <summary>?? ?? ??</summary>
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
                    aria-label="?? ??"
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

const FEEDBACK_CATEGORY_OPTIONS = ["??", "GA", "???", "??/??", "????", "??", "??"];
const FEEDBACK_TONE_OPTIONS = ["??", "??", "??", "??", "??"];

function ArticleCorrectionControl({ article, onSaved }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(article.category || "??");
  const [tone, setTone] = useState(article.tone || "??");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setStatus("?? ?");
    try {
      const result = await saveClassificationFeedback(article, {
        category,
        tone,
        reason: "dashboard_manual_correction",
        createdBy: "dashboard",
      });
      const patchNote = result?.patchError ? " ? ?? ??? ?? ?? ??" : "";
      setStatus(`?? ??${patchNote}`);
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
        <FilePenLine />?? ??
      </button>
      {open && (
        <div className="correction-editor">
          <label>
            <span>??</span>
            <select value={tone} onChange={(event) => setTone(event.target.value)}>
              {FEEDBACK_TONE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>??</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {FEEDBACK_CATEGORY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" className="primary-button compact-save" onClick={save} disabled={saving}>
            ??
          </button>
          <button type="button" className="ghost-button compact-cancel" onClick={() => setOpen(false)} disabled={saving}>
            ??
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
    return "?? DB ??? ?????. ????? ?????.";
  }
  if (message.includes("write_not_allowed")) {
    return "?? ??? ????.";
  }
  return "?? ?? ? ??? ??? ???.";
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
    if (extra > 0) parts.push(`? ${extra}?`);
  }
  return parts.join(" ? ");
}

function openArticleLink(event, url) {
  event.preventDefault();
  event.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}

function WatchPanel({ jobs, risk = "LOW" }) {
  const watchJob = jobs.find((job) => job.label === "???? ??") || jobs[0] || {};
  return (
    <section className="panel watch-panel">
      <div className="watch-title-row">
        <span><Radar />???? ??</span>
        <b>?? ??? <em>{risk}</em></b>
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
          <h2>?? ??</h2>
          <p>?? 6? ?? ??</p>
          <strong>{watchJob.latest || "-"} ? 24?? ?? ?</strong>
          <span>24?? 5? ??</span>
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
  const requestPercent = percentRemaining(rate.remaining_requests, rate.limit_requests);
  const tokenPercent = percentRemaining(rate.remaining_tokens, rate.limit_tokens);
  const reserveValues = [requestPercent, tokenPercent].filter(Number.isFinite);
  const groqReserve = reserveValues.length
    ? Math.round(reserveValues.reduce((sum, value) => sum + value, 0) / reserveValues.length)
    : null;
  const meterFill = Number.isFinite(groqReserve) ? groqReserve : 0;
  const reserveLabel = groqReserve === null ? "?? ??" : groqReserve >= 70 ? "??" : groqReserve >= 35 ? "??" : "??";
  const geminiReport = gemini.latest_report || {};
  const geminiState = formatGeminiState(gemini, geminiReport);
  const geminiDetail = formatGeminiDetail(gemini, geminiReport);
  return (
    <section className="panel ai-usage-panel">
      <div className="ai-usage-head">
        <span><Gauge />API ?? ??</span>
        <b>{status?.generated_at ? formatCompactDateTime(status.generated_at) : "??"}</b>
      </div>
      <div className="ai-power-layout">
        <div className="ai-power-meter" style={{ "--meter-fill": `${meterFill}%` }}>
          <div className="ai-power-core">
            <strong>{groqReserve === null ? "--" : groqReserve}</strong>
            <span>{groqReserve === null ? "??" : "% ??"}</span>
          </div>
        </div>
        <div className="ai-power-copy">
          <span>Groq ?? ??</span>
          <b>{reserveLabel}</b>
          <em>{groq.model || "-"}</em>
        </div>
      </div>
      <div className="ai-meter-bars">
        <AiMeterRow label="? ??" percent={requestPercent} value={formatLimitPair(rate.remaining_requests, rate.limit_requests)} />
        <AiMeterRow label="?? ??" percent={tokenPercent} value={formatLimitPair(rate.remaining_tokens, rate.limit_tokens)} />
      </div>
      <div className="ai-backup-strip">
        <span>Gemini ??</span>
        <b>{geminiState}</b>
        <em>{gemini.model || "-"}</em>
        {geminiDetail && <small>{geminiDetail}</small>}
        {gemini.usage_url && <a href={gemini.usage_url} target="_blank" rel="noopener noreferrer">??? ??</a>}
      </div>
    </section>
  );
}

function AiMeterRow({ label, percent, value, mode = "remaining" }) {
  const fill = Number.isFinite(percent) ? percent : 0;
  const status = percent === null || percent === undefined
    ? "??"
    : percent >= 70 ? "??"
    : percent >= 35 ? "??"
    : "??";
  return (
    <div className="ai-meter-row" style={{ "--bar-fill": `${fill}%` }}>
      <div>
        <span>{label}</span>
        <b>{status}</b>
      </div>
      <div className="ai-meter-track" aria-label={`${label} ${mode === "used" ? "???" : "??"}`}>
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

function formatLimitPair(remaining, limit) {
  if (remaining === undefined && limit === undefined) return "?? ?? ? ??";
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
  if (!gemini.has_key) return "? ??";
  if (report.credit_depleted) return "??? ??";
  if (report.quota_exhausted) return "?? ??";
  if (lastResponse.status === "credit_depleted") return "??? ??";
  if (lastResponse.status === "quota_error") return "?? ??";
  if (gemini.circuit_open) return "?? ?";
  if (report.fallback_used) return "?? ??";
  if (lastResponse.status === "success") return "??";
  if (report.ai_model_used && report.primary_failed === false) return "??";
  return "?? ?? ??";
}

function formatGeminiDetail(gemini = {}, report = {}) {
  if (report.run_key) {
    const slot = report.report_slot ? `${report.report_slot}? ???` : "?? ???";
    const usageText = formatGeminiUsageText(report.usage);
    if (report.credit_depleted) return `${slot}?? Gemini ??? ??? ???? Groq/?? ??? ??????.`;
    if (report.quota_exhausted) return `${slot}?? Gemini ?? ??? ???? ??? ??????.`;
    if (report.fallback_used) return `${slot}?? ${report.ai_model_used || "?? ??"}? ??????.`;
    if (report.ai_model_used) return `${slot}?? ${report.ai_model_used} ??? ??????${usageText ? ` ? ${usageText}` : ""}.`;
  }
  const lastUsageText = formatGeminiUsageText(gemini.last_response?.usage);
  if (lastUsageText) return `?? Gemini ?? ${lastUsageText}.`;
  if (gemini.circuit_open && gemini.blocked_until) return `${formatCompactDateTime(gemini.blocked_until)}?? Gemini ??? ?? ????.`;
  if (gemini.circuit_reason) return gemini.circuit_reason;
  if (gemini.has_key) return "??? ?? ???? Gemini API ???? ???? ??, ?? ?? ??? ??? ??? ?????.";
  return "GEMINI_API_KEY? ???? ?????.";
}

function formatGeminiUsageText(usage = {}) {
  const total = usage?.total_token_count;
  if (total === undefined || total === null || total === "") return "";
  const prompt = usage.prompt_token_count;
  const output = usage.candidates_token_count;
  const pieces = [`? ${formatCompactNumber(total)}??`];
  if (prompt !== undefined) pieces.push(`?? ${formatCompactNumber(prompt)}`);
  if (output !== undefined) pieces.push(`?? ${formatCompactNumber(output)}`);
  return pieces.join(" ? ");
}

function NotificationList({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const visibleRows = showAll ? rows : rows.slice(0, 5);
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
      {rows.length > 5 && (
        <button className="ghost-button notification-more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "??" : "???"}
        </button>
      )}
      {selected && <NotificationDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function NotificationDetail({ item, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="detail-panel">
        <button type="button" className="icon-button close" onClick={onClose} aria-label="??">
          <X />
        </button>
        <span className="detail-kicker">??? ?? ??</span>
        <h2>{item.type || "???"}</h2>
        <div className="detail-meta">
          <Chip tone={item.status}>{item.status}</Chip>
          <span>{item.time}</span>
        </div>
        <pre>{item.body || "??? ?? ??? ????."}</pre>
        {item.link && (
          <a className="article-link-button" href={item.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, item.link)}>
            <ExternalLink />?? ?? ??
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
          <em>{item.total}?</em>
          {detailed && <small>?? {item.own} ? ?? {item.negative} ? {item.type || "??"}</small>}
        </button>
      ))}
    </div>
  );
}

function CategoryChart({ rows, tall = false, mini = false, onOpenMonitoring, drillBy = "category", labelWidth = 86 }) {
  const className = ["chart-box", tall ? "tall" : "", mini ? "mini" : "", onOpenMonitoring ? "with-drill" : ""]
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
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={labelWidth} tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 7, 7, 0]}>
              {rows.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
            </Bar>
          </BarChart>
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
          <Line type="monotone" dataKey="positive" stroke="#14805f" strokeWidth={2.5} dot={false} name="??" />
          <Line type="monotone" dataKey="caution" stroke="#b45309" strokeWidth={2.5} dot={false} name="??" />
          <Line type="monotone" dataKey="negative" stroke="#c92337" strokeWidth={2.5} dot={false} name="??" />
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
  if (!leaders.length) return <div className="keyword-brief empty">?? ??? ???? ??? ??? ?? ????.</div>;
  return (
    <div className="keyword-brief">
      {leaders.map((row, index) => (
        <span key={row.keyword || row.name}>
          <b>{index + 1}</b>
          {row.name} {Number(row.value || 0).toLocaleString("ko-KR")}?
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
  return <div className={`risk-pill ${level.toLowerCase()}`}><ShieldCheck />?? ??? <b>{level}</b></div>;
}

function DataSourcePill({ operations }) {
  return <div className={`data-source-pill ${operations.status}`}>{operations.message || "?? ???"}</div>;
}

function Chip({ children, tone }) {
  const cls = {
    ??: "negative",
    ??: "caution",
    ??: "neutral",
    ??: "positive",
    ??: "positive",
    ??: "positive",
    ??: "positive",
    ??: "neutral",
    ??: "muted",
  }[tone] || "plain";
  return <span className={`chip ${cls}`}>{children}</span>;
}

function composeRealtimeDataUnused(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const realtimeArticles = filterRowsByPeriod(articles, "daily");
  if (!realtimeArticles.length) {
    return buildDisconnectedPeriodData(base, "?? 24?? ?? ??? ?? ??? ????.");
  }
  return {
    ...composePeriodData(base, realtimeArticles, [], true),
    label: "???",
    scope: "?? 24?? ? 5? ?? ??",
  };
}

function composePeriodData(base, articles, reportRuns = [], liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const runSummary = summarizeReportRuns(reportRuns);
  if (!articles.length && !reportRuns.length) {
    return buildDisconnectedPeriodData(base, "?? ?? ???? ????.");
  }
  const usableArticles = articles.filter(isUsableArticle);
  const ownMentions = usableArticles.filter(isOwnArticle).length;
  const ownNegative = usableArticles.filter((article) => isOwnArticle(article) && article.tone === "??").length;
  const caution = usableArticles.filter((article) => article.tone === "??").length;
  const gaInsurance = usableArticles.filter((article) => ["GA", "???"].includes(article.category)).length;
  const headlineOwnMentions = ownMentions;
  const headlineOwnNegative = ownNegative;
  const headlineCaution = caution;
  const summary = {
    ...base.summary,
    collected: runSummary.collected ?? usableArticles.length,
    analyzed: runSummary.analyzed ?? usableArticles.filter((article) => article.tone !== "??").length,
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
    scope: usableArticles[0]?.date ? `${usableArticles[0].date} ??` : base.scope,
    issues: usableArticles.length ? buildIssues(usableArticles, base.issues) : [],
    categoryFlow: groupArticles(usableArticles, "category").slice(0, 6).map(([name, value]) => ({ name, value })),
    toneTrend: buildToneTrend(usableArticles),
    pressInfluence: buildPressInfluence(usableArticles),
  };
}

function buildDisconnectedPeriodData(base, headline = "?? DB ??? ? ?? ??/?? ??? ?????.") {
  return {
    ...base,
    scope: "??? ?? ??",
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
  const ownLead = articles.find(isOwnArticle);
  if (ownNegative > 0) {
    return `?? ?? ${ownNegative}?? ??????. ?? ?? ?? ?? "${ownLead?.title || "?? ??"}"? ?? ?????.`;
  }
  if (ownMentions > 0) {
    return `?? ?? ${ownMentions}?? ?? ???? ??/??? ??? ?????. ?? ?? "${ownLead?.title}"? ???? ?????.`;
  }
  return `?? ?? ??? ????. ?? ${caution}?? GA/??? ?? ${articles.filter((item) => ["GA", "???"].includes(item.category)).length}?? ?????.`;
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
  const groupToneScore = Math.max(...members.map((item) => ({ ??: 420, ??: 280, ??: 170, ??: 90, ??: 0 }[item.tone] || 0)));
  const toneScore = Math.max(groupToneScore, { ??: 420, ??: 280, ??: 170, ??: 90, ??: 0 }[issue.tone] || 0);
  const categoryScore = issue.category === "??/??" ? 130 : ["GA", "???"].includes(issue.category) ? 80 : 0;
  const ownScore = members.some(isOwnArticle) ? 520 : 0;
  const relatedScore = Math.min(Number(issue.relatedCount || 1), 6) * 24;
  return ownScore + toneScore + categoryScore + relatedScore + Number(issue.score || 0);
}

function buildMediaAnalysisIssues(articles = [], period = "monthly") {
  const scoped = articles
    .filter((article) => article?.title && article.tone !== "??")
    .filter((article) => !isPortalSource(article.source));
  const grouped = buildRelatedArticleGroups(scoped);
  return grouped
    .map((group) => normalizeMediaIssueGroup(group, period))
    .filter((issue) => issue.title)
    .sort((a, b) => mediaIssueScore(b, period) - mediaIssueScore(a, period) || articleTimeValue(b) - articleTimeValue(a))
    .slice(0, 12);
}

function normalizeMediaIssueGroup(group = {}, period = "monthly") {
  const members = dedupeIssueMembers(Array.isArray(group.relatedArticles) && group.relatedArticles.length ? group.relatedArticles : [group]);
  const representative = [...members]
    .sort((a, b) => mediaIssueScore(b, period) - mediaIssueScore(a, period) || articleTimeValue(b) - articleTimeValue(a))[0] || group;
  const relatedSources = unique(members.map((item) => item.source).filter(Boolean));
  const sourceLabel = relatedSources.length > 1
    ? `${relatedSources[0]} ? ${relatedSources.length - 1}?`
    : representative.source;
  return {
    ...representative,
    source: sourceLabel || representative.source,
    representativeSource: representative.source,
    relatedArticles: members,
    relatedCount: members.length,
    relatedSourceCount: relatedSources.length,
    relatedSources,
    category: representative.category || group.category || "??",
    tone: representative.tone || group.tone || "??",
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
  const riskBoost = isOwnArticle(item) && ["??", "??"].includes(item.tone) ? 220 : 0;
  return reportFrontScore(item) + relatedBoost + ownBoost + performanceBoost + riskBoost;
}

function isOwnPerformanceArticle(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`;
  return isOwnArticle(item) && /????|?????|??|??|??|??|??|1?|??|??|??|CSR|????/.test(text);
}

function buildMediaIssueSummaryLines(representative = {}, members = []) {
  const titleKeys = new Set(members.map((article) => normalizeRiskSummaryKey(article.title)).filter(Boolean));
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
    if (isDuplicateRiskSummaryKey(key, seen)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function buildArticleSummaryLines(item = {}) {
  const titleKeys = summaryTitleKeys(item);
  if (Array.isArray(item.summaryLines) && item.summaryLines.length) {
    return dedupeSummaryLines(item.summaryLines.map(normalizeSummaryLine).filter(Boolean), titleKeys)
      .slice(0, 4);
  }
  const cleanTitle = cleanSummaryText(item.title || "");
  const text = cleanSummaryText(item.summary || item.description || "");
  const sentences = splitSummarySentences(text)
    .map(normalizeSummaryLine)
    .filter((sentence) => sentence && sentence !== cleanTitle && !isGenericSummaryLine(sentence) && !isBrokenSummaryLine(sentence) && !isSummaryDuplicateOfTitle(sentence, titleKeys));
  const contextLines = buildContextualSummaryLines(item);
  const titleLine = normalizeSummaryLine(headlineBasedSummary(item));
  const candidates = contextLines.length >= 2
    ? [...contextLines, ...sentences]
    : [...contextLines, ...sentences, titleLine];
  return dedupeSummaryLines(candidates.filter(Boolean), titleKeys)
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
  return lines
    .map(normalizeSummaryLine)
    .filter(Boolean)
    .filter((line) => !isGenericSummaryLine(line) && !isBrokenSummaryLine(line) && !isSummaryDuplicateOfTitle(line, titleKeys))
    .filter((line) => {
      const key = normalizeSummaryCompareKey(line);
      if (!key || isDuplicateRiskSummaryKey(key, seen)) return false;
      seen.add(key);
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
    .replace(/\s*[-??]\s*[\p{L}\p{N}._?\s]{2,30}$/u, "")
    .replace(/(?:\.com|\.co\.kr|\.kr)$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 130);
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
    .replace(/^\[[^\]]+\s+[^\]]*(?:??|reporter)\]\s*/i, "")
    .replace(/^[^\s]+ (?:??|reporter)\s*=\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/(\.\.\.|?)+$/g, "")
    .trim();
}

function splitSummarySentences(value) {
  const clean = cleanSummaryText(value);
  if (!clean) return [];
  const normalized = clean
    .replace(/([.!??])\s+/g, "$1|")
    .replace(/(???|????|???|???|????|????|????|?|?|?|?|?)\s+/g, "$1.|");
  return normalized
    .split("|")
    .map((sentence) => sentence.replace(/(\.\.\.|?)+$/g, "").trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 6);
}

function isGenericSummaryLine(value) {
  const text = cleanSummaryText(value);
  return (
    /??? ???? ??? ?????/.test(text) ||
    /???? ??????/.test(text) ||
    /?? ??? ??????/.test(text) ||
    /?? ?? ?? ??/.test(text) ||
    /???? ??? ?? ??/.test(text) ||
    /????? ??? ?? ??/.test(text) ||
    /?? ??? ???? ?? ??/.test(text) ||
    /?? ??, ?? ??, ??? ??/.test(text) ||
    /????GA ?? ??/.test(text) ||
    /?? ?? ??? ??/.test(text) ||
    /?? ???? ??? ???? ??/.test(text) ||
    /?? ?? ???? ??/.test(text) ||
    /??? ??, ??, ??, ?? ??/.test(text)
  );
}

function normalizeSummaryLine(value) {
  const text = cleanSummaryText(value).replace(/[.?!?]+$/g, "").trim();
  if (!text || isGenericSummaryLine(text) || isBrokenSummaryLine(text)) return "";
  return `${text}.`;
}

function isBrokenSummaryLine(value) {
  const text = cleanSummaryText(value).replace(/[.?!?]+$/g, "").trim();
  if (!text) return true;
  if (text.length > 150) return true;
  return /(??|??|??|??|?|?|??|??|??|??|??|??|??|??)$/.test(text);
}

function headlineBasedSummary(item = {}) {
  const title = cleanSummaryText(item.title || "");
  if (!title || isGenericSummaryLine(title)) return "";
  if (isPreventiveSecuritySummary(item)) {
    return "?? ??? ?? ?? ??? ??? ????? ?? ??? ?? ?? ?? ?????.";
  }
  if (isInvestmentSummary(item)) {
    return "????, ???, ?? ???? ?? ?? ??? ?????.";
  }
  if (isSettlementSupportSummary(item)) {
    return "GA ????? ???? ?? ??? ??? ??? ?????.";
  }
  if (isInsuranceLossSummary(item)) {
    return "???? ???? ?? ??? ?? ???? ?? ?????.";
  }
  return title;
}

function buildContextualSummaryLines(item = {}) {
  const lines = [];
  if (isPreventiveSecuritySummary(item)) {
    if (isOwnArticle(item)) {
      lines.push("???????? ??? GA? ????? ?? ?? ?????.");
    }
    lines.push("??? ?? ?? ??? ??? ?? ??? ?? ?? ?? ?????.");
  } else if (isInvestmentSummary(item)) {
    lines.push("??? ?????? ??? ?? ? ?? ?? ??? ?? ?????.");
  } else if (isSettlementSupportSummary(item)) {
    lines.push("GA? ????? ?? ??? ??? ??? ??? ?????.");
  } else if (isInsuranceLossSummary(item)) {
    lines.push("???? ??, ???, ??? ??? ??? ???? ?? ?????.");
  }
  return unique(lines.map(normalizeSummaryLine).filter(Boolean));
}

function summaryHaystack(item = {}) {
  return cleanSummaryText(`${item.title || ""} ${item.summary || ""} ${item.description || ""} ${item.keyword || ""}`);
}

function isPreventiveSecuritySummary(item = {}) {
  const text = summaryHaystack(item);
  return /?????/.test(text) && /??|??|??|??/.test(text) && /??|??|??|???/.test(text);
}

function isInvestmentSummary(item = {}) {
  const text = summaryHaystack(item);
  return /????|????|???|???|???|??/.test(text) && /??|??|??|??|??|??|??|??/.test(text);
}

function isSettlementSupportSummary(item = {}) {
  const text = summaryHaystack(item);
  return /?????|1200%|???/.test(text) && /GA|?????|???|??/.test(text);
}

function isInsuranceLossSummary(item = {}) {
  const text = summaryHaystack(item);
  return /??|???|???|?? ??|??/.test(text) && /??|??|??|??/.test(text);
}

function periodScopeLabel(period) {
  return { daily: "??", weekly: "??", monthly: "??" }[period] || "??";
}

function buildPeriodObservations(data, issues = [], period = "monthly") {
  const summary = data.summary || {};
  const lead = issues[0];
  const topPress = data.pressInfluence?.[0];
  const scope = periodScopeLabel(period);
  const observations = [];
  if (summary.ownNegative > 0) {
    observations.push(`?? ?? ?? ${summary.ownNegative}?? ??? ${scope} ??? ?? ???? ?? ??????.`);
  } else if (summary.ownMentions > 0) {
    observations.push(`?? ?? ${summary.ownMentions}?? ?? ???? ?? ??? ?? ??? ?? ???? ?? ??? ???.`);
  } else {
    observations.push(`${scope} ?? ?? ?? ?? ??? ???? ???, ??? ?? ???? ??? ?????.`);
  }
  if (summary.caution > 0) {
    observations.push(`?? ?? ${summary.caution}?? ?? ??, ???, ??, GA ?? ???? ?????? ??? ?? ??? ??????.`);
  }
  if (lead?.title) {
    observations.push(`?? ????? "${lead.title}"??, ${scope} ?? ?? ???? ?? ???? ?? ??? ? ????.`);
  }
  if (topPress?.source) {
    observations.push(`${topPress.source} ??? ?? ?? ??? ?? ??? ?? ?? ??? ?? ???? ??? ?????.`);
  }
  return observations.slice(0, 4);
}

function buildToneTrend(articles) {
  const byDate = new Map();
  articles.forEach((article) => {
    const date = article.date || "???";
    if (!byDate.has(date)) byDate.set(date, { date: date.slice(5) || date, positive: 0, negative: 0, caution: 0, neutral: 0 });
    const bucket = byDate.get(date);
    if (article.tone === "??") bucket.positive += 1;
    else if (article.tone === "??") bucket.negative += 1;
    else if (article.tone === "??") bucket.caution += 1;
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
    if (article.tone === "??") bucket.positive += 1;
    else if (article.tone === "??") bucket.negative += 1;
    else if (article.tone === "??") bucket.caution += 1;
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
    buckets.set(index, { date: `${index + 1}?`, positive: 0, negative: 0, caution: 0, neutral: 0 });
  }
  dated.forEach((article) => {
    const time = new Date(`${article.date}T00:00:00+09:00`).getTime();
    if (Number.isNaN(time) || time < startTime || time > latestTime) return;
    const index = Math.min(4, Math.max(0, Math.floor((time - startTime) / (7 * 24 * 60 * 60 * 1000))));
    const bucket = buckets.get(index);
    if (article.tone === "??") bucket.positive += 1;
    else if (article.tone === "??") bucket.negative += 1;
    else if (article.tone === "??") bucket.caution += 1;
    else bucket.neutral += 1;
  });
  const rows = Array.from(buckets.values());
  const hasSignal = rows.some((row) => row.positive || row.negative || row.caution);
  return hasSignal ? rows : ensureTrendHasTone(fallback);
}

function ensureTrendHasTone(rows = []) {
  if (!rows.length) return [];
  const fallback = rows.length ? rows : [
    { date: "1?", positive: 5, caution: 1, negative: 0 },
    { date: "2?", positive: 7, caution: 2, negative: 1 },
    { date: "3?", positive: 4, caution: 1, negative: 0 },
    { date: "4?", positive: 8, caution: 2, negative: 0 },
    { date: "5?", positive: 6, caution: 1, negative: 0 },
  ];
  return rows.map((row, index) => ({
    date: row.date || `${index + 1}?`,
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
  const max = period === "daily" ? 5 : 9;
  const rows = articles.map((article) => ({
      tone: article.tone,
      category: article.category,
      source: article.source,
      title: article.title,
      summary: compactArticleSummary(article),
      summaryLines: buildArticleSummaryLines(article),
      publishedAt: article.time || article.date || "-",
      link: article.link,
    }));
  const fallbackRows = rows.length ? [] : issues;
  const seen = new Set();
  return [...rows, ...fallbackRows].filter((item) => {
    const key = item.title;
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
      negative: scoped.filter((article) => article.tone === "??").length,
      type: scoped[0]?.category || "??",
    };
  });
}

function isOfficialRegulatorSource(source) {
  return /?????|?????/.test(String(source || ""));
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
  status: "??",
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
  status: "??",
  owner: "",
  contactDate: "",
  beat: "",
  leadReporter: "",
  email: "",
  phone: "",
  memo: "",
};

const keywordCategories = [
  { id: "own", label: "??", rule: "???, ???, ????? ?? ??? ??? ?????." },
  { id: "competitor", label: "???/GA", rule: "??, GA, ???, ????? ??? ?? ?? ?? ??? ??? ???." },
  { id: "industry", label: "????", rule: "?? ??, ????, ??? ???? ?? ??? ?????." },
  { id: "regulation", label: "??/??", rule: "????, ???, ??, ?? ??? ?? ??? ?????." },
  { id: "other", label: "??", rule: "?? ?? ???? ?? ?? ?? ?????." },
  { id: "exclude", label: "?? ??", rule: "?????, ???, ??? ???? ?? ?? ??? ?????." },
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
    status: String(row.status || "??").trim() || "??",
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
    row.beat ? `?? ??: ${row.beat}` : "",
    row.leadReporter ? `?? ??: ${row.leadReporter}` : "",
    row.email ? `???: ${row.email}` : "",
    row.phone ? `??: ${row.phone}` : "",
    row.url ? `?? URL: ${row.url}` : "",
    row.memo ? `??: ${row.memo}` : "",
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
        status: "??",
        owner: "",
        contactDate: "",
        memo: `?? ??: ${alias.host}`,
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
    status: String(row.status || "??").trim() || "??",
    contactDate: row.contactDate || row.contact_date || row.date || "",
    email: String(row.email || "").trim(),
    phone: String(row.phone || "").trim(),
    request: String(row.request || "").trim(),
    memo: String(row.memo || "").trim(),
  };
}

function buildReporterMemo(row = {}) {
  const lines = [
    row.beat ? `?? ??: ${row.beat}` : "",
    row.email ? `???: ${row.email}` : "",
    row.phone ? `??: ${row.phone}` : "",
    row.request ? `??/??: ${row.request}` : "",
    row.memo ? `??: ${row.memo}` : "",
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
    ??: "own",
    GA: "competitor",
    ???: "industry",
    "??/??": "regulation",
    "?? ??": "exclude",
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
  return keywordCategories.find((item) => item.id === category)?.label || "??";
}

function keywordCategoryRule(category) {
  return keywordCategories.find((item) => item.id === category)?.rule || "???? ??? ???? ?????.";
}

function keywordCategoryTone(category) {
  return {
    own: "??",
    competitor: "??",
    industry: "??",
    regulation: "??",
    exclude: "??",
  }[category] || "??";
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
  if (/????|???|????|??\s*???|??\s*??|??/.test(title)) {
    return {
      keyword: "???? ??",
      category: "regulation",
      action: "?? ??",
      label: "?? ??/???? ??? ??? ??",
    };
  }
  if (/?????|????|?????\s*??/.test(title)) {
    return {
      keyword: "?????",
      category: correctedTone === "??" ? "exclude" : "industry",
      action: correctedTone === "??" ? "?? ??" : "?? ??",
      label: "????? ??? ?? ?? ??",
    };
  }
  if (/??|??|??|???|??|??/.test(title) && correctedTone === "??") {
    return {
      keyword: "?? ???",
      category: "exclude",
      action: "?? ??",
      label: "???/??? ?? ??",
    };
  }
  if (correctedTone === "??" || correctedCategory === "??") {
    return {
      keyword: compactFeedbackKeyword(title),
      category: "exclude",
      action: "?? ??",
      label: "?? ??? ?? ??",
    };
  }
  if (correctedTone === "??" && /??|negative|high/.test(String(row.previousTone || "").toLowerCase())) {
    return {
      keyword: compactFeedbackKeyword(title),
      category: "regulation",
      action: "?? ??",
      label: "???? ??? ?? ??",
    };
  }
  if (correctedCategory && correctedCategory !== row.previousCategory) {
    return {
      keyword: compactFeedbackKeyword(title),
      category: categoryIdFromFeedbackLabel(correctedCategory),
      action: "?? ??",
      label: `${row.previousCategory || "??"} ? ${correctedCategory} ?? ??`,
    };
  }
  return {
    keyword: text.split(" ").filter((token) => token.length > 1)[0] || "",
    category: categoryIdFromFeedbackLabel(correctedCategory),
    action: "?? ??",
    label: "?? ?? ??",
  };
}

function compactFeedbackKeyword(title = "") {
  const tokens = articleTokens(title).filter((token) => !/??|??|??|??/.test(token));
  return tokens.slice(0, 2).join(" ") || String(title || "").slice(0, 16).trim();
}

function categoryIdFromFeedbackLabel(value = "") {
  const text = String(value || "").toLowerCase();
  if (/??|own|??/.test(value)) return "own";
  if (/ga|???|??|competitor/.test(text)) return "competitor";
  if (/??|??|??|regulation|policy/.test(value)) return "regulation";
  if (/??|??|industry|market/.test(value)) return "industry";
  if (/??|exclude|noise/.test(value)) return "exclude";
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
    const name = row[key] || "???";
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
    <title>??? ?? ???</title>
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
          <h1>??? ?? ???</h1>
        </div>
        <div class="meta">
          <span>?? ${escapeHtml(generated)}</span>
          <span>?? ${rows.length.toLocaleString("ko-KR")}?</span>
        </div>
      </header>
      <div class="kpis">
        <div><span>? ???</span><b>${escapeHtml(formatMoney(total))}</b></div>
        <div><span>?? ??</span><b>${unique(rows.map((row) => row.month)).length.toLocaleString("ko-KR")}??</b></div>
        <div><span>?? ?</span><b>${unique(rows.map((row) => row.media)).length.toLocaleString("ko-KR")}?</b></div>
        <div><span>?? ?? ??</span><b>${escapeHtml(topMedia)}</b></div>
      </div>
      <div class="grid">
        <section><h2>?? ?? ??</h2><div class="bars">${adReportBars(data.monthly, total)}</div></section>
        <section><h2>??? ??</h2><div class="bars">${adReportBars(data.media, total)}</div></section>
        <section><h2>??? ??</h2><div class="bars">${adReportBars(data.type, total)}</div></section>
        <section class="table-card">
          <h2>?? ??</h2>
          <table>
            <thead><tr><th>?</th><th>??</th><th>??</th><th>??</th><th>??</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="5">??? ??? ?? ??? ????.</td></tr>'}</tbody>
          </table>
        </section>
      </div>
    </main>
  </body>
  </html>`;
}

function adReportBars(rows = [], total = 0) {
  if (!rows.length) return '<p>??? ??</p>';
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
        status: index % 5 === 0 ? "??" : "??",
        owner: index < 6 ? "???" : "",
        contactDate: index < 8 ? "2026-05" : "",
        memo: index < 15 ? "???? ?? ?? ??" : "",
        ...(pressStats.get(name) || { total: 0, own: 0, negative: 0 }),
      }));
  const media = mergeRequiredOwnPressRows(baseMedia, ownPressRows);
  const reporters = operations.reporters?.length ? operations.reporters : journalistRows;
  const ads = operations.ads?.length ? operations.ads : adRows;
  return { media, reporters, ads };
}

function buildPressStatsForManagement(articles = []) {
  const pressArticles = articles.filter((article) => !isOfficialRegulatorSource(article.source) && !isPortalSource(article.source));
  return groupArticles(pressArticles, "source").map(([source, total]) => {
    const scoped = pressArticles.filter((article) => article.source === source);
    return {
      source,
      total,
      own: scoped.filter(isOwnArticle).length,
      negative: scoped.filter((article) => article.tone === "??").length,
      type: scoped[0]?.category || "??",
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
    status: "??",
    owner: "",
    contactDate: "",
    memo: "?? ?? ?? ???? ?? ??? ?? ??",
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
      label: "?????",
      note: "??, ??, ?? ??, ??? ???? ??? ?? ??? ?????.",
      action: "??, ??, ??, ??? ?? ??? ?? ??? ?? ?? ????? ??? ??? ?????.",
      pattern: /???|??|??|??|???|??|??|??|??|???|?????|??/i,
    },
    {
      label: "????/GA",
      note: "GA, ???, ???, ?????, ???? ? ?? ??? ??? ?? ?????.",
      action: "GA, ???, ???, ?????, ???? ??? ?? ?? ?? ??? ????? ?????.",
      pattern: /GA|???????|???|???|??|???|?????|????|??|??|??|??/i,
    },
    {
      label: "???/??",
      note: "????, ??, ????, ?????? ????? ?? ?????.",
      action: "???, ????, ??, ????, ???? ??? ?? ??? ??? ???? ???? ???.",
      pattern: /????|??|????|????|???|???|??|???|??|???/i,
    },
    {
      label: "?????",
      note: "??, ??, ????, ???? ? ??? ?? ??? ???? ?????.",
      action: "??, ??, ????, ??, ?? ???? ?? ??? ??? ??? ??? ?????.",
      pattern: /??|??|????|??|?????|????|?? ??|??|??|???|??|??/i,
    },
    {
      label: "???/??",
      note: "?????, ??, ??, AI, ????? ?????? ?? ???? ?????.",
      action: "????, ????, AI, ??? ?? ??? ?? ??? ??? ?? ?? ?? ??? ?????.",
      pattern: /???|??|??|AI|?????|???|??|????|??|????/i,
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
    ? `${top.label} ??? ?? ??? ?? ??? ????`
    : "??? ????? ????";
  const summary = rows.length
    ? `${rows.length.toLocaleString("ko-KR")}? ???? ${top.label}${second ? `? ${second.label}` : ""} ??? ?? ?????. ?? ?? "${normalizeRegulatorDisplayTitle(latest?.title)}"? ?? ??, ?? ???, ?? ?? ??? ??? ???? ?? ????.`
    : "????? ???? ?? ?? ???? ?? ???? ?????.";
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
    value: theme.count > 0 ? "?? ??" : "?? ??",
    detail: theme.action || theme.note,
  }));
  while (cards.length < 3) {
    cards.push({
      label: "?? ??",
      value: "??",
      detail: "??? ????? ???? ???, ?? ??, ?? ??? ???? ?? ??? ?????.",
    });
  }
  return cards;
}

function buildRegulatorWatchItems(rows = [], themes = []) {
  if (!rows.length) return ["????? ???? ?? ??, ?? ??, ?? ?? ???? ?????."];
  const top = themes.find((theme) => theme.count > 0);
  const latest = [...rows].sort((a, b) => articleTimeValue(b) - articleTimeValue(a))[0];
  const items = [];
  if (top) items.push(top.action);
  if (themes.find((theme) => theme.label === "????/GA" && theme.count > 0)) {
    items.push("GA???? ?? ??? ?? ??, ????, ????????? ?? ??? ??? ???.");
  }
  if (themes.find((theme) => theme.label === "?????" && theme.count > 0)) {
    items.push("????? ??? ??, ?????, ??? ?? ?? ??? ??? ??? ??? ?????.");
  }
  if (latest?.title) {
    items.push(`?? ?? "${normalizeRegulatorDisplayTitle(latest.title)}"? ???? ?? ?? ??? ?????.`);
  }
  return unique(items).slice(0, 4);
}

function selectRegulatorRows(articles = []) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const source = String(article.source || "");
      const link = String(article.link || article.url || "");
      return /?????|?????/.test(source) || /fss\.or\.kr|fsc\.go\.kr/.test(link);
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
    .replace(/\s+-\s+??(?:???|???).*$/g, "")
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
          ? `${sources.slice(0, 5).join(" ? ")}${sources.length > 5 ? ` ? ${sources.length - 5}?` : ""}`
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
    (text.includes("???") || text.includes("?????")) &&
    (text.includes("8? ????") || text.includes("8? ??") || text.includes("????")) &&
    (text.includes("?????") || text.includes("??? ??") || text.includes("????"))
  ) {
    return "???-????-?????";
  }
  if (includesAll(["??els", "??"])) return "??els-??";
  if (includesAll(["??", "????"])) return "??-????";
  if (includesAll(["??", "????"])) return "??-????";
  if (includesAll(["?????", "????"]) && (text.includes("???") || text.includes("?????"))) return "???-?????-??";
  return "";
}

function normalizeGroupTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]|\([^)]*\)|<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(??|??|??|??|??|???|??|??)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleTokens(value) {
  const stop = new Set(["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "???"]);
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
  const toneOrder = { ??: 4, ??: 3, ??: 2, ??: 1, ??: 0 };
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
    const value = article[key] || "???";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function isUsableArticle(article) {
  return article && article.tone !== "??" && article.category !== "??" && !isStockListingNoiseArticle(article);
}

function isOwnArticle(article) {
  if (isStockListingNoiseArticle(article)) return false;
  return article.category === "??" || /????|???????/i.test(`${article.title} ${article.keyword} ${article.summary}`);
}

function isStockListingNoiseArticle(article = {}) {
  const title = String(article.title || "");
  const sourceLink = `${article.source || ""} ${article.link || ""}`.toLowerCase();
  const text = `${title} ${sourceLink} ${article.summary || ""} ${article.description || ""} ${article.keyword || ""}`;
  const stockListingTitle = /(?:\[?52?\]?\s*)?(?:???|???)|??\s*(?:???|???)|??\s*??|??\s*??|???|??\s*??\s*\[??\]|\[???\]|MVP\s*??|??\s*\d+\s*?/.test(title);
  const isItoozaListing = sourceLink.includes("itooza") && /52?|???|???|MVP|???|??\s*\d+\s*?/.test(title);
  if (!stockListingTitle && !isItoozaListing) {
    return false;
  }
  if (/???????|????/.test(title) && /????|????|???|???|???|?????/.test(text)) {
    return false;
  }
  return true;
}

function categoryPresetFor(value) {
  if (/GA/i.test(value)) return "GA";
  if (/???|??/i.test(value)) return "???";
  if (/??|??/i.test(value)) return "??";
  if (/??|??/i.test(value)) return "??/??";
  if (/??|???/i.test(value)) return "??";
  return value;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}??`;
  if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString("ko-KR")}??`;
  return `${amount.toLocaleString("ko-KR")}?`;
}

function composeRealtimeData(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  const realtimeArticles = filterRowsByPeriod(articles, "daily");
  if (!realtimeArticles.length) {
    return buildDisconnectedPeriodData(base, "?? ???? ??? ?? ??? ????.");
  }
  return {
    ...composePeriodData(base, realtimeArticles, [], true),
    label: "???",
    scope: realtimeArticles[0]?.date ? `${realtimeArticles[0].date} ?? ??` : "?? ??",
  };
}

createRoot(document.getElementById("root")).render(<App />);
