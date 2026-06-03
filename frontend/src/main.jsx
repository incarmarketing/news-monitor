import React, { useEffect, useMemo, useState } from "react";
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
  Filter,
  Gauge,
  LayoutDashboard,
  LineChart,
  LogIn,
  Megaphone,
  Newspaper,
  Radar,
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
  saveMonitorKeyword,
  savePressAlias,
  saveReporterProfile,
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

  const refreshOperations = async () => {
    setOperations((current) => ({ ...current, status: "loading", message: "?? ?? ?" }));
    setOperations(await loadOperationalData());
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
    () => composeManagementData(operations, scopedArticles),
    [operations, scopedArticles],
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
    setMonitoringPreset({ ...preset, stamp: Date.now() });
    setActiveSection("monitoring");
  };

  const View = {
    overview: Overview,
    monitoring: Monitoring,
    regulators: Regulators,
    media: MediaAnalysis,
    scraps: Scraps,
    risk: RiskCenter,
    reports: Reports,
    management: Management,
  }[activeSection] || Overview;

  return (
    <div className="app-shell">
      <Header />
      <aside className="side-nav" aria-label="?? ??">
        <div className="side-title">Menu</div>
        {navItems.map((item) => {
          const Icon = navIcons[item.id] || FileText;
          return (
            <button
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
        articles={activeSection === "monitoring" ? allArticles : activeSection === "overview" ? realtimeArticles : scopedArticles}
        allArticles={allArticles}
        scraps={scraps}
        jobs={jobs}
        notifications={notifications}
        management={management}
        operations={operations}
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

function Header() {
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
      <div className="user-chip">
        <span>{userText}</span>
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

function Overview({ data, articles, jobs, notifications, setActiveSection, onOpenMonitoring }) {
  const { summary } = data;
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${data.label} ? ${data.scope}`}
        title="??? ????"
        description="?? ??? ?? ?? ??, ?? ???, ???, ??? ?? ??? 5? ??? ?????."
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
            <PressInfluence rows={data.pressInfluence} />
          </Panel>
        </div>
        <div className="side-column">
          <WatchPanel jobs={jobs} risk={summary.risk} />
          <Panel title="??? ?? ??" icon={Bell} meta="???">
            <NotificationList rows={notifications.slice(0, 5)} />
          </Panel>
          <Panel title="??? ???" icon={CalendarDays} meta="???">
            <JobRows rows={jobs} />
          </Panel>
        </div>
      </section>

    </main>
  );
}

function Monitoring({ data, articles, monitoringPreset }) {
  const latestDate = useMemo(() => latestArticleDate(articles), [articles]);
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

  const sources = useMemo(() => unique(articles.map((article) => article.source)).slice(0, 80), [articles]);
  const categories = useMemo(() => unique(articles.map((article) => article.category)).slice(0, 40), [articles]);
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
    setVisible(30);
  }, [monitoringPreset]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((article) => {
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
  }, [articles, category, endDate, query, source, startDate, tone]);
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

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Live Monitoring"
        title="??? ????"
        description="?? ??? ?? 5?? ??? ??, ?? ??? ?? ?? ??? ??? ?? ?? ???."
        right={<button className="primary-button"><Download />CSV ??</button>}
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
          <Search />??
        </button>
        <label className="tone-filter">
          <span>??</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">??</option>
            <option value="??">??</option>
            <option value="??">??</option>
            <option value="??">??</option>
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
          <Search />??
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
          <Filter />???
        </button>
      </section>
      <section className="monitoring-layout">
        <Panel title="?? ?? ??" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed rows={visibleRows.slice(0, visible)} />
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

function Regulators({ articles = [] }) {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const regulatorRows = useMemo(() => selectRegulatorRows(articles), [articles]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return regulatorRows;
    return regulatorRows.filter((article) => {
      const text = `${article.title || ""} ${article.source || ""} ${article.summary || ""}`.toLowerCase();
      return text.includes(needle);
    });
  }, [query, regulatorRows]);

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Official Releases"
        title="???? ????"
        description="??????????? ????? ?? ?? ???? ?? ??/?? ??? ??? ?????."
        right={(
          <div className="page-actions regulator-search">
            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setQuery(queryInput);
              }}
              placeholder="????? ??"
            />
            <button className="primary-button filter-action" onClick={() => setQuery(queryInput)}>
              <Search />??
            </button>
          </div>
        )}
      />
      <Panel title="???? ??" icon={FileText} meta={`${filteredRows.length.toLocaleString("ko-KR")}?`}>
        <ArticleFeed rows={filteredRows} />
      </Panel>
    </main>
  );
}

function MediaAnalysis({ data, period, setPeriod, allArticles, scraps, onOpenMonitoring, operations }) {
  const monthlyArticles = useMemo(() => lastNDays(allArticles || [], 31), [allArticles]);
  const analysisArticles = monthlyArticles.length ? monthlyArticles : allArticles || [];
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const dailyTrend = useMemo(
    () => buildDailyToneTrend(analysisArticles, 31, data.toneTrend),
    [analysisArticles, data.toneTrend],
  );
  const keywordRows = useMemo(
    () => buildKeywordFlow(analysisArticles, selectedKeywords),
    [analysisArticles, selectedKeywords],
  );
  const issueRows = buildIssues(analysisArticles, data.issues).slice(0, 6);
  const observations = buildMonthlyObservations(data, issueRows);
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="?? 1?? ??"
        title="??? ?? ???"
        description="?? ???????? ??, ??? ???, ???? ???, ?? ?? ??? ?? ???."
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
      <section className="content-grid two">
        <Panel title="?? ?? ??" icon={Activity} meta="?? 31? ? ??/??/??">
          <ToneTrend rows={dailyTrend} />
        </Panel>
        <Panel title="??? ???" icon={Building2} meta="?? ?? ?? ??">
          <PressInfluence rows={data.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
        </Panel>
        <Panel title="???? ???" icon={LineChart} meta="?? ??? 10?">
          <CategoryChart rows={keywordRows} tall onOpenMonitoring={onOpenMonitoring} drillBy="keyword" labelWidth={132} />
        </Panel>
        <Panel title="?? ?? ??" icon={Newspaper} meta={`${issueRows.length}?`}>
          <MonthlyIssueDigest issues={issueRows} />
        </Panel>
        <Panel title="?? ?? ???" icon={Gauge} meta="?? ?? ??">
          <InsightList insights={observations} />
        </Panel>
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

function Reports({ data, period, setPeriod, articles, scraps, onOpenMonitoring }) {
  const { summary } = data;
  const edition = publicationMeta(period, data);
  const reportArticles = articles || [];
  const expandedIssues = expandReportIssues(data.issues, reportArticles, period);
  const lead = buildReportLead(period, data, reportArticles, expandedIssues);
  const secondary = expandedIssues.slice(1, period === "daily" ? 4 : 8);
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
            <PressInfluence rows={data.pressInfluence} compact />
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
  const topCategories = groupArticles(articles, "category").slice(0, 2).map(([name]) => name).join("?") || "?? ??";
  const riskText = data.summary.ownNegative > 0
    ? `?? ?? ${data.summary.ownNegative}?? ?? ?? ???? ????`
    : "?? ?? ??? ?????";
  const cadence = period === "weekly" ? "?? ?" : "?? ?";
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
  const [aliasUrl, setAliasUrl] = useState("");
  const [pressName, setPressName] = useState("");
  const [aliasStatus, setAliasStatus] = useState("");
  const [localAliases, setLocalAliases] = useState(() => readLocalRows(PRESS_ALIAS_DRAFT_KEY));
  const aliasRows = useMemo(() => mergeAliasRows(aliases, localAliases), [aliases, localAliases]);
  const managedRows = useMemo(() => mergeMediaRows(rows, aliasRows), [rows, aliasRows]);
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return managedRows;
    return managedRows.filter((row) => {
      const domains = domainsForPressName(row.name, aliasRows).join(" ");
      return `${row.name} ${row.grade} ${row.status} ${row.owner} ${row.memo} ${domains}`.toLowerCase().includes(term);
    });
  }, [managedRows, query, aliasRows]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, 15);

  const handleUrlChange = (value) => {
    setAliasUrl(value);
    const mapped = resolvePressNameFromUrl(value, aliasRows, rows);
    if (mapped) {
      setPressName(mapped);
      setAliasStatus(`${canonicalHost(value)} -> ${mapped}`);
    } else if (value.trim()) {
      setAliasStatus("?? ??? ?? ?????. ????? ?? ?????.");
    } else {
      setAliasStatus("");
    }
  };

  const handleSaveAlias = async () => {
    const host = canonicalHost(aliasUrl);
    const cleanName = pressName.trim();
    if (!host || !cleanName) {
      setAliasStatus("URL/???? ????? ?? ???? ???.");
      return;
    }
    const nextAliases = upsertAliasRow(localAliases, { host, press_name: cleanName });
    setLocalAliases(nextAliases);
    writeLocalRows(PRESS_ALIAS_DRAFT_KEY, nextAliases);
    try {
      await savePressAlias(host, cleanName);
      setAliasStatus("Supabase ?? ??");
    } catch {
      setAliasStatus("?? ?? ?? ?? ? ?? ?? ?? ? DB ??");
    }
  };

  return (
    <Panel title="??? ??" icon={Building2} meta={`${managedRows.length.toLocaleString("ko-KR")}?`}>
      <div className="operation-form media-alias-form">
        <label>
          <span>??? URL/???</span>
          <input
            value={aliasUrl}
            onChange={(event) => handleUrlChange(event.target.value)}
            placeholder="https://www.mk.co.kr/news/..."
          />
        </label>
        <label>
          <span>?? ????</span>
          <input
            value={pressName}
            onChange={(event) => setPressName(event.target.value)}
            placeholder="????"
          />
        </label>
        <div className="operation-form-actions">
          <button className="ghost-button" onClick={() => handleUrlChange(aliasUrl)}>?? ??</button>
          <button className="primary-button" onClick={handleSaveAlias}>?? ??</button>
        </div>
        {aliasStatus && <p className="status-note">{aliasStatus}</p>}
      </div>
      <div className="management-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="????, ???, ?? ??" />
        <button className="ghost-button">?? ??</button>
        <button className="primary-button">??? ??</button>
      </div>
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
      status: row.status || "??",
      contactDate: row.contactDate || row.date || "",
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
      const saved = await saveReporterProfile(item);
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
          <select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
            {["??", "??", "??", "??"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>?? ???</span>
          <input type="date" value={form.contactDate} onChange={(event) => updateForm("contactDate", event.target.value)} />
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
          <span>{lead.source} ? {lead.publishedAt}</span>
        </div>
        <span className="monthly-issue-kicker">Headline</span>
        <h3>{lead.title}</h3>
        <ArticleSummaryBlock item={lead} />
        {lead.link && lead.link !== "#" && (
          <a className="article-link-button" href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
            <ExternalLink />?? ??
          </a>
        )}
      </article>
      <div className="monthly-issue-list">
        {rest.slice(0, 3).map((issue) => (
          <article key={`${issue.source}-${issue.title}`}>
            <div>
              <span>{issue.source} ? {issue.publishedAt}</span>
              <h4>{issue.title}</h4>
              <ArticleSummaryBlock item={issue} dense />
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
            <span>{issue.source} ? {issue.publishedAt}</span>
          </div>
          <h3>{issue.title}</h3>
          <ArticleSummaryBlock item={issue} />
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

function ArticleSummaryBlock({ item, dense = false }) {
  const lines = buildArticleSummaryLines(item).slice(0, dense ? 3 : 4);
  if (!lines.length) return null;
  return (
    <ul className={dense ? "summary-lines dense" : "summary-lines"}>
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function ArticleFeed({ rows, compact = false }) {
  return (
    <div className={compact ? "feed-table compact" : "feed-table"}>
      {rows.map((row) => {
        const related = Array.isArray(row.relatedArticles) ? row.relatedArticles : [];
        const hasRelated = related.length > 1;
        return (
          <article key={`${row.id || row.link || row.title}-${row.time}`} className={hasRelated ? "feed-row related" : "feed-row"}>
            <time>{row.time || "-"}</time>
            <div className="feed-main">
              <div className="feed-title-line">
                <Chip tone={row.tone}>{row.tone}</Chip>
                <b>{row.title}</b>
                {hasRelated && <span className="related-badge">?? {related.length}?</span>}
              </div>
              <span>{row.source} ? {row.keyword || row.category} ? {row.date || row.slot || ""}</span>
              {hasRelated && <span className="related-sources">{row.relatedSources}</span>}
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
            </div>
            {!compact && row.link && row.link !== "#" && (
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
          </article>
        );
      })}
    </div>
  );
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

function NotificationList({ rows }) {
  return (
    <div className="notification-list">
      {rows.map((item) => (
        <button
          key={item.id || `${item.time}-${item.type}`}
          type="button"
          className={item.link ? "clickable" : ""}
          title={item.body || item.type}
          disabled={!item.link}
          onClick={(event) => item.link && openExternal(event, item.link)}
        >
          <b>{item.time}</b>
          <span>{item.type}</span>
          <Chip tone={item.status}>{item.status}</Chip>
        </button>
      ))}
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
  const max = Math.max(1, ...rows.map((item) => item.total));
  const visibleRows = compact ? rows.slice(0, 5) : rows;
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

function composeRealtimeData(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  if (!articles.length) {
    return buildDisconnectedPeriodData(base, "?? 24?? ?? ??? ?? ??? ????.");
  }
  return {
    ...composePeriodData(base, articles, [], true),
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
  const ownMentions = articles.filter(isOwnArticle).length;
  const ownNegative = articles.filter((article) => isOwnArticle(article) && article.tone === "??").length;
  const caution = articles.filter((article) => article.tone === "??").length;
  const gaInsurance = articles.filter((article) => ["GA", "???"].includes(article.category)).length;
  const headlineOwnMentions = ownMentions;
  const headlineOwnNegative = ownNegative;
  const headlineCaution = caution;
  const summary = {
    ...base.summary,
    collected: runSummary.collected ?? articles.length,
    analyzed: runSummary.analyzed ?? articles.filter((article) => article.tone !== "??").length,
    ownMentions: headlineOwnMentions,
    ownNegative: headlineOwnNegative,
    caution: headlineCaution,
    gaInsurance,
    risk: headlineOwnNegative >= 3 ? "HIGH" : headlineOwnNegative > 0 ? "MEDIUM" : "LOW",
    headline: buildHeadline(articles, headlineOwnMentions, headlineOwnNegative, headlineCaution),
    watchTime: articles[0]?.time || base.summary.watchTime,
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
    scope: articles[0]?.date ? `${articles[0].date} ??` : base.scope,
    issues: articles.length ? buildIssues(articles, base.issues) : [],
    categoryFlow: groupArticles(articles, "category").slice(0, 6).map(([name, value]) => ({ name, value })),
    toneTrend: buildToneTrend(articles),
    pressInfluence: buildPressInfluence(articles),
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
  const important = [
    ...articles.filter((article) => isOwnArticle(article)),
    ...articles.filter((article) => ["??", "??"].includes(article.tone)),
    ...articles,
  ];
  const uniqueIssues = [];
  for (const article of important) {
    if (uniqueIssues.some((item) => item.title === article.title)) continue;
    uniqueIssues.push({
      tone: article.tone,
      category: article.category,
      source: article.source,
      title: article.title,
      summary: compactArticleSummary(article),
      summaryLines: buildArticleSummaryLines(article),
      publishedAt: article.time || article.date || "-",
      link: article.link,
    });
    if (uniqueIssues.length >= 5) break;
  }
  return uniqueIssues.length ? uniqueIssues : fallback;
}

function buildArticleSummaryLines(item = {}) {
  if (Array.isArray(item.summaryLines) && item.summaryLines.length) {
    return item.summaryLines.map(cleanSummaryText).filter(Boolean);
  }
  const cleanTitle = cleanSummaryText(item.title || "");
  const text = cleanSummaryText(item.summary || item.description || "");
  const sentences = splitSummarySentences(text).filter((sentence) => sentence !== cleanTitle && !isGenericSummaryLine(sentence));
  const lead = sentences[0] || cleanTitle || `${item.source || "??"} ?? ?? ?? ?????.`;
  const context = buildSummaryContextLine(item);
  const toneLine = buildSummaryToneLine(item);
  return unique([lead, context, toneLine].filter(Boolean))
    .filter((line) => !isGenericSummaryLine(line))
    .slice(0, 3);
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
    .replace(/\s+/g, " ")
    .replace(/(\.\.\.|?)+$/g, "")
    .trim();
}

function splitSummarySentences(value) {
  const clean = cleanSummaryText(value);
  if (!clean) return [];
  return clean
    .split(/(?:[.!??]\s+|(?:?|?|?|?)\.\s+)/)
    .map((sentence) => sentence.replace(/(\.\.\.|?)+$/g, "").trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 3);
}

function isGenericSummaryLine(value) {
  const text = cleanSummaryText(value);
  return (
    /??? ???? ??? ?????/.test(text) ||
    /???? ??????/.test(text) ||
    /?? ??? ??????/.test(text)
  );
}

function buildSummaryContextLine(item = {}) {
  const category = item.category || item.keyword || "???";
  if (isOwnArticle(item)) return "?? ?? ?? ??? ???? ??? ?? ??? ?? ?????.";
  if (["GA", "???"].includes(category)) return "????GA ?? ??? ???? ?? ?? ??? ?????.";
  if (category === "??/??") return "????? ??? ?? ??? ?? ? ?? ??? ?????.";
  if (category === "??") return "?? ???? ??? ???? ?????.";
  return "";
}

function buildSummaryToneLine(item = {}) {
  if (item.tone === "??") return "??? ??, ??, ??, ?? ?? ? ?? ??? ??? ??? ??? ?????.";
  if (item.tone === "??") return "?? ??? ???? ?? ??, ?? ??, ??? ??? ?? ?????.";
  if (item.tone === "??") return "?? ??? ?? ??? ?? ?? ?? ???? ??? ? ????.";
  return "";
}

function buildMonthlyObservations(data, issues = []) {
  const summary = data.summary || {};
  const lead = issues[0];
  const topPress = data.pressInfluence?.[0];
  const observations = [];
  if (summary.ownNegative > 0) {
    observations.push(`?? ?? ?? ${summary.ownNegative}?? ??? ?? ??? ?? ???? ?? ??????.`);
  } else if (summary.ownMentions > 0) {
    observations.push(`?? ?? ${summary.ownMentions}?? ?? ???? ?? ??? ?? ??? ?? ???? ?? ??? ???.`);
  } else {
    observations.push("?? 1?? ?? ?? ?? ?? ??? ???? ???, ??? ?? ???? ??? ?????.");
  }
  if (summary.caution > 0) {
    observations.push(`?? ?? ${summary.caution}?? ?? ??, ???, ??, GA ?? ???? ?????? ??? ?? ??? ??????.`);
  }
  if (lead?.title) {
    observations.push(`?? ????? "${lead.title}"??, ?? ?? ?? ???? ?? ???? ?? ??? ? ????.`);
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
  const rows = [...issues];
  articles.forEach((article) => {
    rows.push({
      tone: article.tone,
      category: article.category,
      source: article.source,
      title: article.title,
      summary: compactArticleSummary(article),
      summaryLines: buildArticleSummaryLines(article),
      publishedAt: article.time || article.date || "-",
      link: article.link,
    });
  });
  const seen = new Set();
  return rows.filter((item) => {
    const key = item.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, max);
}

function buildPressInfluence(articles) {
  return groupArticles(articles, "source").slice(0, 10).map(([source, total]) => {
    const scoped = articles.filter((article) => article.source === source);
    return {
      source,
      total,
      own: scoped.filter(isOwnArticle).length,
      negative: scoped.filter((article) => article.tone === "??").length,
      type: scoped[0]?.category || "??",
    };
  });
}

const PRESS_ALIAS_DRAFT_KEY = "news_monitor_press_alias_drafts_v1";
const KEYWORD_DRAFT_KEY = "news_monitor_keyword_drafts_v1";
const REPORTER_DRAFT_KEY = "news_monitor_reporter_drafts_v1";

const emptyReporterForm = {
  id: "",
  name: "",
  media: "",
  status: "??",
  contactDate: "",
  memo: "",
};

const pressHostFallbacks = {
  "asiatoday.co.kr": "??????",
  "biz.chosun.com": "????",
  "bohumnews.com": "????",
  "dailyan.co.kr": "????",
  "dt.co.kr": "??????",
  "edaily.co.kr": "????",
  "fnnews.com": "??????",
  "fins.co.kr": "????",
  "hankyung.com": "????",
  "insjournal.co.kr": "????",
  "joongangenews.com": "????????",
  "mk.co.kr": "????",
  "mt.co.kr": "?????",
  "news1.kr": "??1",
  "sedaily.com": "????",
  "thebell.co.kr": "??",
  "weekly.chosun.com": "????",
  "yna.co.kr": "????",
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

function upsertAliasRow(rows, row) {
  const normalized = normalizeAliasRow(row);
  if (!normalized) return rows;
  const map = new Map(rows.map((item) => [canonicalHost(item.host), item]));
  map.set(normalized.host, { host: normalized.host, press_name: normalized.pressName });
  return Array.from(map.values());
}

function hostMatchesAlias(aliasHost, host) {
  return host === aliasHost || host.endsWith(`.${aliasHost}`);
}

function resolvePressNameFromUrl(value, aliases = [], mediaRows = []) {
  const host = canonicalHost(value);
  if (!host) return "";
  const alias = aliases.find((row) => hostMatchesAlias(row.host, host));
  if (alias?.pressName) return alias.pressName;
  const fallback = Object.entries(pressHostFallbacks).find(([knownHost]) => hostMatchesAlias(knownHost, host));
  if (fallback) return fallback[1];
  const existing = mediaRows.find((row) => normalizeKeywordText(row.name) && host.includes(normalizeKeywordText(row.name)));
  return existing?.name || "";
}

function domainsForPressName(pressName, aliases = []) {
  const clean = String(pressName || "").trim();
  return unique(aliases.filter((row) => row.pressName === clean).map((row) => row.host));
}

function mergeMediaRows(rows = [], aliases = []) {
  const map = new Map(rows.map((row) => [row.name, row]));
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
  return Array.from(map.values());
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
    memo: String(row.memo || "").trim(),
  };
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
  const pressStats = new Map(buildPressInfluence(articles).map((row) => [row.source, row]));
  const media = operations.mediaRelations?.length
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
  const reporters = operations.reporters?.length ? operations.reporters : journalistRows;
  const ads = operations.ads?.length ? operations.ads : adRows;
  return { media, reporters, ads };
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

function selectRegulatorRows(articles = []) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const text = `${article.source || ""} ${article.category || ""} ${article.keyword || ""} ${article.title || ""}`;
      return /?????|?????|????|??\/??/.test(text);
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
  const tokens = articleTokens(`${canonical} ${article.keyword || ""}`);
  return {
    canonical,
    tokens,
    tokenSet: new Set(tokens),
  };
}

function mergeGroupSeed(current, next) {
  const tokens = unique([...(current.tokens || []), ...(next.tokens || [])]);
  return {
    canonical: current.canonical.length >= next.canonical.length ? current.canonical : next.canonical,
    tokens,
    tokenSet: new Set(tokens),
  };
}

function areRelatedArticleSeeds(a, b) {
  if (!a.canonical || !b.canonical) return false;
  const shorter = a.canonical.length < b.canonical.length ? a.canonical : b.canonical;
  const longer = a.canonical.length < b.canonical.length ? b.canonical : a.canonical;
  if (shorter.length >= 22 && longer.includes(shorter)) return true;
  if (a.canonical.slice(0, 28) === b.canonical.slice(0, 28)) return true;
  const overlap = tokenOverlapRatio(a.tokenSet, b.tokenSet);
  return overlap >= 0.62 || (overlap >= 0.48 && sharedLongToken(a.tokens, b.tokens));
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
  const stop = new Set(["??", "??", "??", "??", "??", "??", "??", "??", "??", "??"]);
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

function isOwnArticle(article) {
  return article.category === "??" || /????|???????/i.test(`${article.title} ${article.keyword} ${article.summary}`);
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

createRoot(document.getElementById("root")).render(<App />);
