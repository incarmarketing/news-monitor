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
  Legend,
  LabelList,
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
  analyzeRegulatorReleases,
  deleteArticleScrap,
  deleteReporterProfile,
  generateRiskResponse,
  loadOperationalData,
  saveArticleScrap,
  saveMonitorKeyword,
  savePressAlias,
  saveReporterProfile,
  triggerDashboardRefresh,
  triggerRegulatorRefresh,
  verifyDashboardLogin,
} from "./liveData";
import "./styles.css";

const navIcons = {
  overview: LayoutDashboard,
  monitoring: Search,
  regulators: ShieldCheck,
  media: LineChart,
  scraps: Bookmark,
  risk: ShieldCheck,
  reports: FileText,
  management: Settings,
};

const chartColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];
const toneSeries = [
  { key: "positive", label: "긍정", color: "#14805f" },
  { key: "neutral", label: "중립", color: "#475569" },
  { key: "caution", label: "주의", color: "#b45309" },
  { key: "negative", label: "부정", color: "#c92337" },
  { key: "excluded", label: "제외", color: "#94a3b8", strokeDasharray: "4 4" },
];

function App() {
  const [activeSection, setActiveSection] = useState("overview");
  const [period, setPeriod] = useState("daily");
  const [operations, setOperations] = useState({ status: "loading", message: "연결 확인 중", articles: [] });
  const [loginOpen, setLoginOpen] = useState(false);
  const [monitoringPreset, setMonitoringPreset] = useState(null);

  const refreshOperations = async () => {
    setOperations((current) => ({ ...current, status: "loading", message: "연결 확인 중" }));
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
          label: "부정기사 감시",
          cadence: "24시간 · 5분",
          latest: operations.watchRuns[0].latest,
          state: operations.watchRuns[0].state,
        },
        ...watchJobs.filter((job) => job.label !== "부정기사 감시"),
      ]
    : [];

  const openMonitoring = (preset = {}) => {
    setMonitoringPreset({ ...preset, stamp: Date.now() });
    setActiveSection("monitoring");
  };

  const toggleArticleScrap = async (article = {}) => {
    const articleId = article.id || article.article_hash || article.link || article.title;
    if (!articleId) return;
    const exists = (operations.scraps || []).some((item) => item.id === articleId || item.article_hash === articleId || item.link === article.link);
    try {
      if (exists) {
        await deleteArticleScrap(articleId);
        setOperations((current) => ({
          ...current,
          scraps: (current.scraps || []).filter((item) => item.id !== articleId && item.article_hash !== articleId && item.link !== article.link),
        }));
      } else {
        await saveArticleScrap(article);
        setOperations((current) => ({
          ...current,
          scraps: [
            { ...article, id: articleId, scrapedAt: formatKstDateKey(new Date()) },
            ...(current.scraps || []).filter((item) => item.id !== articleId && item.article_hash !== articleId && item.link !== article.link),
          ],
        }));
      }
      window.setTimeout(refreshOperations, 500);
    } catch (error) {
      window.alert(`스크랩 저장을 처리하지 못했습니다. ${error?.message || "운영 DB 연결을 확인해 주세요."}`);
    }
  };

  const View = {
    overview: Overview,
    monitoring: Monitoring,
    regulators: RegulatorReleases,
    media: MediaAnalysis,
    scraps: Scraps,
    risk: RiskCenter,
    reports: Reports,
    management: Management,
  }[activeSection];

  return (
    <div className="app-shell">
      <Header />
      <aside className="side-nav" aria-label="주요 메뉴">
        <div className="side-title">Menu</div>
        {navItems.map((item) => {
          const Icon = navIcons[item.id];
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
        articles={activeSection === "monitoring" || activeSection === "regulators" ? allArticles : activeSection === "overview" ? realtimeArticles : scopedArticles}
        allArticles={allArticles}
        scraps={scraps}
        onToggleScrap={toggleArticleScrap}
        jobs={jobs}
        notifications={notifications}
        management={management}
        operations={operations}
        setActiveSection={setActiveSection}
        monitoringPreset={monitoringPreset}
        onOpenMonitoring={openMonitoring}
        onRefreshOperations={refreshOperations}
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
      <div className="user-chip">
        <span>{userText}</span>
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

function Overview({ data, articles, jobs, notifications, setActiveSection, onOpenMonitoring, onRefreshOperations }) {
  const { summary } = data;
  const orderedNotifications = useMemo(() => orderNotificationHistory(notifications), [notifications]);
  const [refreshingIssues, setRefreshingIssues] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const refreshIssueFeed = async () => {
    if (refreshingIssues) return;
    setRefreshingIssues(true);
    setRefreshNotice("키워드 수집과 분석을 요청했습니다. 저장 완료 후 자동으로 다시 불러옵니다.");
    try {
      await triggerDashboardRefresh();
      await onRefreshOperations?.();
      window.setTimeout(() => onRefreshOperations?.(), 25000);
      window.setTimeout(() => onRefreshOperations?.(), 75000);
      setRefreshNotice("수집 작업이 시작됐습니다. GitHub Actions 처리 후 주요 이슈가 갱신됩니다.");
    } catch (error) {
      setRefreshNotice(`갱신 요청 실패: ${error?.message || "연결 확인 필요"}`);
    } finally {
      window.setTimeout(() => setRefreshingIssues(false), 1500);
    }
  };
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${data.label} · ${data.scope}`}
        title="실시간 대시보드"
        description="검색 키워드 기준 최신 이슈, 당사 리스크, 알림톡, 보고서 생성 상태를 5분 단위로 확인합니다."
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
          <Panel
            title="주요 이슈"
            icon={Newspaper}
            meta="키워드 기준 5분 갱신"
            actions={(
              <button className="panel-action-button" onClick={refreshIssueFeed} disabled={refreshingIssues}>
                <RefreshCw className={refreshingIssues ? "spin" : ""} />갱신
              </button>
            )}
          >
            <IssueList issues={data.issues} />
            {refreshNotice && <div className="panel-notice">{refreshNotice}</div>}
          </Panel>
        </div>
        <div className="middle-column">
          <Panel title="분류별 기사량" icon={LineChart} meta="최근 24시간">
            <CategoryChart rows={data.categoryFlow} />
          </Panel>
          <Panel title="언론사 영향도" icon={Building2} meta="최근 24시간">
            <PressInfluence rows={data.pressInfluence} />
          </Panel>
        </div>
        <div className="side-column">
          <WatchPanel jobs={jobs} risk={summary.risk} />
          <Panel title="알림톡 발송 이력" icon={Bell} meta={`${orderedNotifications.length}건`}>
            <NotificationHistory rows={orderedNotifications} />
          </Panel>
          <Panel title="보고서 자동화" icon={CalendarDays} meta="스케줄">
            <JobRows rows={jobs} />
          </Panel>
        </div>
      </section>

    </main>
  );
}

function Monitoring({ data, articles, monitoringPreset, scraps = [], onToggleScrap }) {
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [tone, setTone] = useState("all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [viewMode, setViewMode] = useState("latest");
  const [regulatorRelated, setRegulatorRelated] = useState(false);
  const [visible, setVisible] = useState(30);

  const sources = useMemo(() => unique(articles.map((article) => article.source)).slice(0, 80), [articles]);
  const categories = useMemo(() => unique(articles.map((article) => article.category)).slice(0, 40), [articles]);
  useEffect(() => {
    if (!monitoringPreset) return;
    setQuery(monitoringPreset.query || "");
    setQueryInput(monitoringPreset.query || "");
    setTone(monitoringPreset.tone || "all");
    setCategory(monitoringPreset.category || "all");
    setSource(monitoringPreset.source || "all");
    setRegulatorRelated(Boolean(monitoringPreset.regulatorRelated));
    setVisible(30);
  }, [monitoringPreset]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((article) => {
      const text = `${article.title} ${article.source} ${article.keyword} ${article.summary}`.toLowerCase();
      return (
        (!needle || text.includes(needle)) &&
        (!regulatorRelated || isRegulatorRelatedNewsArticle(article)) &&
        (tone === "all" || article.tone === tone) &&
        (category === "all" || article.category === category) &&
        (source === "all" || article.source === source)
      );
    }).sort((a, b) => articleTimeValue(b) - articleTimeValue(a));
  }, [articles, category, query, regulatorRelated, source, tone]);
  const grouped = useMemo(() => buildRelatedArticleGroups(filtered), [filtered]);
  const visibleRows = viewMode === "related" ? grouped : filtered;
  const feedMeta = viewMode === "related"
    ? `${filtered.length.toLocaleString("ko-KR")}건 · 묶음 ${grouped.length.toLocaleString("ko-KR")}개`
    : `${filtered.length.toLocaleString("ko-KR")}건`;

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Live Monitoring"
        title={regulatorRelated ? "금융당국 관련 기사" : "실시간 모니터링"}
        description={regulatorRelated
          ? "금감원·금융위 공식자료와 연결되는 보험·GA·설계사·수수료·감독 관련 기사만 모아봅니다."
          : "기사 목록을 샘플 5개로 줄이지 않고, 연결 가능한 운영 기사 전체를 필터와 함께 펼쳐 봅니다."}
        right={<button className="primary-button"><Download />CSV 출력</button>}
      />
      <section className="filter-card">
        <label>
          <span>시작 기준일</span>
          <input type="date" defaultValue="2026-05-31" />
        </label>
        <label>
          <span>종료 기준일</span>
          <input type="date" defaultValue="2026-05-31" />
        </label>
        <label className="tone-filter">
          <span>논조</span>
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="all">전체</option>
            <option value="부정">부정</option>
            <option value="주의">주의</option>
            <option value="긍정">긍정</option>
          </select>
        </label>
        <label className="sort-filter">
          <span>정렬</span>
          <select value={viewMode} onChange={(event) => { setViewMode(event.target.value); setVisible(30); }}>
            <option value="latest">최신순</option>
            <option value="related">묶음순</option>
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
          <Search />검색
        </button>
        <button className="ghost-button" onClick={() => {
          setQuery("");
          setQueryInput("");
          setTone("all");
          setCategory("all");
          setSource("all");
          setViewMode("latest");
          setRegulatorRelated(false);
        }}>
          <Filter />초기화
        </button>
      </section>
      <section className="monitoring-layout">
        <Panel title="수집 기사 피드" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed rows={visibleRows.slice(0, visible)} scraps={scraps} onToggleScrap={onToggleScrap} />
          {visibleRows.length > visible && (
            <button className="ghost-button full" onClick={() => setVisible((count) => count + 30)}>
              더보기
            </button>
          )}
        </Panel>
        <Panel title="문맥 기준" icon={ShieldCheck} meta="분류 규칙">
          <RuleStack />
        </Panel>
      </section>
    </main>
  );
}

function RegulatorReleases({ articles = [], onOpenMonitoring, onRefreshOperations, scraps = [], onToggleScrap }) {
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [analysisPrompt, setAnalysisPrompt] = useState("임원 보고용으로 핵심 판단, 당사 영향, 영업현장 영향, 후속 확인사항을 간결하게 정리해줘.");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [refreshingOfficial, setRefreshingOfficial] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const regulatorRows = useMemo(
    () => articles
      .filter(isRegulatorArticle)
      .filter((article) => source === "all" || article.source === source)
      .filter((article) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return `${article.title} ${article.summary} ${article.keyword}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => articleTimeValue(b) - articleTimeValue(a)),
    [articles, query, source],
  );
  const regulatorSources = unique(articles.filter(isRegulatorArticle).map((article) => article.source));
  const recentOfficial = regulatorRows.slice(0, 80);
  const ownRelated = regulatorRows.filter((article) => isOwnArticle(article));
  const policySignals = regulatorRows.filter((article) => ["주의", "부정"].includes(article.tone) || /검사|제재|승인|감독|규제|수수료|불완전판매|내부통제/.test(`${article.title} ${article.summary}`));
  const selectedArticles = useMemo(
    () => regulatorRows.filter((article) => selectedIds.has(scrapIdentity(article))),
    [regulatorRows, selectedIds],
  );

  const toggleSelectRelease = (article) => {
    const id = scrapIdentity(article);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const analyzeSelected = async () => {
    if (!selectedArticles.length) {
      setAnalysisError("분석할 보도자료를 먼저 선택해 주세요.");
      return;
    }
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisResult(null);
    try {
      const result = await analyzeRegulatorReleases(analysisPrompt, selectedArticles);
      setAnalysisResult(normalizeRegulatorAnalysis(result, selectedArticles, analysisPrompt));
    } catch (error) {
      setAnalysisResult(buildRegulatorFallbackAnalysis(selectedArticles, analysisPrompt));
      setAnalysisError(`Gemini 분석 호출이 실패해 규칙 기반 초안을 표시했습니다. (${error?.message || "연결 확인 필요"})`);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const refreshOfficialReleases = async () => {
    if (refreshingOfficial) return;
    setRefreshingOfficial(true);
    setRefreshNotice("금융당국 공식자료 수집을 요청했습니다. 저장 완료 후 자동으로 다시 불러옵니다.");
    try {
      await triggerRegulatorRefresh();
      await onRefreshOperations?.();
      window.setTimeout(() => onRefreshOperations?.(), 25000);
      window.setTimeout(() => onRefreshOperations?.(), 75000);
      setRefreshNotice("수집 작업이 시작됐습니다. GitHub Actions 처리 후 공식자료 목록이 갱신됩니다.");
    } catch (error) {
      setRefreshNotice(`갱신 요청 실패: ${error?.message || "연결 확인 필요"}`);
    } finally {
      window.setTimeout(() => setRefreshingOfficial(false), 1500);
    }
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Official Regulator Releases"
        title="금융당국 보도자료"
        description="금융감독원·금융위원회 공식 보도자료 중 보험, GA, 설계사, 판매수수료, 감독 이슈와 연결되는 항목을 운영 DB에 누적 보관합니다."
        right={(
          <div className="page-actions regulator-page-actions">
            <button className="panel-action-button" onClick={refreshOfficialReleases} disabled={refreshingOfficial}>
              <RefreshCw className={refreshingOfficial ? "spin" : ""} />최신 보도자료 갱신
            </button>
            <button className="primary-button" onClick={() => onOpenMonitoring?.({ regulatorRelated: true })}>
              <Search />관련 기사 보기
            </button>
          </div>
        )}
      />
      <section className="regulator-summary-grid">
        <article>
          <span>공식자료</span>
          <b>{regulatorRows.length.toLocaleString("ko-KR")}건</b>
          <em>운영 DB 누적 기준</em>
        </article>
        <article>
          <span>감독/규제 신호</span>
          <b>{policySignals.length.toLocaleString("ko-KR")}건</b>
          <em>검사·제재·승인·수수료 문맥</em>
        </article>
        <article>
          <span>당사 연결</span>
          <b>{ownRelated.length.toLocaleString("ko-KR")}건</b>
          <em>인카 직접 언급 기준</em>
        </article>
      </section>
      <section className="filter-card regulator-filter">
        <label>
          <span>기관</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">전체</option>
            {regulatorSources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="wide-filter">
          <span>검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="보험, GA, 설계사, 수수료 등" />
        </label>
      </section>
      {refreshNotice && <div className="panel-notice regulator-refresh-notice">{refreshNotice}</div>}
      <section className="regulator-analysis-box">
        <div className="regulator-analysis-head">
          <div>
            <b>선택 자료 분석</b>
            <span>{selectedArticles.length}건 선택 · 근거 번호 기반 보고서 생성</span>
          </div>
          <div className="regulator-analysis-actions">
            <button className="ghost-button" onClick={() => setSelectedIds(new Set(recentOfficial.slice(0, 5).map(scrapIdentity)))}>
              상위 5건 선택
            </button>
            <button className="ghost-button" onClick={() => setSelectedIds(new Set())}>
              선택 해제
            </button>
            <button className="primary-button" onClick={analyzeSelected} disabled={analysisLoading || !selectedArticles.length}>
              <FileText />{analysisLoading ? "분석 중" : "선택 자료 분석"}
            </button>
          </div>
        </div>
        <textarea
          value={analysisPrompt}
          onChange={(event) => setAnalysisPrompt(event.target.value)}
          placeholder="분석 방향을 입력하세요. 예: 당사 영향 중심, 영업현장 영향, 임원 보고용"
        />
        {analysisError && <div className="analysis-warning">{analysisError}</div>}
        {analysisResult && <RegulatorAnalysisResult result={analysisResult} />}
      </section>
      <section className="regulator-layout">
        <Panel title="공식 보도자료 목록" icon={ShieldCheck} meta={`${recentOfficial.length.toLocaleString("ko-KR")}건 표시`}>
          {recentOfficial.length ? (
            <ArticleFeed
              rows={recentOfficial}
              scraps={scraps}
              onToggleScrap={onToggleScrap}
              selectable
              selectedIds={selectedIds}
              onToggleSelect={toggleSelectRelease}
            />
          ) : <div className="empty-state compact">아직 수집된 금융당국 공식자료가 없습니다. 다음 수집 실행 후 이 탭에 표시됩니다.</div>}
        </Panel>
        <Panel title="수집 기준" icon={FileText} meta="포털 기사와 분리">
          <div className="regulator-rule-list">
            <article>
              <b>금융감독원</b>
              <p>공식 보도자료 목록에서 보험검사, 보험사, GA, 설계사, 판매수수료 등 직접 문맥이 있는 자료만 통과합니다.</p>
            </article>
            <article>
              <b>금융위원회</b>
              <p>정책 발표 중 보험업권, 보험대리점, 금융소비자보호, 내부통제 관련 자료만 별도 정책 이슈로 보관합니다.</p>
            </article>
            <article>
              <b>일반 뉴스와 분리</b>
              <p>공식자료는 출처를 금융감독원/금융위원회로 고정해 언론사 보도량 집계와 섞이지 않게 관리합니다.</p>
            </article>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function RegulatorAnalysisResult({ result }) {
  const rows = [
    ["핵심 판단", result.keyJudgement],
    ["당사 영향", result.companyImpact],
    ["영업현장 영향", result.fieldImpact],
    ["리스크 수준", `${result.riskLevel} · ${result.riskReason}`],
    ["후속 확인사항", result.followUps],
  ];
  return (
    <div className="regulator-analysis-result">
      <div className={`analysis-risk-pill ${String(result.riskLevel || "LOW").toLowerCase()}`}>
        <span>Risk</span>
        <b>{result.riskLevel}</b>
      </div>
      <div className="regulator-analysis-summary">
        <b>보고용 5줄 요약</b>
        <ol>
          {result.executiveLines.map((line) => <li key={line}>{line}</li>)}
        </ol>
      </div>
      <div className="regulator-analysis-grid">
        {rows.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            {Array.isArray(value)
              ? <ul>{value.map((item) => <li key={item}>{item}</li>)}</ul>
              : <p>{value}</p>}
          </article>
        ))}
      </div>
      <div className="regulator-evidence-list">
        <b>근거 보도자료</b>
        {result.evidenceArticles.map((article) => (
          <a key={`${article.no}-${article.title}`} href={article.link || "#"} target="_blank" rel="noopener noreferrer" onClick={(event) => article.link ? openArticleLink(event, article.link) : undefined}>
            <span>[{article.no}] {article.press || "금융당국"}</span>
            <strong>{article.title}</strong>
            <em>{article.summary}</em>
          </a>
        ))}
      </div>
    </div>
  );
}

function normalizeRegulatorAnalysis(result = {}, articles = [], prompt = "") {
  const report = result?.report && typeof result.report === "object" ? result.report : result;
  const prepared = prepareRegulatorEvidence(articles);
  const riskLevel = normalizeRiskLevel(report?.riskLevel || inferRegulatorRisk(articles));
  const keyItems = reportItemsToLines(report?.keyFindings, 3);
  const riskItems = reportItemsToLines(report?.risks, 3);
  const opportunityItems = reportItemsToLines(report?.opportunities, 3);
  const followUps = normalizeRegulatorFollowUps(report?.followUps, articles);
  const summaryLines = splitRegulatorLines(report?.executiveSummary || result?.analysis, 5);
  const evidenceArticles = normalizeRegulatorEvidence(report?.evidenceArticles, prepared);
  const keyJudgement = pickRegulatorLine(
    keyItems,
    /핵심|판단|규제|감독|정책|보험|GA|설계사|수수료/,
    fallbackRegulatorJudgement(articles),
  );
  const companyImpact = pickRegulatorLine(
    [...keyItems, ...riskItems, ...opportunityItems],
    /당사|인카|GA|보험대리점|법인보험대리점|모집|수수료/,
    fallbackCompanyImpact(articles),
  );
  const fieldImpact = pickRegulatorLine(
    [...opportunityItems, ...riskItems, ...keyItems],
    /영업|현장|설계사|모집|내부통제|소비자|민원|수수료/,
    fallbackFieldImpact(articles),
  );
  const riskReason = pickRegulatorLine(
    riskItems,
    /리스크|주의|검사|제재|감독|민원|불완전|내부통제|수수료/,
    fallbackRiskReason(articles, riskLevel),
  );
  return {
    keyJudgement,
    companyImpact,
    fieldImpact,
    riskLevel,
    riskReason,
    followUps,
    executiveLines: normalizeExecutiveLines(summaryLines, {
      keyJudgement,
      companyImpact,
      fieldImpact,
      riskReason,
      followUps,
      prompt,
    }),
    evidenceArticles,
  };
}

function buildRegulatorFallbackAnalysis(articles = [], prompt = "") {
  const riskLevel = inferRegulatorRisk(articles);
  const keyJudgement = fallbackRegulatorJudgement(articles);
  const companyImpact = fallbackCompanyImpact(articles);
  const fieldImpact = fallbackFieldImpact(articles);
  const riskReason = fallbackRiskReason(articles, riskLevel);
  const followUps = normalizeRegulatorFollowUps([], articles);
  return {
    keyJudgement,
    companyImpact,
    fieldImpact,
    riskLevel,
    riskReason,
    followUps,
    executiveLines: normalizeExecutiveLines([], {
      keyJudgement,
      companyImpact,
      fieldImpact,
      riskReason,
      followUps,
      prompt,
    }),
    evidenceArticles: prepareRegulatorEvidence(articles).slice(0, 5),
  };
}

function prepareRegulatorEvidence(articles = []) {
  return articles.slice(0, 8).map((article, index) => ({
    no: index + 1,
    press: article.source || "금융당국",
    title: cleanSummaryText(article.title || "제목 없음"),
    summary: firstUsefulSummary(article),
    link: article.link || "#",
  }));
}

function normalizeRegulatorEvidence(rows, fallback = []) {
  const source = Array.isArray(rows) && rows.length ? rows : fallback;
  return source.slice(0, 6).map((article, index) => ({
    no: Number(article?.no) || index + 1,
    press: cleanSummaryText(article?.press || "금융당국"),
    title: cleanSummaryText(article?.title || fallback[index]?.title || "제목 없음"),
    summary: cleanSummaryText(article?.summary || fallback[index]?.summary || "요약 확인 필요"),
    link: article?.link || fallback[index]?.link || "#",
  }));
}

function firstUsefulSummary(article = {}) {
  const lines = buildArticleSummaryLines(article);
  const line = lines.find((item) => item && !/요약 없음|확인 필요/.test(item));
  return cleanSummaryText(line || article.summary || article.description || "핵심 문장 확인 필요");
}

function reportItemsToLines(items, limit = 3) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, limit)
    .map((item) => {
      const title = cleanSummaryText(item?.title || "");
      const body = cleanSummaryText(item?.body || "");
      const evidence = Array.isArray(item?.evidence) && item.evidence.length ? ` [${item.evidence.join(", ")}]` : "";
      return cleanSummaryText(`${title}${title && body ? ": " : ""}${body}${evidence}`);
    })
    .filter(Boolean);
}

function splitRegulatorLines(value, limit = 5) {
  const text = cleanSummaryText(value || "");
  if (!text) return [];
  return unique(
    text
      .replace(/\r/g, "\n")
      .split(/\n+|(?:^|\s)[-*]\s+/)
      .flatMap((line) => splitSummarySentences(line).length ? splitSummarySentences(line) : [line])
      .map((line) => cleanSummaryText(line.replace(/^\d+[.)]\s*/, "")))
      .filter((line) => line.length >= 8 && !/^리스크 레벨/i.test(line)),
  ).slice(0, limit);
}

function pickRegulatorLine(lines = [], pattern, fallback) {
  return lines.find((line) => pattern.test(line)) || lines[0] || fallback;
}

function normalizeExecutiveLines(lines = [], fallback = {}) {
  const candidates = [
    ...lines,
    fallback.keyJudgement,
    fallback.companyImpact,
    fallback.fieldImpact,
    fallback.riskReason,
    ...(fallback.followUps || []).slice(0, 2),
  ];
  return unique(candidates.map(cleanSummaryText).filter(Boolean))
    .map((line) => line.length > 140 ? `${line.slice(0, 139)}…` : line)
    .slice(0, 5);
}

function normalizeRegulatorFollowUps(items, articles = []) {
  const fromAi = Array.isArray(items) ? items.map(cleanSummaryText).filter(Boolean) : [];
  const fallback = [
    "당사 또는 GA 채널에 적용되는 조항, 시행시점, 감독 방향을 원문에서 확인",
    "설계사 모집, 수수료, 내부통제, 소비자보호 업무에 전달할 메시지 필요 여부 점검",
    "관련 뉴스 후속 보도와 금융당국 추가 설명자료를 다음 수집 때 재확인",
  ];
  if (articles.some((article) => /검사|제재|경영개선|불완전판매|민원/.test(`${article.title} ${article.summary}`))) {
    fallback.unshift("검사·제재성 표현이 실제 당사 영향인지, 업계 공통 이슈인지 분리");
  }
  return unique([...fromAi, ...fallback]).slice(0, 5);
}

function inferRegulatorRisk(articles = []) {
  const text = articles.map((article) => `${article.title || ""} ${article.summary || ""} ${article.keyword || ""}`).join(" ");
  const highSignals = (text.match(/검사|제재|불완전판매|위반|사고|민원|경영개선|중징계/g) || []).length;
  const ownSignals = (text.match(/인카금융|인카금융서비스|당사/g) || []).length;
  if (ownSignals && highSignals >= 2) return "HIGH";
  if (highSignals >= 2 || /수수료|정착지원금|내부통제|소비자보호|설계사/.test(text)) return "MEDIUM";
  return "LOW";
}

function normalizeRiskLevel(value) {
  const risk = String(value || "").toUpperCase();
  if (risk === "HIGH" || risk === "MEDIUM" || risk === "LOW") return risk;
  return "LOW";
}

function fallbackRegulatorJudgement(articles = []) {
  const count = articles.length;
  const tags = regulatorTags(articles);
  return `선택한 공식자료 ${count}건은 ${tags.join(", ")} 문맥을 중심으로 당사 영향 여부를 확인해야 합니다.`;
}

function fallbackCompanyImpact(articles = []) {
  const own = articles.some(isOwnArticle);
  const ga = articles.some((article) => /GA|보험대리점|설계사|모집|수수료/.test(`${article.title} ${article.summary} ${article.keyword}`));
  if (own) return "당사명이 직접 언급된 자료가 있어 평판 영향과 사실관계 확인을 우선해야 합니다.";
  if (ga) return "당사 직접 언급은 없어도 GA·설계사·모집질서 관련 정책은 영업 환경에 간접 영향을 줄 수 있습니다.";
  return "현재 선택 자료만으로 당사 직접 영향은 제한적이나 보험업권 정책 변화 가능성은 추적 대상입니다.";
}

function fallbackFieldImpact(articles = []) {
  const text = articles.map((article) => `${article.title} ${article.summary}`).join(" ");
  if (/수수료|정착지원금|1200/.test(text)) return "수수료·정착지원금 문맥은 설계사 리크루팅과 영업현장 안내 기준에 영향을 줄 수 있습니다.";
  if (/내부통제|소비자보호|불완전판매|민원/.test(text)) return "내부통제·소비자보호 문맥은 현장 설명자료와 모집 프로세스 점검으로 연결될 수 있습니다.";
  if (/설계사|모집|GA|보험대리점/.test(text)) return "설계사·GA 관련 문맥은 채널 운영, 모집, 교육 메시지 관점에서 확인이 필요합니다.";
  return "영업현장 영향은 아직 명확하지 않으나 시행 세부내용과 후속 보도 확인이 필요합니다.";
}

function fallbackRiskReason(articles = [], riskLevel = "LOW") {
  const text = articles.map((article) => `${article.title} ${article.summary}`).join(" ");
  if (riskLevel === "HIGH") return "당사 직접 언급과 검사·제재성 표현이 함께 포함되어 즉시 사실관계 확인이 필요합니다.";
  if (/검사|제재|경영개선|불완전판매|민원/.test(text)) return "감독·제재성 표현이 포함되어 업계 공통 이슈인지 당사 영향 이슈인지 분리해야 합니다.";
  if (/수수료|정착지원금|내부통제|소비자보호|설계사/.test(text)) return "영업현장과 연결될 수 있는 제도·감독 문맥이 있어 중간 수준의 관찰이 필요합니다.";
  return "현재 선택 자료에서는 직접 부정 또는 제재성 신호가 제한적입니다.";
}

function regulatorTags(articles = []) {
  const text = articles.map((article) => `${article.title} ${article.summary} ${article.keyword}`).join(" ");
  const tags = [];
  if (/보험대리점|GA|설계사|모집/.test(text)) tags.push("GA/설계사");
  if (/수수료|정착지원금|1200/.test(text)) tags.push("수수료");
  if (/내부통제|소비자보호|불완전판매|민원/.test(text)) tags.push("내부통제");
  if (/검사|제재|감독|경영개선|승인/.test(text)) tags.push("감독");
  if (/보험사|손해보험|생명보험|손보|생보/.test(text)) tags.push("보험업권");
  return tags.length ? tags.slice(0, 3) : ["보험업권"];
}

function MediaAnalysis({ data, period, setPeriod, articles = [], scraps, onOpenMonitoring, operations }) {
  const analysisArticles = useMemo(
    () => [...(articles || [])].sort((a, b) => articleTimeValue(b) - articleTimeValue(a)),
    [articles],
  );
  const trendDays = period === "daily" ? 1 : period === "weekly" ? 7 : 31;
  const periodLabel = period === "daily" ? "일일" : period === "weekly" ? "주간" : "월간";
  const selectedKeywords = useMemo(() => selectDashboardKeywords(operations?.keywords), [operations?.keywords]);
  const dailyTrend = useMemo(
    () => buildDailyToneTrend(analysisArticles, trendDays, data.toneTrend),
    [analysisArticles, data.toneTrend, trendDays],
  );
  const keywordRows = useMemo(
    () => buildKeywordFlow(analysisArticles, selectedKeywords),
    [analysisArticles, selectedKeywords],
  );
  const issueRows = buildIssues(analysisArticles, data.issues).slice(0, period === "daily" ? 5 : 8);
  const observations = buildPeriodObservations(data, issueRows, period);
  return (
    <main className="workspace">
      <PageTitle
        eyebrow={`${periodLabel} 분석`}
        title="미디어 분석 리포트"
        description="선택한 기간의 원문 보도일을 기준으로 논조 추이, 언론사 활동, 키워드별 기사량, 핵심 이슈를 분리해 봅니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            <button className="primary-button" onClick={() => printCurrentView("미디어 분석 리포트")}>
              <FileText />인쇄/PDF 저장
            </button>
          </div>
        )}
      />
      <AnalysisDrillCards data={data} onOpenMonitoring={onOpenMonitoring} />
      <section className="content-grid two media-analysis-grid">
        <Panel
          title={period === "daily" ? "키워드별 기사량" : "일별 논조 추이"}
          icon={Activity}
          meta={period === "daily" ? "일일 기준 · 상위 키워드" : `${periodLabel} 기준 · 전체 논조`}
        >
          {period === "daily"
            ? <DailyKeywordVolumeChart rows={keywordRows} />
            : <ToneTrend rows={dailyTrend} compact />}
        </Panel>
        <Panel title={`${periodLabel} 관찰 코멘트`} icon={Gauge} meta="핵심 흐름 요약" className="monthly-comment-panel">
          <InsightList insights={observations} />
        </Panel>
        <Panel title="언론사 영향도" icon={Building2} meta="관리 확인 필요 매체">
          <PressInfluence rows={data.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
        </Panel>
        <Panel
          title={period === "daily" ? "분류별 기사량" : "키워드별 기사량"}
          icon={LineChart}
          meta={period === "daily" ? "당사·GA·보험사·정책" : "선정 키워드 10개"}
        >
          {period === "daily"
            ? <CategoryChart rows={data.categoryFlow} tall onOpenMonitoring={onOpenMonitoring} />
            : <CategoryChart rows={keywordRows} tall onOpenMonitoring={onOpenMonitoring} drillBy="keyword" labelWidth={132} />}
        </Panel>
        <Panel title={`${periodLabel} 핵심 이슈`} icon={Newspaper} meta={`${issueRows.length}건`} className="wide-panel">
          <MonthlyIssueDigest issues={issueRows} />
        </Panel>
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

function Scraps({ scraps, onOpenMonitoring, onToggleScrap }) {
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
            <ArticleFeed rows={scraps} scraps={scraps} onToggleScrap={onToggleScrap} />
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

function RiskCenter({ articles = [], scraps = [], onOpenMonitoring, onToggleScrap }) {
  const [draftType, setDraftType] = useState("press");
  const [showAllRisk, setShowAllRisk] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [issueInput, setIssueInput] = useState("");
  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const riskRows = useMemo(
    () => [...articles]
      .filter((article) => article.tone === "부정" || (isOwnArticle(article) && article.tone === "주의"))
      .sort((a, b) => articleTimeValue(b) - articleTimeValue(a))
      .slice(0, 80),
    [articles],
  );
  const selectedArticle = useMemo(
    () => riskRows.find((article) => article.id === selectedArticleId || article.link === selectedArticleId) || null,
    [riskRows, selectedArticleId],
  );
  const visibleRiskRows = showAllRisk ? riskRows : riskRows.slice(0, 8);
  const activeUrl = urlInput || selectedArticle?.link || "";
  const activeIssue = issueInput || buildRiskIssueInput(selectedArticle, activeUrl);
  const draftPreview = draft || buildRiskDraftFallback(draftType, selectedArticle, activeUrl);
  const handleSelectArticle = (article) => {
    setSelectedArticleId(article.id || article.link || article.title);
    setUrlInput(article.link || "");
    setIssueInput(buildRiskIssueInput(article, article.link));
    setDraft("");
    setDraftError("");
  };
  const handleDropUrl = (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const url = extractFirstUrl(dropped);
    if (url) {
      setUrlInput(url);
      setSelectedArticleId("");
      setIssueInput((current) => current || `기사 URL 기준으로 사실관계와 당사 관련성을 확인해줘.\n${url}`);
      setDraft("");
      setDraftError("");
    }
  };
  const handleUrlPaste = (event) => {
    const text = event.clipboardData.getData("text");
    const url = extractFirstUrl(text);
    if (url) {
      setUrlInput(url);
      setSelectedArticleId("");
      setDraft("");
      setDraftError("");
    }
  };
  const handleGenerateDraft = async () => {
    const issue = activeIssue.trim();
    if (!issue && !activeUrl) {
      setDraftError("기사 URL이나 검토할 이슈 내용을 먼저 넣어주세요.");
      return;
    }
    setDraftLoading(true);
    setDraftError("");
    try {
      const result = await generateRiskResponse({
        type: draftType,
        issue: issue || `기사 URL 기준 리스크 검토: ${activeUrl}`,
        url: activeUrl,
        context: selectedArticle ? {
          title: selectedArticle.title,
          source: selectedArticle.source,
          summary: selectedArticle.summary,
          tone: selectedArticle.tone,
          category: selectedArticle.category,
          keyword: selectedArticle.keyword,
          date: selectedArticle.publishedDate || selectedArticle.date,
        } : {},
      });
      setDraft(result.draft || "");
    } catch (error) {
      setDraft(buildRiskDraftFallback(draftType, selectedArticle, activeUrl));
      setDraftError(`Gemini 초안 생성에 실패해 기본 초안을 표시했습니다. (${error?.message || "연결 확인 필요"})`);
    } finally {
      setDraftLoading(false);
    }
  };
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Risk Response"
        title="리스크 대응센터"
        description="부정·주의 기사를 같은 화면에서 확인하고, 기사 URL 또는 선택 기사 기반으로 대응 초안을 작성합니다."
      />
      <section className="risk-command-grid">
        <Panel title="부정/주의 기사" icon={AlertTriangle} meta={`${riskRows.length}건`}>
          {riskRows.length ? (
            <>
              <div className="risk-list">
                {visibleRiskRows.map((article) => {
                  const active = selectedArticle && (selectedArticle.id === article.id || selectedArticle.link === article.link);
                  return (
                    <article key={article.id || article.link || article.title} className={`risk-row ${active ? "active" : ""}`}>
                      <button type="button" onClick={() => handleSelectArticle(article)}>
                        <span className="risk-row-meta">{article.source} · {article.publishedDate || article.date || "-"} · {article.tone}</span>
                        <b>{article.title}</b>
                        <small>{article.summary || "요약 확인 필요"}</small>
                      </button>
                      <div className="risk-row-actions">
                        <button className="ghost-button" onClick={() => handleSelectArticle(article)}>선택</button>
                        <button className="ghost-button" onClick={() => onToggleScrap?.(article)}>
                          {isScrapped(article, scraps) ? "스크랩됨" : "스크랩"}
                        </button>
                        {article.link && article.link !== "#" && (
                          <a className="ghost-button" href={article.link} target="_blank" rel="noreferrer">원문</a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="ghost-button full" onClick={() => setShowAllRisk((value) => !value)}>
                {showAllRisk ? "주요 기사만 보기" : `전체 부정/주의 기사 ${riskRows.length}건 보기`}
              </button>
            </>
          ) : (
            <div className="empty-state compact">현재 선택 기간에는 부정·주의 기사로 분류된 항목이 없습니다.</div>
          )}
        </Panel>
        <Panel title="기사 URL / 사실관계 체크" icon={ShieldCheck} meta={selectedArticle ? "선택 기사 기준" : "직접 입력"}>
          <div
            className="risk-dropzone"
            onDrop={handleDropUrl}
            onDragOver={(event) => event.preventDefault()}
          >
            <span>기사 주소를 이 영역에 드래그하거나 붙여넣으세요</span>
            <div className="url-box">
              <input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                onPaste={handleUrlPaste}
                placeholder="https://news.example.com/article..."
              />
              <button className="primary-button" onClick={() => setIssueInput(buildRiskIssueInput(selectedArticle, urlInput))}>반영</button>
            </div>
          </div>
          <div className="fact-grid">
            <Fact label="검토 기사" value={selectedArticle?.title || (activeUrl ? "외부 URL 직접 입력" : "미선택")} />
            <Fact label="당사 관련성" value={selectedArticle ? (isOwnArticle(selectedArticle) ? "당사 직접 관련" : "업계/경쟁사 동향") : "원문 확인 필요"} />
            <Fact label="논조" value={selectedArticle?.tone || "확인 필요"} />
            <Fact label="대응 강도" value={riskResponsePriority(selectedArticle, activeUrl)} />
          </div>
          <textarea
            className="risk-issue-input"
            value={issueInput}
            onChange={(event) => setIssueInput(event.target.value)}
            placeholder="검토할 주장, 확인해야 할 사실관계, 요청 방향을 입력하세요."
          />
        </Panel>
        <Panel title="대응 초안" icon={FilePenLine} meta={draftLoading ? "생성 중" : "Gemini Pro"}>
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => setDraftType("press")}>언론 해명용</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => setDraftType("internal")}>사내 해명용</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "언론 해명용 초안" : "사내 공유용 초안"}</b>
            <p>{draftPreview}</p>
          </div>
          {draftError && <p className="status-note risk-error">{draftError}</p>}
          <button className="primary-button confirm-button" onClick={handleGenerateDraft} disabled={draftLoading}>
            {draftLoading ? "초안 생성 중" : "선택 기사로 초안 생성"}
          </button>
        </Panel>
      </section>
    </main>
  );
}

function isScrapped(article = {}, scraps = []) {
  return scraps.some((item) =>
    item.id === article.id ||
    item.article_hash === article.article_hash ||
    item.link === article.link ||
    item.title === article.title
  );
}

function extractFirstUrl(value = "") {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
}

function buildRiskIssueInput(article, url = "") {
  if (!article && !url) return "";
  if (!article) {
    return [
      "기사 URL 기준으로 핵심 주장, 당사 관련성, 사실관계 확인 포인트를 정리해줘.",
      url,
    ].filter(Boolean).join("\n");
  }
  return [
    `제목: ${article.title || "제목 확인 필요"}`,
    `언론사: ${article.source || "언론사 확인"}`,
    `분류/논조: ${article.category || "분류 확인"} · ${article.tone || "논조 확인"}`,
    `요약: ${article.summary || "요약 확인 필요"}`,
    `기사 URL: ${url || article.link || "URL 없음"}`,
    "",
    "요청: 당사 영향, 사실관계 확인 포인트, 대응 수위, 내부 공유 문구를 실무 보고용으로 정리해줘.",
  ].join("\n");
}

function riskResponsePriority(article, url = "") {
  if (!article && url) return "원문 확인 후 분류";
  if (!article) return "대기";
  if (isOwnArticle(article) && article.tone === "부정") return "즉시 확인";
  if (isOwnArticle(article) && article.tone === "주의") return "우선 검토";
  if (article.tone === "부정") return "업계 파급 확인";
  return "모니터링";
}

function buildRiskDraftFallback(type, article, url = "") {
  const title = article?.title || "선택 기사";
  const source = article?.source || "언론사 확인";
  const summary = article?.summary || "원문 확인 후 핵심 주장과 사실관계를 정리해야 합니다.";
  if (type === "press") {
    return [
      `제목: ${title} 관련 확인 입장 초안`,
      "",
      `${source} 보도와 관련해 현재 기사 내용의 사실관계와 당사 관련 범위를 확인 중입니다.`,
      `기사의 핵심 내용은 "${summary}"로 파악되며, 확인되지 않은 내용에 대해서는 단정적 입장을 내지 않습니다.`,
      "당사는 확인된 사실을 기준으로 필요한 경우 정정 요청, 추가 설명, 이해관계자 안내를 순차적으로 진행하겠습니다.",
      url ? `확인 URL: ${url}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `이슈: ${title}`,
    `출처: ${source}`,
    `현재 판단: ${riskResponsePriority(article, url)}`,
    `핵심 내용: ${summary}`,
    "확인 필요: 원문 표현, 당사 직접 언급 여부, 반복 보도 여부, 고객/설계사 문의 가능성",
    "대응 방향: 사실관계 확인 전 확정 표현을 피하고, 확인된 내용만 내부 공유합니다.",
  ].join("\n");
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
        title="일간/주간/월간 보고서"
        description="매일, 매주, 매월 받아보는 언론 동향지처럼 읽히도록 지면형 보고서로 구성합니다."
        right={(
          <div className="page-actions">
            <PeriodControl period={period} setPeriod={setPeriod} compact />
            <button className="primary-button" onClick={() => printCurrentView(`${edition.title} ${data.scope || ""}`)}>
              <Download />인쇄/PDF 저장
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
            <ArticleSummaryBlock item={lead || { title: summary.headline, summary: summary.headline, category: data.label, tone: summary.risk === "LOW" ? "중립" : "주의" }} />
            <div className="story-meta">
              {lead?.tone && <Chip tone={lead.tone}>{lead.tone}</Chip>}
              {lead?.category && <Chip>{lead.category}</Chip>}
              <span>{lead?.source || data.label} · {lead?.publishedAt || data.scope}</span>
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
              <b>주요 기사</b>
            </div>
            {secondary.map((issue) => <ReportStory key={`${issue.source}-${issue.title}`} issue={issue} />)}
          </section>

          <section className="paper-section analysis-page">
            <div className="paper-section-head">
              <span>Media Map</span>
              <b>언론사 영향도</b>
            </div>
            <PressInfluence rows={data.pressInfluence} compact />
          </section>

          <section className="paper-section chart-page">
            <div className="paper-section-head">
              <span>Data Page</span>
              <b>분류별 흐름</b>
            </div>
            <CategoryChart rows={data.categoryFlow} mini />
          </section>

          {period !== "daily" && (
            <>
              <section className="paper-section trend-page">
                <div className="paper-section-head">
                  <span>Trend Page</span>
                  <b>일별 논조</b>
                </div>
                <ToneTrend rows={reportTrend} compact />
              </section>
              <section className="paper-section scrap-page">
                <div className="paper-section-head">
                  <span>Scrap File</span>
                  <b>스크랩 기사</b>
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
  const topCategories = groupArticles(articles, "category").slice(0, 2).map(([name]) => name).join("·") || "주요 보도";
  const riskText = data.summary.ownNegative > 0
    ? `당사 부정 ${data.summary.ownNegative}건은 별도 확인 대상으로 분리하고`
    : "당사 직접 부정은 제한적이며";
  const cadence = period === "weekly" ? "이번 주" : "이번 달";
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
    <article className="report-story">
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

function Management({ management, operations }) {
  const [tab, setTab] = useState("media");
  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Operations"
        title="운영 관리"
        description="언론사, 기자, 광고비 관리가 축소되지 않도록 기존 운영 메뉴 단위를 살려서 보여줍니다."
        right={<DataSourcePill operations={operations} />}
      />
      <ManagementSummary management={management} />
      <div className="management-tabs">
        {[
          ["media", "언론사 관리", Building2],
          ["reporters", "기자 관리", Users],
          ["ads", "광고비 관리", WalletCards],
          ["keywords", "키워드/문맥", Settings],
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
      <StatCard icon={Building2} label="관리 언론사" value={`${management.media.length.toLocaleString("ko-KR")}곳`} />
      <StatCard icon={Users} label="기자 프로필" value={`${management.reporters.length.toLocaleString("ko-KR")}명`} />
      <StatCard icon={WalletCards} label="광고비 누적" value={formatMoney(totalAd)} />
      <StatCard icon={Megaphone} label="문맥 규칙" value={`${keywordGroups.length}개 그룹`} />
    </section>
  );
}

function MediaManagement({ rows, aliases = [] }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [aliasDraft, setAliasDraft] = useState({ url: "", pressName: "", status: "" });
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

  const openMediaManager = (row) => {
    const existingHost = domainsForPressName(row.name, aliasRows)[0] || "";
    setSelectedMedia(row);
    setAliasDraft({
      url: existingHost,
      pressName: row.name,
      status: existingHost ? `${existingHost} 주소가 ${row.name}으로 보정되어 있습니다.` : "",
    });
  };

  const handleUrlChange = (value) => {
    const mapped = resolvePressNameFromUrl(value, aliasRows, rows);
    const fallbackName = selectedMedia?.name || "";
    if (mapped) {
      setAliasDraft((current) => ({
        ...current,
        url: value,
        pressName: current.pressName || mapped || fallbackName,
        status: `${canonicalHost(value)} 주소는 현재 ${mapped}으로 매핑되어 있습니다.`,
      }));
    } else if (value.trim()) {
      setAliasDraft((current) => ({
        ...current,
        url: value,
        pressName: current.pressName || fallbackName,
        status: "기존 매핑 후보가 없습니다. 저장하면 선택 언론사 기준으로 새 보정 규칙이 만들어집니다.",
      }));
    } else {
      setAliasDraft((current) => ({ ...current, url: value, status: "" }));
    }
  };

  const handleSaveAlias = async () => {
    const host = canonicalHost(aliasDraft.url);
    const cleanName = (aliasDraft.pressName || selectedMedia?.name || "").trim();
    if (!host || !cleanName) {
      setAliasDraft((current) => ({ ...current, status: "URL/도메인과 언론사명을 모두 입력해야 합니다." }));
      return;
    }
    const nextAliases = upsertAliasRow(localAliases, { host, press_name: cleanName });
    setLocalAliases(nextAliases);
    writeLocalRows(PRESS_ALIAS_DRAFT_KEY, nextAliases);
    try {
      await savePressAlias(host, cleanName);
      setAliasDraft((current) => ({ ...current, status: `${host} -> ${cleanName} 저장 완료` }));
    } catch {
      setAliasDraft((current) => ({ ...current, status: `${host} -> ${cleanName} 화면 반영 완료 · 운영 세션 연결 시 DB 저장` }));
    }
  };

  return (
    <Panel title="언론사 관리" icon={Building2} meta={`${managedRows.length.toLocaleString("ko-KR")}곳`}>
      <div className="management-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="언론사명, 도메인, 메모 검색" />
        <button className="ghost-button">등급 정리</button>
        <button className="primary-button">언론사 추가</button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>언론사</th>
              <th>주소 보정</th>
              <th>등급</th>
              <th>관계</th>
              <th>담당</th>
              <th>최근 접촉</th>
              <th>기사량</th>
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
                <td>{Number(row.total || 0).toLocaleString("ko-KR")}건</td>
                <td>{row.memo || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost-button" onClick={() => openMediaManager(row)}>관리</button>
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
      {selectedMedia && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="login-panel media-alias-dialog">
            <button className="icon-button close" onClick={() => setSelectedMedia(null)} aria-label="닫기">
              <X />
            </button>
            <h2>언론사 주소 보정</h2>
            <p>
              선택한 언론사의 실제 도메인을 저장하면, 이후 해당 주소로 수집되는 기사는 이 언론사명으로 표시됩니다.
            </p>
            <div className="media-alias-target">
              <span>선택 언론사</span>
              <b>{selectedMedia.name}</b>
            </div>
            <label>
              <span>언론사 URL/도메인</span>
              <input
                value={aliasDraft.url}
                onChange={(event) => handleUrlChange(event.target.value)}
                placeholder="예: insnews.co.kr 또는 https://www.insnews.co.kr/..."
              />
            </label>
            <label>
              <span>표시 언론사명</span>
              <input
                value={aliasDraft.pressName}
                onChange={(event) => setAliasDraft((current) => ({ ...current, pressName: event.target.value }))}
                placeholder={selectedMedia.name}
              />
            </label>
            <div className="media-alias-existing">
              <span>현재 보정 주소</span>
              <div className="alias-chip-list">
                {domainsForPressName(selectedMedia.name, aliasRows).map((host) => <Chip key={host}>{host}</Chip>)}
                {!domainsForPressName(selectedMedia.name, aliasRows).length && <em>등록된 주소 없음</em>}
              </div>
            </div>
            {aliasDraft.status && <p className="status-note">{aliasDraft.status}</p>}
            <div className="operation-form-actions">
              <button className="ghost-button" onClick={() => setSelectedMedia(null)}>닫기</button>
              <button className="primary-button" onClick={handleSaveAlias}>주소 정보 저장</button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ReporterManagement({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyReporterForm);
  const [selectedReporter, setSelectedReporter] = useState(null);
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

  const handleAddReporter = () => {
    setForm(emptyReporterForm);
    setSelectedReporter({ mode: "add" });
    setStatus("");
  };

  const handleEditReporter = (row) => {
    setForm({
      id: row.id || "",
      name: row.name || "",
      media: row.outlet || row.media || "",
      status: row.status || "중립",
      contactDate: row.contactDate || row.date || "",
      memo: row.memo || "",
    });
    setSelectedReporter(row);
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
    setSelectedReporter(null);
    try {
      const saved = await saveReporterProfile(item);
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
    setSelectedReporter(null);
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
      <div className="management-toolbar reporter-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기자명, 언론사, 관계, 메모 검색" />
        <button className="primary-button" onClick={handleAddReporter}>기자 추가</button>
      </div>
      {status && <p className="status-note management-status">{status}</p>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>기자</th>
              <th>언론사</th>
              <th>담당</th>
              <th>관계</th>
              <th>최근 접촉</th>
              <th>최근 기사</th>
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
                <td>{row.recent}</td>
                <td>{row.memo || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost-button" onClick={() => handleEditReporter(row)}>관리</button>
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
      {selectedReporter && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="login-panel reporter-dialog">
            <button className="icon-button close" onClick={() => setSelectedReporter(null)} aria-label="닫기">
              <X />
            </button>
            <h2>{form.id ? "기자 정보 관리" : "기자 추가"}</h2>
            <p>기자명, 소속 언론사, 관계 상태와 접촉 메모를 한 화면에서 관리합니다.</p>
            <div className="operation-form reporter-form modal-form">
              <label>
                <span>기자명</span>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="예: 홍길동" />
              </label>
              <label>
                <span>언론사</span>
                <input value={form.media} onChange={(event) => updateForm("media", event.target.value)} placeholder="예: 보험저널" />
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
              <label className="reporter-memo-field">
                <span>메모</span>
                <textarea value={form.memo} onChange={(event) => updateForm("memo", event.target.value)} placeholder="관심 주제, 요청사항, 접촉 이력" />
              </label>
              <div className="operation-form-actions reporter-actions">
                {form.id && (
                  <button className="ghost-button danger" onClick={() => handleDeleteReporter(form)}>삭제</button>
                )}
                <button className="ghost-button" onClick={() => setSelectedReporter(null)}>닫기</button>
                <button className="primary-button" onClick={handleSaveReporter}>{form.id ? "수정 저장" : "기자 추가"}</button>
              </div>
            </div>
          </div>
        </div>
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
        <table className="data-table">
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
      <Panel title="분류 규칙" icon={ShieldCheck} meta="긍정·부정·주의·중립·제외">
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
    { label: "수집기사", value: summary.collected.toLocaleString("ko-KR"), icon: Newspaper, preset: {} },
    { label: "분석기사", value: summary.analyzed.toLocaleString("ko-KR"), icon: Gauge, preset: {} },
    { label: "당사언급", value: summary.ownMentions, icon: Building2, preset: { category: "당사" } },
    { label: "당사부정", value: summary.ownNegative, icon: AlertTriangle, tone: "negative", preset: { category: "당사", tone: "부정" } },
    { label: "주의", value: summary.caution, icon: Bell, tone: "caution", preset: { tone: "주의" } },
    { label: "GA/보험사", value: summary.gaInsurance, icon: Activity, preset: { category: "GA" } },
  ];
  return (
    <section className={compact ? "kpi-grid compact" : "kpi-grid"}>
      {items.map((item) => <Kpi key={item.label} {...item} onClick={onOpenMonitoring ? () => onOpenMonitoring(item.preset) : undefined} />)}
    </section>
  );
}

function Kpi({ label, value, icon: Icon, tone = "default", onClick }) {
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

function Panel({ title, icon: Icon, meta, actions, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-head">
        <h2><Icon />{title}</h2>
        <div className="panel-tools">
          {meta && <span>{meta}</span>}
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

function MonthlyIssueDigest({ issues }) {
  const [lead, ...rest] = issues;
  if (!lead) {
    return <div className="monthly-issue-empty">최근 1개월 기준으로 표시할 핵심 이슈가 없습니다.</div>;
  }
  return (
    <div className="monthly-issue-digest">
      <article className="monthly-issue-lead">
        <div className="issue-meta">
          <Chip tone={lead.tone}>{lead.tone}</Chip>
          <Chip>{lead.category}</Chip>
          <span>{lead.source} · {lead.publishedAt}</span>
        </div>
        <span className="monthly-issue-kicker">Headline</span>
        <h3>{lead.title}</h3>
        <ArticleSummaryBlock item={lead} />
        {lead.link && lead.link !== "#" && (
          <a className="article-link-button" href={lead.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, lead.link)}>
            <ExternalLink />기사 열기
          </a>
        )}
      </article>
      <div className="monthly-issue-list">
        {rest.slice(0, 5).map((issue) => (
          <article key={`${issue.source}-${issue.title}`}>
            <div>
              <span>{issue.source} · {issue.publishedAt}</span>
              <h4>{issue.title}</h4>
              <ArticleSummaryBlock item={issue} dense />
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

function IssueList({ issues, compact = false }) {
  return (
    <div className={compact ? "issue-list compact" : "issue-list"}>
      {issues.map((issue) => (
        <article className="issue-card" key={`${issue.source}-${issue.title}`}>
          <div className="issue-meta">
            <Chip tone={issue.tone}>{issue.tone}</Chip>
            <Chip>{issue.category}</Chip>
            <span>{issue.source} · {issue.publishedAt}</span>
          </div>
          <h3>{issue.title}</h3>
          <ArticleSummaryBlock item={issue} />
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

function ArticleSummaryBlock({ item, dense = false }) {
  const lines = buildArticleSummaryLines(item).slice(0, dense ? 2 : 3);
  if (!lines.length) return null;
  return (
    <ul className={dense ? "summary-lines dense" : "summary-lines"}>
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function ArticleFeed({ rows, compact = false, scraps = [], onToggleScrap, selectable = false, selectedIds = new Set(), onToggleSelect }) {
  const scrapIds = useMemo(() => new Set((scraps || []).map(scrapIdentity).filter(Boolean)), [scraps]);
  return (
    <div className={compact ? "feed-table compact" : "feed-table"}>
      {rows.map((row) => {
        const related = Array.isArray(row.relatedArticles) ? row.relatedArticles : [];
        const hasRelated = related.length > 1;
        const relatedText = hasRelated ? `외 ${related.length - 1}곳` : "";
        const identity = scrapIdentity(row);
        const scraped = scrapIds.has(identity);
        const selected = selectedIds?.has?.(identity);
        return (
          <article key={`${row.id || row.link || row.title}-${row.time}`} className={`${hasRelated ? "feed-row related" : "feed-row"} ${selectable ? "selectable" : ""} ${scraped ? "scraped" : ""} ${selected ? "selected" : ""}`.trim()}>
            {selectable && (
              <label className="feed-select" title={selected ? "분석 선택 해제" : "분석 선택"}>
                <input type="checkbox" checked={Boolean(selected)} onChange={() => onToggleSelect?.(row)} />
                <span />
              </label>
            )}
            <div className="feed-main">
              <div className="feed-title-line">
                <Chip tone={row.tone}>{row.tone}</Chip>
                <b>{row.title}</b>
                {hasRelated && <span className="related-badge">관련 {related.length}건</span>}
              </div>
              <span className="feed-meta-line">{buildFeedMeta(row)}{relatedText ? ` · ${relatedText}` : ""}</span>
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
                        <em>{formatArticleDateTime(item)}</em>
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="feed-actions">
              {onToggleScrap && (
                <button
                  type="button"
                  className={scraped ? "scrap-toggle active" : "scrap-toggle"}
                  aria-label={scraped ? "스크랩 해제" : "스크랩"}
                  title={scraped ? "스크랩 해제" : "스크랩"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleScrap(row);
                  }}
                >
                  <Bookmark />
                </button>
              )}
              {!compact && row.link && row.link !== "#" && (
                <a
                  href={row.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="기사 열기"
                  title="기사 열기"
                  onClick={(event) => openArticleLink(event, row.link)}
                >
                  <ExternalLink />
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function scrapIdentity(article = {}) {
  return String(article.id || article.article_hash || article.link || article.title || "").trim();
}

function openArticleLink(event, url) {
  event.preventDefault();
  event.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildFeedMeta(row = {}) {
  const parts = [row.source || "언론사 확인", row.category || row.keyword || "분류 확인", formatArticleDateTime(row)];
  return parts.filter(Boolean).join(" · ");
}

function formatArticleDateTime(row = {}) {
  const date = (row.publishedDate || row.date) ? String(row.publishedDate || row.date).slice(5) : "";
  const time = row.time && row.time !== "-" ? row.time : "";
  if (date && time) return `${date} ${time}`;
  return date || time || "-";
}

function WatchPanel({ jobs, risk = "LOW" }) {
  const watchJob = jobs.find((job) => job.label === "부정기사 감시") || jobs[0] || {};
  return (
    <section className="panel watch-panel">
      <div className="watch-title-row">
        <span><Radar />부정기사 탐색</span>
        <b>당사 리스크 <em>{risk}</em></b>
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
          <h2>정상 감시</h2>
          <p>최근 6분 검사 완료</p>
          <strong>{watchJob.latest || "-"} · 24시간 감시 중</strong>
          <span>24시간 5분 주기</span>
        </div>
      </div>
      <div className="watch-progress"><span /></div>
    </section>
  );
}

function NotificationHistory({ rows = [] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const visibleRows = rows.slice(0, 3);
  return (
    <>
      <NotificationList rows={visibleRows} onSelect={setSelected} />
      {rows.length > 3 && (
        <button className="ghost-button full compact-more" onClick={() => setOpen(true)}>
          발송 이력 더보기
        </button>
      )}
      {selected && <NotificationDetail item={selected} onClose={() => setSelected(null)} />}
      {open && (
        <NotificationArchive
          rows={rows}
          onClose={() => setOpen(false)}
          onSelect={(item) => {
            setOpen(false);
            setSelected(item);
          }}
        />
      )}
    </>
  );
}

function NotificationArchive({ rows, onClose, onSelect }) {
  return (
    <div className="modal-backdrop compact-modal" role="dialog" aria-modal="true">
      <section className="history-modal">
        <div className="history-modal-head">
          <div>
            <span>Notification History</span>
            <h2>알림톡 발송 이력</h2>
          </div>
          <button type="button" className="icon-button close" onClick={onClose} aria-label="닫기"><X /></button>
        </div>
        <NotificationList rows={rows} onSelect={(item) => { onSelect(item); }} />
      </section>
    </div>
  );
}

function NotificationDetail({ item, onClose }) {
  return (
    <div className="modal-backdrop compact-modal" role="dialog" aria-modal="true">
      <section className="history-modal detail">
        <div className="history-modal-head">
          <div>
            <span>{item.time}</span>
            <h2>{item.type}</h2>
          </div>
          <button type="button" className="icon-button close" onClick={onClose} aria-label="닫기"><X /></button>
        </div>
        <pre className="notification-body">{item.body || "저장된 알림톡 본문이 없습니다."}</pre>
        {item.link && (
          <a className="article-link-button" href={item.link} target="_blank" rel="noopener noreferrer" onClick={(event) => openArticleLink(event, item.link)}>
            <ExternalLink />보고서 열기
          </a>
        )}
      </section>
    </div>
  );
}

function NotificationList({ rows, onSelect }) {
  return (
    <div className="notification-list">
      {rows.map((item) => (
        <button key={item.id || `${item.time}-${item.type}`} onClick={() => onSelect?.(item)}>
          <b>{item.time}</b>
          <span>{item.type}</span>
          <Chip tone={item.status}>{item.status}</Chip>
        </button>
      ))}
      {!rows.length && <div className="empty-state compact">표시할 발송 이력이 없습니다.</div>}
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
          <em>{item.total}건</em>
          {detailed && <small>당사 {item.own} · 부정 {item.negative} · {item.type || "일반"}</small>}
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

function DailyKeywordVolumeChart({ rows = [] }) {
  const visibleRows = rows
    .filter((row) => Number(row.value) > 0)
    .slice(0, 8);
  const dataRows = visibleRows.length ? visibleRows : [{ name: "수집 없음", value: 0 }];
  return (
    <div className="chart-box daily-keyword-bar">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dataRows} margin={{ left: 4, right: 12, top: 22, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11, fontWeight: 900 }}
            tickFormatter={(value) => truncateChartLabel(value, 8)}
          />
          <YAxis hide />
          <Tooltip formatter={(value) => [`${Number(value).toLocaleString("ko-KR")}건`, "기사량"]} />
          <Bar dataKey="value" radius={[7, 7, 0, 0]} barSize={34}>
            <LabelList dataKey="value" position="top" formatter={(value) => `${Number(value).toLocaleString("ko-KR")}`} />
            {dataRows.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function truncateChartLabel(value, max = 8) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ToneTrend({ rows, compact = false }) {
  return (
    <div className={compact ? "chart-box report-trend" : "chart-box tall"}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={rows} margin={{ left: 8, right: 12, top: 12, bottom: compact ? 10 : 2 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={compact ? 8 : 14} tick={{ fontSize: compact ? 9 : 12, fontWeight: 800 }} />
          <YAxis hide />
          <Tooltip />
          <Legend
            verticalAlign="bottom"
            height={compact ? 20 : 28}
            iconType="circle"
            wrapperStyle={{ fontSize: compact ? 10 : 12, fontWeight: 800 }}
          />
          {toneSeries.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              stroke={series.color}
              strokeWidth={series.key === "neutral" ? 2.2 : 2.5}
              strokeDasharray={series.strokeDasharray}
              dot={false}
              name={series.label}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightList({ insights = [] }) {
  return <div className="insight-list">{insights.map((text) => <p key={text}>{text}</p>)}</div>;
}

function RuleStack() {
  const sortedRules = [...contextRules].sort((a, b) => contextRuleRank(a.label) - contextRuleRank(b.label));
  return (
    <div className="rule-stack">
      {sortedRules.map((rule) => (
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

function orderNotificationHistory(rows = []) {
  const seen = new Set();
  return rows
    .filter((row) => {
      const key = `${row.messageType || row.type}-${row.type}-${row.body || row.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const timeDiff = notificationTimeValue(b) - notificationTimeValue(a);
      if (timeDiff) return timeDiff;
      return String(b.sentAt || b.time || "").localeCompare(String(a.sentAt || a.time || ""));
    });
}

function notificationTimeValue(row = {}) {
  const raw = row.sentAt || row.sent_at || row.createdAt || row.created_at || "";
  if (raw) {
    const timestamp = new Date(raw).getTime();
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  const timeText = String(row.time || "");
  const match = timeText.match(/^(\d{1,2}):(\d{2})$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return 0;
}

function Chip({ children, tone }) {
  const cls = {
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
  return <span className={`chip ${cls}`}>{children}</span>;
}

function composeRealtimeData(base, articles, liveConnected = false) {
  if (!liveConnected) {
    return buildDisconnectedPeriodData(base);
  }
  if (!articles.length) {
    return buildDisconnectedPeriodData(base, "최근 24시간 실제 보도시각 기준으로 표시할 주요 기사가 없습니다.");
  }
  return {
    ...composePeriodData(base, articles, [], true),
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
  const ownMentions = articles.filter(isOwnArticle).length;
  const ownNegative = articles.filter((article) => isOwnArticle(article) && article.tone === "부정").length;
  const caution = articles.filter((article) => article.tone === "주의").length;
  const gaInsurance = articles.filter((article) => ["GA", "보험사"].includes(article.category)).length;
  const headlineOwnMentions = ownMentions;
  const headlineOwnNegative = ownNegative;
  const headlineCaution = caution;
  const summary = {
    ...base.summary,
    collected: runSummary.collected ?? articles.length,
    analyzed: runSummary.analyzed ?? articles.filter((article) => article.tone !== "제외").length,
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
    scope: articlePeriodDateKey(articles[0]) ? `${articlePeriodDateKey(articles[0])} 기준` : base.scope,
    issues: articles.length ? buildIssues(articles, []) : [],
    categoryFlow: groupArticles(articles, "category").slice(0, 6).map(([name, value]) => ({ name, value })),
    toneTrend: buildToneTrend(articles),
    pressInfluence: buildPressInfluence(articles),
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
  const ownArticles = articles.filter(isOwnArticle);
  const ownLead = ownArticles.find((article) => !isStockMarketArticle(article)) || ownArticles[0];
  const stockOnlyOwnMentions = ownArticles.length > 0 && ownArticles.every(isStockMarketArticle);
  if (ownNegative > 0) {
    return `당사 부정 ${ownNegative}건이 확인됐습니다. 최신 당사 언급 기사 "${ownLead?.title || "확인 필요"}"를 우선 점검합니다.`;
  }
  if (ownMentions > 0) {
    if (stockOnlyOwnMentions) {
      return `당사 언급 ${ownMentions}건은 주가·시황성 노출입니다. 직접 부정 보도나 영업 리스크와 분리해 시장 참고 신호로 관리합니다.`;
    }
    if (isStockMarketArticle(ownLead)) {
      return `당사 언급 ${ownMentions}건 중 주가·시황성 이슈가 포함되어 있습니다. 직접 부정과 시장 참고 신호를 구분해 확인합니다.`;
    }
    return `당사 언급 ${ownMentions}건은 직접 부정은 아니지만 평판 영향 확인이 필요합니다. 핵심 기사 "${ownLead?.title}"의 맥락을 우선 점검합니다.`;
  }
  return `당사 직접 언급은 없습니다. 주의 ${caution}건과 GA/보험사 동향 ${articles.filter((item) => ["GA", "보험사"].includes(item.category)).length}건을 추적합니다.`;
}

function isStockMarketArticle(article = {}) {
  const text = `${article.title || ""} ${article.summary || ""} ${article.keyword || ""} ${article.category || ""}`;
  return (
    /주가|증시|코스피|코스닥|상장|시총|시가총액|거래|52주|최고가|최저가|신저가|종목|투자자|투자의견|목표가|목표주가|증권가|리포트|애널리스트/i.test(text)
    && /하락|급락|약세|낙폭|최저가|신저가|부진|조정|매도|▼|↓|하향|중립|보유|9,\d{3}|8,\d{3}/i.test(text)
  );
}

function buildIssues(articles, fallback) {
  const seen = new Set();
  const uniqueArticles = [];
  [...articles, ...(fallback || [])].forEach((article) => {
    const title = article?.title;
    if (!title || seen.has(title)) return;
    seen.add(title);
    uniqueArticles.push(article);
  });
  const ranked = uniqueArticles
    .map((article) => ({ article, score: issuePriorityScore(article) }))
    .sort((a, b) => b.score - a.score || articleTimeValue(b.article) - articleTimeValue(a.article));
  const uniqueIssues = ranked.slice(0, 6).map(({ article }) => ({
      tone: article.tone,
      category: article.category,
      source: article.source,
      title: article.title,
      summary: compactArticleSummary(article),
      summaryLines: buildArticleSummaryLines(article),
      publishedAt: article.time || articlePeriodDateKey(article) || "-",
      link: article.link,
  }));
  return uniqueIssues.length ? uniqueIssues : fallback;
}

function issuePriorityScore(article = {}) {
  const text = `${article.title || ""} ${article.summary || ""} ${article.keyword || ""} ${article.category || ""}`;
  let score = 0;
  if (isOwnArticle(article)) score += 120;
  if (article.tone === "부정") score += 90;
  if (article.tone === "주의") score += 70;
  if (article.tone === "긍정" && isOwnArticle(article)) score += 45;
  if (/금감원|금융당국|감독|점검|검사|제재|불완전|사고|소송|분쟁|정착지원금|역성장|감소폭|생산성/i.test(text)) score += 75;
  if (/인카금융서비스|인카금융|인카/i.test(text)) score += 70;
  if (/브랜드평판|1위|상향|성과|실적|매출|점유율/i.test(text) && isOwnArticle(article)) score += 35;
  if (/GA|보험대리점|설계사|전속설계사|N잡|손보|생보/i.test(text)) score += 18;
  if (/정책|규제|1200|수수료|내부통제|소비자보호/i.test(text)) score += 28;
  if (article.category === "정책/규제") score += 25;
  if (article.category === "GA") score += 12;
  if (article.category === "보험사") score += 8;
  score += Math.min(35, Number(article.relatedCount || article.clusterSize || 1) * 3);
  score += Math.min(20, Number(article.score || 0));
  if (article.tone === "긍정" && !isOwnArticle(article)) score -= 35;
  if (isStockMarketArticle(article)) {
    score -= isOwnArticle(article) ? 125 : 80;
  }
  return score;
}

function buildArticleSummaryLines(item = {}) {
  if (Array.isArray(item.summaryLines) && item.summaryLines.length) {
    return unique(item.summaryLines
      .map(normalizeSummaryLine)
      .filter((line) => line && !isGenericSummaryLine(line) && !isBrokenSummarySentence(line))
    );
  }
  const cleanTitle = cleanSummaryText(item.title || "");
  const text = stripCaptionPrefix(cleanSummaryText(item.summary || item.description || ""));
  const sentences = splitSummarySentences(text)
    .filter((sentence) => (
      sentence !== cleanTitle
      && !isGenericSummaryLine(sentence)
      && !isBrokenSummarySentence(sentence)
      && !isCaptionLikeSummary(sentence)
    ));
  const lead = buildSummaryLeadLine(item, cleanTitle, sentences, text);
  const detail = buildSummaryDetailLine(item, sentences, text);
  const insight = buildSummaryInsightLine(item);
  return unique([lead, detail, insight].filter(Boolean))
    .filter((line) => !isGenericSummaryLine(line))
    .filter((line) => !isBrokenSummarySentence(line))
    .map(normalizeSummaryLine)
    .filter(Boolean)
    .slice(0, 4);
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
    .replace(/^[\[［【(（].{0,60}[=＝].{0,30}기자[\]］】)）]\s*/g, "")
    .replace(/^\[[^\]]+\s+[^\]]*기자\]\s*/g, "")
    .replace(/^[［【].{1,60}기자[］】]\s*/g, "")
    .replace(/^[가-힣A-Za-z0-9_.·\s-]{1,30}\s*[=＝]\s*[가-힣]{2,5}\s*기자\s*/g, "")
    .replace(/^[^\s]+ 기자\s*=\s*/g, "")
    .replace(/^[ㅣ|│｜]\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/(\.\.\.|…)+$/g, "")
    .trim();
}

function normalizeSummaryLine(value) {
  const text = cleanSummaryText(value)
    .replace(/\s*[\u2022•]\s*/g, " ")
    .replace(/\s+([,.!?。])$/g, "$1")
    .trim();
  if (!text || isFragmentSummaryLine(text) || isBrokenSummarySentence(text)) return "";
  return ensureSentence(text);
}

function stripCaptionPrefix(value) {
  let text = cleanSummaryText(value);
  if (!/전경|사진\s*=|제공\s*=|이미지|기념\s*촬영|로고/.test(text)) return text;
  if (text.includes("◇")) {
    const [head, ...tailParts] = text.split("◇");
    if (/전경|사진\s*=|제공\s*=|이미지/.test(head)) {
      return cleanSummaryText(tailParts.join("◇"));
    }
  }
  text = text.replace(/^[^.!?。]{0,130}(?:사옥\s*전경|본사\s*전경|건물\s*외관)\s*(?:[.,。/ ]|\([^)]*\))*\s*/, "");
  text = text.replace(/^[\[/ ]*(?:사진|제공)\s*=\s*[^◇.。\]]{0,90}[\]◇.。]?\s*/, "");
  text = text.replace(/^[/ ]*사진\s*\/\s*[^ ]{1,20}\s*/, "");
  return cleanSummaryText(text);
}

function splitSummarySentences(value) {
  const clean = cleanSummaryText(value);
  if (!clean) return [];
  return clean
    .replace(/([.!?。])\s*/g, "$1|")
    .replace(/(다|했다|밝혔다|전망했다|설명했다|참여한다고|상향했다|유지할 것)\s+/g, "$1.|")
    .split("|")
    .map((sentence) => sentence.replace(/(\.\.\.|…)+$/g, "").trim())
    .filter((sentence) => sentence.length >= 10)
    .slice(0, 3);
}

function buildSummaryLeadLine(item = {}, title = "", sentences = [], summaryText = "") {
  const first = sentences.find((sentence) => sentence.length <= 120);
  if (first) return first;
  const titleSummary = buildTitleBasedSummary(item, title, summaryText);
  if (titleSummary) return titleSummary;
  const cleanTitle = title.replace(/\s+-\s+[^-]{2,16}$/g, "").trim();
  if (cleanTitle) return `${cleanTitle} 보도입니다`;
  return `${item.source || "언론"} 보도 기준 핵심 이슈입니다`;
}

function ensureSentence(value) {
  const text = cleanSummaryText(value);
  if (!text) return "";
  return /[.!?。]$/.test(text) ? text : `${text}.`;
}

function isBrokenSummarySentence(value) {
  const text = cleanSummaryText(value);
  const stem = text.replace(/[.!?。]+$/g, "").trim();
  return (
    isFragmentSummaryLine(text) ||
    text.endsWith("고") ||
    text.endsWith("며") ||
    text.endsWith("또한") ||
    /(을|를|에|의|과|와|로|으로|에게|에서|부터|까지|보다|처럼)$/.test(stem) ||
    (!/[.!?。]$|다$|요$|임$|함$|필요$/.test(text) && /(에|을|를|의|과|와|로|으로)$/.test(text)) ||
    /전망했 또한|밝혔 또한|한다고 \d{1,2}일?$/.test(text) ||
    text.length > 160
  );
}

function isFragmentSummaryLine(value) {
  const text = cleanSummaryText(value).replace(/[.!?。]+$/, "");
  if (!text) return true;
  if (/^(강력히|적극적으로|지속적으로|본격적으로|확대|강화|추진|확인|필요)$/.test(text)) return true;
  if (text.length < 8 && !/\d/.test(text)) return true;
  return /(강력히|적극적으로|지속적으로|본격적으로)$/.test(text);
}

function isCaptionLikeSummary(value) {
  const text = cleanSummaryText(value);
  if (!text) return true;
  const caption = /사옥\s*전경|본사\s*전경|건물\s*외관|사진\s*=|제공\s*=|자료\s*사진|이미지|기념\s*촬영|로고/i.test(text);
  if (/^[\[/ ]*(사진|제공)\s*=/.test(text)) return true;
  if (caption && text.length <= 80) return true;
  return text.length < 10 && !/(인수|실적|검사|점검|제재|승인|협약|출시|선정|상승|하락)/.test(text);
}

function buildTitleBasedSummary(item = {}, title = "", summaryText = "") {
  const text = `${title} ${summaryText || ""} ${item.keyword || ""}`;
  const actor = extractPrimaryEntity(text) || (item.category === "당사" ? "당사" : "");
  if (/공공\s*마이데이터|장기보상|보험금\s*청구/.test(text)) {
    return `${actor || "보험사"}이 공공 마이데이터를 보험금 청구·장기보상 업무에 연계한 서비스 사례입니다`;
  }
  if (/해외|인수|M&A|포테그라|글로벌/i.test(text) && /보험|손보|생보/.test(text)) {
    return `${actor || "보험업계"}의 해외 사업 확대와 보험사 인수 흐름을 다룬 기사입니다`;
  }
  if (/금감원|금융감독원|금융위|금융위원회|제재|검사|점검|승인|경영개선/.test(text)) {
    return `${actor || "금융당국"} 관련 감독·정책 이슈를 다룬 기사입니다`;
  }
  if (/실적|마감|매출|순이익|영업익|역성장|감소|증가|성장/.test(text)) {
    return `${actor || "보험·GA 업계"}의 실적과 영업 흐름을 다룬 기사입니다`;
  }
  if (/브랜드평판|평판|1위|순위|선정|수상/.test(text)) {
    return `${actor || "보험·GA 업계"}의 평판·순위성 보도입니다`;
  }
  return "";
}

function extractPrimaryEntity(text = "") {
  const candidates = [
    "인카금융서비스", "인카금융", "DB손해보험", "DB손보", "삼성화재", "현대해상",
    "KB손해보험", "KB손보", "메리츠화재", "한화생명", "한화손해보험",
    "롯데손해보험", "롯데손보", "NH농협손해보험", "보험저널", "금융감독원", "금융위원회",
  ];
  return candidates.find((name) => text.includes(name)) || "";
}

function contextRuleRank(label) {
  const text = String(label || "");
  if (/긍정/.test(text)) return 1;
  if (/중립/.test(text)) return 2;
  if (/주의/.test(text)) return 3;
  if (/부정/.test(text)) return 4;
  if (/제외|노이즈/.test(text)) return 5;
  return 99;
}

function isGenericSummaryLine(value) {
  const text = cleanSummaryText(value);
  return (
    /키워드 기준으로 수집된 기사입니다/.test(text) ||
    /키워드로 수집됐습니다/.test(text) ||
    /기준 핵심만 요약했습니다/.test(text)
  );
}

function buildSummaryDetailLine(item = {}, sentences = [], summaryText = "") {
  const second = sentences.find((sentence, index) => index > 0 && sentence.length <= 130);
  if (second) return second;
  const text = `${item.title || ""} ${summaryText || item.summary || ""} ${item.keyword || ""}`;
  if (/책무구조도/.test(text)) return "책무구조도 운영 이후 내부통제 책임과 제재 기준을 둘러싼 보완 과제가 남아 있습니다";
  if (/품질관리|감리|회계법인|회계/.test(text)) return "금융감독 당국이 감사 품질관리 체계의 설계와 운영 적정성을 점검한 사안입니다";
  if (/AI|인공지능|보안|자문단/.test(text)) return "AI 보안과 제도 자문 체계가 금융권 기술 활용 기준에 영향을 줄 수 있습니다";
  if (/사고|보험사기|무더기|적발|피해/.test(text)) return "보험 관련 사고·사기 이슈로 소비자 신뢰와 내부통제 관점의 확인이 필요합니다";
  return "";
}

function buildSummaryInsightLine(item = {}) {
  const category = item.category || item.keyword || "키워드";
  if (isOwnArticle(item) && isStockMarketArticle(item)) return "당사 주가가 시황 기사에 언급된 시장성 노출로, 영업·준법 리스크와 구분해 확인합니다";
  if (isOwnArticle(item)) return "당사 직접 언급 기사라 평판 영향과 사실관계 확인이 우선입니다";
  if (category === "정책/규제") return "";
  if (["GA", "보험사"].includes(category) && item.tone === "주의") return "보험사·GA 시장의 제휴, 채널, 실적 흐름을 당사 영향과 분리해 확인합니다";
  if (category === "제외") return "분석 대상에서 제외한 노이즈성 기사입니다.";
  if (item.tone === "부정") return "소비자 피해, 제재, 사칭, 법적 분쟁처럼 대응 우선순위를 올릴 신호인지 확인해야 합니다";
  if (item.tone === "주의" && isStockMarketArticle(item)) return "주가·시황성 주의 신호로 관리하되 직접 부정 보도와 분리합니다";
  return "";
}

function buildPeriodObservations(data, issues = [], period = "monthly") {
  const summary = data.summary || {};
  const lead = issues[0];
  const riskIssueCount = issues.filter((issue) => ["부정", "주의"].includes(issue.tone)).length;
  const regulationIssueCount = issues.filter((issue) => /정책|규제|감독|금감원|금융당국|정착지원금/i.test(`${issue.category} ${issue.title} ${issue.summary}`)).length;
  const periodLabel = period === "daily" ? "일일" : period === "weekly" ? "주간" : "월간";
  const observations = [];
  if (summary.ownNegative > 0) {
    observations.push(`당사 직접 부정 ${summary.ownNegative}건이 확인되어 기사 제목, 반복 보도 여부, 사실관계 확인을 우선순위로 둡니다.`);
  } else if (summary.ownMentions > 0) {
    const ownIssues = issues.filter(isOwnArticle);
    if (ownIssues.length && ownIssues.every(isStockMarketArticle)) {
      observations.push(`당사 언급 ${summary.ownMentions}건은 주가·시황성 노출입니다. 직접 부정 보도가 아니므로 평판 리스크와 분리해 참고 지표로 관리합니다.`);
    } else {
      observations.push(`당사 언급 ${summary.ownMentions}건은 직접 부정보다 평판·시장성 이슈에 가깝습니다. 단순 노출이 아니라 당사명과 함께 전달된 맥락을 확인합니다.`);
    }
  } else {
    observations.push(`${periodLabel} 기준 당사 직접 부정 이슈는 확인되지 않았습니다. 다만 GA·보험사·정책 흐름은 향후 당사 보도로 전이될 수 있어 추적합니다.`);
  }
  if (riskIssueCount > 0) {
    observations.push(`핵심 이슈 ${issues.length}건 중 부정·주의성 기사는 ${riskIssueCount}건입니다. 대응 필요성은 기사 강도보다 당사 관련성과 반복 노출 여부로 판단합니다.`);
  }
  if (regulationIssueCount > 0) {
    observations.push(`금감원·정착지원금·규제성 문맥이 ${regulationIssueCount}건 포함되어 있어 영업 현장 설명자료나 내부 Q&A가 필요한지 점검합니다.`);
  }
  if (lead?.title) {
    observations.push(`대표 확인 기사는 "${lead.title}"입니다. ${periodLabel} 핵심 이슈는 보도량이 아니라 당사 영향도와 리스크 신호를 기준으로 정렬했습니다.`);
  }
  return observations.slice(0, 4);
}

function buildToneTrend(articles) {
  const byDate = new Map();
  articles.forEach((article) => {
    const date = articlePeriodDateKey(article) || "미확인";
    if (!byDate.has(date)) byDate.set(date, emptyToneBucket(date.slice(5) || date));
    countToneIntoBucket(byDate.get(date), article.tone);
  });
  return Array.from(byDate.values()).slice(-7);
}

function buildDailyToneTrend(articles, days = 31, fallback = []) {
  const dated = articles.filter((article) => articlePeriodDateKey(article));
  if (!dated.length) return ensureTrendHasTone(fallback);
  const latest = dated.map((article) => articlePeriodDateKey(article)).sort().at(-1);
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  if (Number.isNaN(latestTime)) return buildToneTrend(dated);
  const startTime = latestTime - (days - 1) * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startTime + index * 24 * 60 * 60 * 1000);
    const key = formatKstDateKey(date);
    buckets.set(key, emptyToneBucket(key.slice(5)));
  }
  dated.forEach((article) => {
    const dateKey = articlePeriodDateKey(article);
    const time = new Date(`${dateKey}T00:00:00+09:00`).getTime();
    if (Number.isNaN(time) || time < startTime || time > latestTime) return;
    const bucket = buckets.get(dateKey);
    if (!bucket) return;
    countToneIntoBucket(bucket, article.tone);
  });
  const rows = Array.from(buckets.values());
  const hasSignal = rows.some(hasToneSignal);
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
  const dated = articles.filter((article) => articlePeriodDateKey(article));
  if (!dated.length) {
    return ensureTrendHasTone(fallback);
  }
  const latest = dated.map((article) => articlePeriodDateKey(article)).sort().at(-1);
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const startTime = latestTime - 30 * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (let index = 0; index < 5; index += 1) {
    buckets.set(index, emptyToneBucket(`${index + 1}주`));
  }
  dated.forEach((article) => {
    const time = new Date(`${articlePeriodDateKey(article)}T00:00:00+09:00`).getTime();
    if (Number.isNaN(time) || time < startTime || time > latestTime) return;
    const index = Math.min(4, Math.max(0, Math.floor((time - startTime) / (7 * 24 * 60 * 60 * 1000))));
    const bucket = buckets.get(index);
    countToneIntoBucket(bucket, article.tone);
  });
  const rows = Array.from(buckets.values());
  const hasSignal = rows.some(hasToneSignal);
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
    neutral: Number(row.neutral || 0),
    caution: Number(row.caution || 0),
    negative: Number(row.negative || 0),
    excluded: Number(row.excluded || row.exclude || 0),
  }));
}

function emptyToneBucket(date) {
  return { date, positive: 0, neutral: 0, caution: 0, negative: 0, excluded: 0 };
}

function countToneIntoBucket(bucket, tone) {
  if (!bucket) return;
  if (tone === "긍정") bucket.positive += 1;
  else if (tone === "부정") bucket.negative += 1;
  else if (tone === "주의") bucket.caution += 1;
  else if (tone === "제외") bucket.excluded += 1;
  else bucket.neutral += 1;
}

function hasToneSignal(row = {}) {
  return toneSeries.some((series) => Number(row[series.key] || 0) > 0);
}

function lastNDays(articles, days) {
  const dated = articles.filter((article) => articlePeriodDateKey(article));
  if (!dated.length) return articles;
  const latest = dated.map((article) => articlePeriodDateKey(article)).sort().at(-1);
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const minTime = latestTime - (days - 1) * 24 * 60 * 60 * 1000;
  return dated.filter((article) => {
    const time = new Date(`${articlePeriodDateKey(article)}T00:00:00+09:00`).getTime();
    return time >= minTime && time <= latestTime;
  });
}

function selectRealtimeArticles(articles = []) {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const upperBound = now + 60 * 60 * 1000;
  const recent = articles.filter((article) => {
    const time = articlePublishedTimeValue(article);
    return time > 0 && time >= cutoff && time <= upperBound;
  });
  return [...recent]
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
      publishedAt: article.time || articlePeriodDateKey(article) || "-",
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
  const pressArticles = articles.filter((article) => !isRegulatorArticle(article));
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

const PRESS_ALIAS_DRAFT_KEY = "news_monitor_press_alias_drafts_v1";
const KEYWORD_DRAFT_KEY = "news_monitor_keyword_drafts_v1";
const REPORTER_DRAFT_KEY = "news_monitor_reporter_drafts_v1";

const emptyReporterForm = {
  id: "",
  name: "",
  media: "",
  status: "중립",
  contactDate: "",
  memo: "",
};

const pressHostFallbacks = {
  "asiatoday.co.kr": "아시아투데이",
  "biz.chosun.com": "조선비즈",
  "bohumnews.com": "보험신보",
  "dailyan.co.kr": "데일리안",
  "dt.co.kr": "디지털타임스",
  "edaily.co.kr": "이데일리",
  "fnnews.com": "파이낸셜뉴스",
  "fins.co.kr": "보험매일",
  "hankyung.com": "한국경제",
  "insjournal.co.kr": "보험저널",
  "joongangenews.com": "중앙이코노미뉴스",
  "mk.co.kr": "매일경제",
  "mt.co.kr": "머니투데이",
  "news1.kr": "뉴스1",
  "sedaily.com": "서울경제",
  "thebell.co.kr": "더벨",
  "weekly.chosun.com": "주간조선",
  "yna.co.kr": "연합뉴스",
};

const keywordCategories = [
  { id: "own", label: "당사", rule: "당사명, 브랜드, 임직원처럼 직접 언급만 당사로 분류합니다." },
  { id: "competitor", label: "경쟁사/GA", rule: "보험, GA, 설계사, 정착지원금 문맥이 함께 있을 때만 경쟁사 이슈로 봅니다." },
  { id: "industry", label: "업계동향", rule: "보험 시장, 판매채널, 소비자 동향처럼 업계 흐름을 추적합니다." },
  { id: "regulation", label: "정책/규제", rule: "수수료·제도 키워드는 보험, GA, 설계사, 보험대리점 문맥이 함께 있을 때만 통과합니다." },
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
    status: String(row.status || "중립").trim() || "중립",
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
  const pressStats = new Map(buildPressInfluence(articles).map((row) => [row.source, row]));
  const media = operations.mediaRelations?.length
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
  const reporters = operations.reporters?.length ? operations.reporters : journalistRows;
  const ads = operations.ads?.length ? operations.ads : adRows;
  return { media, reporters, ads };
}

function filterArticlesByPeriod(articles, period) {
  return filterRowsByPeriod(articles, period);
}

function articlePeriodDateKey(article = {}) {
  return String(article.periodDate || article.publishedDate || article.date || article.reportDate || "").slice(0, 10);
}

function filterRowsByPeriod(articles, period) {
  if (!articles.length) return [];
  const dated = articles.filter((article) => articlePeriodDateKey(article));
  if (!dated.length) return articles;
  const latest = dated.map((article) => articlePeriodDateKey(article)).sort().at(-1);
  if (!latest) return articles;
  if (period === "daily") return dated.filter((article) => articlePeriodDateKey(article) === latest);
  if (period === "monthly") return dated.filter((article) => articlePeriodDateKey(article).startsWith(latest.slice(0, 7)));
  const latestTime = new Date(`${latest}T00:00:00+09:00`).getTime();
  const minTime = latestTime - 6 * 24 * 60 * 60 * 1000;
  return dated.filter((article) => {
    const time = new Date(`${articlePeriodDateKey(article)}T00:00:00+09:00`).getTime();
    return time >= minTime && time <= latestTime;
  });
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
        relatedSources: sources.length > 1 ? `외 ${sources.length - 1}곳` : "",
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
    .replace(/\b(단독|종합|속보|영상|포토|인터뷰|기획|칼럼)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleTokens(value) {
  const stop = new Set(["기자", "뉴스", "보도", "관련", "통해", "대한", "위해", "올해", "지난", "이번"]);
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

function articleTimeValue(article) {
  const dateKey = articlePeriodDateKey(article);
  const value = article.pubDate || article.pub_date || article.publishedAt || article.published_at || `${dateKey || ""}T${article.time || "00:00"}:00+09:00`;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function articlePublishedTimeValue(article = {}) {
  const value = article.pubDate || article.pub_date || article.publishedAt || article.published_at;
  if (value) {
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  if (article.publishedDate) {
    const time = new Date(`${article.publishedDate}T${article.time || "00:00"}:00+09:00`).getTime();
    if (!Number.isNaN(time)) return time;
  }
  const dateKey = articlePeriodDateKey(article);
  if (dateKey) {
    const time = new Date(`${dateKey}T${article.time || "00:00"}:00+09:00`).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
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

function isOwnArticle(article) {
  return article.category === "당사" || /인카금융|인카금융서비스/i.test(`${article.title} ${article.keyword} ${article.summary}`);
}

function isRegulatorArticle(article) {
  return /금융감독원|금융위원회/.test(article.source || "") || /금융당국 보도자료/.test(`${article.keyword || ""} ${article.summary || ""}`);
}

function isRegulatorRelatedNewsArticle(article = {}) {
  if (isRegulatorArticle(article)) return false;
  const text = `${article.title || ""} ${article.source || ""} ${article.keyword || ""} ${article.summary || ""} ${article.category || ""}`;
  const authoritySignal = /금융감독원|금감원|금융위원회|금융위|금융당국|감독원|당국|검사|제재|감독|규제|경영개선|수수료|정착지원금|내부통제|불완전판매|소비자보호/.test(text);
  const insuranceSignal = /보험|손보|생보|보험사|보험대리점|GA|설계사|모집|인카금융|인카금융서비스/.test(text);
  return authoritySignal && insuranceSignal;
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

createRoot(document.getElementById("root")).render(<App />);
