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
  media: LineChart,
  scraps: Bookmark,
  risk: ShieldCheck,
  reports: FileText,
  management: Settings,
};

const chartColors = ["#2855d9", "#14805f", "#b45309", "#6d5bd0", "#64748b"];

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

  const View = {
    overview: Overview,
    monitoring: Monitoring,
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

function Overview({ data, articles, jobs, notifications, setActiveSection, onOpenMonitoring }) {
  const { summary } = data;
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
          <Panel title="주요 이슈" icon={Newspaper} meta="키워드 기준 5분 갱신">
            <IssueList issues={data.issues} />
          </Panel>
        </div>
        <div className="middle-column">
          <Panel title="분류별 기사량" icon={LineChart} meta="기간 기준">
            <CategoryChart rows={data.categoryFlow} />
          </Panel>
          <Panel title="언론사 영향도" icon={Building2} meta="노출량 · 당사 · 부정">
            <PressInfluence rows={data.pressInfluence} />
          </Panel>
        </div>
        <div className="side-column">
          <WatchPanel jobs={jobs} risk={summary.risk} />
          <Panel title="알림톡 발송 이력" icon={Bell} meta="더보기">
            <NotificationList rows={notifications.slice(0, 5)} />
          </Panel>
          <Panel title="보고서 자동화" icon={CalendarDays} meta="스케줄">
            <JobRows rows={jobs} />
          </Panel>
        </div>
      </section>

    </main>
  );
}

function Monitoring({ data, articles, monitoringPreset }) {
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [tone, setTone] = useState("all");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [viewMode, setViewMode] = useState("related");
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
    setVisible(30);
  }, [monitoringPreset]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((article) => {
      const text = `${article.title} ${article.source} ${article.keyword} ${article.summary}`.toLowerCase();
      return (
        (!needle || text.includes(needle)) &&
        (tone === "all" || article.tone === tone) &&
        (category === "all" || article.category === category) &&
        (source === "all" || article.source === source)
      );
    });
  }, [articles, category, query, source, tone]);
  const grouped = useMemo(() => buildRelatedArticleGroups(filtered), [filtered]);
  const visibleRows = viewMode === "related" ? grouped : filtered;
  const feedMeta = viewMode === "related"
    ? `${filtered.length.toLocaleString("ko-KR")}건 · 묶음 ${grouped.length.toLocaleString("ko-KR")}개`
    : `${filtered.length.toLocaleString("ko-KR")}건`;

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Live Monitoring"
        title="실시간 모니터링"
        description="기사 목록을 샘플 5개로 줄이지 않고, 연결 가능한 운영 기사 전체를 필터와 함께 펼쳐 봅니다."
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
          <Search />검색
        </button>
        <button className="ghost-button" onClick={() => {
          setQuery("");
          setQueryInput("");
          setTone("all");
          setCategory("all");
          setSource("all");
          setViewMode("related");
        }}>
          <Filter />초기화
        </button>
      </section>
      <section className="monitoring-layout">
        <Panel title="수집 기사 피드" icon={Newspaper} meta={feedMeta}>
          <ArticleFeed rows={visibleRows.slice(0, visible)} />
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
        eyebrow="최근 1개월 분석"
        title="미디어 분석 리포트"
        description="일별 긍정·부정·주의 추이, 언론사 영향도, 키워드별 기사량, 월간 핵심 이슈를 함께 봅니다."
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
      <section className="content-grid two">
        <Panel title="일별 논조 추이" icon={Activity} meta="최근 31일 · 긍정/부정/주의">
          <ToneTrend rows={dailyTrend} />
        </Panel>
        <Panel title="언론사 영향도" icon={Building2} meta="관리 확인 필요 매체">
          <PressInfluence rows={data.pressInfluence} detailed onOpenMonitoring={onOpenMonitoring} />
        </Panel>
        <Panel title="키워드별 기사량" icon={LineChart} meta="선정 키워드 10개">
          <CategoryChart rows={keywordRows} tall onOpenMonitoring={onOpenMonitoring} drillBy="keyword" labelWidth={132} />
        </Panel>
        <Panel title="월간 핵심 이슈" icon={Newspaper} meta={`${issueRows.length}건`}>
          <MonthlyIssueDigest issues={issueRows} />
        </Panel>
        <Panel title="월간 관찰 코멘트" icon={Gauge} meta="핵심 흐름 요약">
          <InsightList insights={observations} />
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
            <ReportMetricBoard summary={summary} onOpenMonitoring={onOpenMonitoring} />
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
              <section className="paper-section ledger-page">
                <div className="paper-section-head">
                  <span>Desk Ledger</span>
                  <b>누적 관리 항목</b>
                </div>
                <ReportLedger articles={reportArticles} />
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

function ReportMetricBoard({ summary, onOpenMonitoring }) {
  const stats = [
    { label: "수집", value: summary.collected.toLocaleString("ko-KR"), preset: {} },
    { label: "분석", value: summary.analyzed.toLocaleString("ko-KR"), preset: {} },
    { label: "당사", value: summary.ownMentions, preset: { category: "당사" } },
    { label: "GA/보험사", value: summary.gaInsurance, preset: { category: "GA" } },
  ];
  return (
    <section className="report-metric-board">
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

function ReportLedger({ articles }) {
  const rows = [
    { label: "당사 직접 언급", value: articles.filter(isOwnArticle).length, preset: "당사" },
    { label: "부정/주의 합산", value: articles.filter((item) => ["부정", "주의"].includes(item.tone)).length, preset: "리스크" },
    { label: "GA·보험사 동향", value: articles.filter((item) => ["GA", "보험사"].includes(item.category)).length, preset: "업계" },
    { label: "제외/노이즈 후보", value: articles.filter((item) => item.tone === "제외" || item.category === "제외").length, preset: "정제" },
  ];
  return (
    <div className="report-ledger">
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
      setAliasStatus("매핑 후보를 찾지 못했습니다. 언론사명을 직접 입력하세요.");
    } else {
      setAliasStatus("");
    }
  };

  const handleSaveAlias = async () => {
    const host = canonicalHost(aliasUrl);
    const cleanName = pressName.trim();
    if (!host || !cleanName) {
      setAliasStatus("URL/도메인과 언론사명을 모두 입력해야 합니다.");
      return;
    }
    const nextAliases = upsertAliasRow(localAliases, { host, press_name: cleanName });
    setLocalAliases(nextAliases);
    writeLocalRows(PRESS_ALIAS_DRAFT_KEY, nextAliases);
    try {
      await savePressAlias(host, cleanName);
      setAliasStatus("Supabase 저장 완료");
    } catch {
      setAliasStatus("현재 화면 반영 완료 · 운영 세션 연결 시 DB 저장");
    }
  };

  return (
    <Panel title="언론사 관리" icon={Building2} meta={`${managedRows.length.toLocaleString("ko-KR")}곳`}>
      <div className="operation-form media-alias-form">
        <label>
          <span>언론사 URL/도메인</span>
          <input
            value={aliasUrl}
            onChange={(event) => handleUrlChange(event.target.value)}
            placeholder="https://www.mk.co.kr/news/..."
          />
        </label>
        <label>
          <span>매핑 언론사명</span>
          <input
            value={pressName}
            onChange={(event) => setPressName(event.target.value)}
            placeholder="매일경제"
          />
        </label>
        <div className="operation-form-actions">
          <button className="ghost-button" onClick={() => handleUrlChange(aliasUrl)}>주소 매핑</button>
          <button className="primary-button" onClick={handleSaveAlias}>매핑 저장</button>
        </div>
        {aliasStatus && <p className="status-note">{aliasStatus}</p>}
      </div>
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
      status: row.status || "중립",
      contactDate: row.contactDate || row.date || "",
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
                    <button className="ghost-button" onClick={() => handleEditReporter(row)}>수정</button>
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
    { label: "GA/보험사", value: summary.gaInsurance, icon: Activity, tone: "positive", preset: { category: "GA" } },
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

function Panel({ title, icon: Icon, meta, children }) {
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
        {rest.slice(0, 3).map((issue) => (
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
                {hasRelated && <span className="related-badge">관련 {related.length}건</span>}
              </div>
              <span>{row.source} · {row.keyword || row.category} · {row.date || row.slot || ""}</span>
              {hasRelated && <span className="related-sources">{row.relatedSources}</span>}
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
            </div>
            {!compact && row.link && row.link !== "#" && (
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

function NotificationList({ rows }) {
  return (
    <div className="notification-list">
      {rows.map((item) => (
        <button key={item.id || `${item.time}-${item.type}`}>
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
    return buildDisconnectedPeriodData(base, "최근 24시간 기준 표시할 운영 기사가 없습니다.");
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
    scope: articles[0]?.date ? `${articles[0].date} 기준` : base.scope,
    issues: articles.length ? buildIssues(articles, base.issues) : [],
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
  const ownLead = articles.find(isOwnArticle);
  if (ownNegative > 0) {
    return `당사 부정 ${ownNegative}건이 확인됐습니다. 최신 당사 언급 기사 "${ownLead?.title || "확인 필요"}"를 우선 점검합니다.`;
  }
  if (ownMentions > 0) {
    return `당사 언급 ${ownMentions}건은 직접 부정보다 주의/시장성 이슈에 가깝습니다. 핵심 기사 "${ownLead?.title}"를 보고서에 포함합니다.`;
  }
  return `당사 직접 언급은 없습니다. 주의 ${caution}건과 GA/보험사 동향 ${articles.filter((item) => ["GA", "보험사"].includes(item.category)).length}건을 추적합니다.`;
}

function buildIssues(articles, fallback) {
  const important = [
    ...articles.filter((article) => isOwnArticle(article)),
    ...articles.filter((article) => ["부정", "주의"].includes(article.tone)),
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
  const lead = sentences[0] || cleanTitle || `${item.source || "언론"} 보도 기준 핵심 이슈입니다.`;
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
    .replace(/(\.\.\.|…)+$/g, "")
    .trim();
}

function splitSummarySentences(value) {
  const clean = cleanSummaryText(value);
  if (!clean) return [];
  return clean
    .split(/(?:[.!?。]\s+|(?:다|요|임|함)\.\s+)/)
    .map((sentence) => sentence.replace(/(\.\.\.|…)+$/g, "").trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 3);
}

function isGenericSummaryLine(value) {
  const text = cleanSummaryText(value);
  return (
    /키워드 기준으로 수집된 기사입니다/.test(text) ||
    /키워드로 수집됐습니다/.test(text) ||
    /기준 핵심만 요약했습니다/.test(text)
  );
}

function buildSummaryContextLine(item = {}) {
  const category = item.category || item.keyword || "키워드";
  if (isOwnArticle(item)) return "당사 직접 언급 기사로 보고서와 리스크 점검 근거에 우선 포함합니다.";
  if (["GA", "보험사"].includes(category)) return "보험사·GA 시장 흐름을 보여주는 업계 동향 기사로 분리합니다.";
  if (category === "정책/규제") return "정책·규제 변화가 영업 환경에 미칠 수 있는 영향을 확인합니다.";
  if (category === "제외") return "분석 대상에서 제외한 노이즈성 기사입니다.";
  return "";
}

function buildSummaryToneLine(item = {}) {
  if (item.tone === "부정") return "소비자 피해, 제재, 사칭, 법적 분쟁 등 직접 리스크 문맥이 있는지 확인이 필요합니다.";
  if (item.tone === "주의") return "직접 부정은 아니지만 시장 평가, 투자 의견, 규제성 신호로 따로 추적합니다.";
  if (item.tone === "긍정") return "우호 보도나 성과 맥락이 있어 홍보 활용 가능성을 검토할 수 있습니다.";
  return "";
}

function buildMonthlyObservations(data, issues = []) {
  const summary = data.summary || {};
  const lead = issues[0];
  const topPress = data.pressInfluence?.[0];
  const observations = [];
  if (summary.ownNegative > 0) {
    observations.push(`당사 부정 이슈 ${summary.ownNegative}건이 확인돼 월간 리스크 점검 대상으로 우선 배치했습니다.`);
  } else if (summary.ownMentions > 0) {
    observations.push(`당사 언급 ${summary.ownMentions}건은 직접 부정보다 시장 평가와 업계 흐름을 함께 확인하는 관찰 이슈로 봅니다.`);
  } else {
    observations.push("최근 1개월 기준 당사 직접 부정 이슈는 확인되지 않았고, 업계성 이슈 중심으로 흐름을 추적합니다.");
  }
  if (summary.caution > 0) {
    observations.push(`주의 이슈 ${summary.caution}건은 투자 의견, 수수료, 규제, GA 운영 이슈처럼 의사결정자가 확인할 만한 신호로 분리했습니다.`);
  }
  if (lead?.title) {
    observations.push(`대표 헤드라인은 "${lead.title}"이며, 월간 핵심 이슈 영역에서 기사 원문까지 바로 확인할 수 있습니다.`);
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
  const latest = dated.map((article) => article.date).sort().at(-1);
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
  const latest = dated.map((article) => article.date).sort().at(-1);
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
  const latest = dated.map((article) => article.date).sort().at(-1);
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

function filterRowsByPeriod(articles, period) {
  if (!articles.length) return [];
  const dated = articles.filter((article) => article.date);
  if (!dated.length) return articles;
  const latest = dated.map((article) => article.date).sort().at(-1);
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

function isOwnArticle(article) {
  return article.category === "당사" || /인카금융|인카금융서비스/i.test(`${article.title} ${article.keyword} ${article.summary}`);
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
