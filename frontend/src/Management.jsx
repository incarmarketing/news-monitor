import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Download,
  FilePenLine,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { keywordGroups } from "./data";
import {
  deleteReporterProfile,
  saveMediaRelation,
  saveMonitorKeyword,
  savePressAlias,
  saveReporterProfile,
} from "./liveData";

let managementHelpers = {};

function callHelper(name, fallback, ...args) {
  const fn = managementHelpers?.[name];
  return typeof fn === "function" ? fn(...args) : fallback(...args);
}

function HelperComponent({ name, fallback: Fallback = "div", props = {}, children }) {
  const Component = managementHelpers?.[name] || Fallback;
  return <Component {...props}>{children}</Component>;
}

function PageTitle(props) { return <HelperComponent name="PageTitle" props={props} />; }
function DataSourcePill(props) { return <HelperComponent name="DataSourcePill" fallback="span" props={props} />; }
function Panel(props) { return <HelperComponent name="Panel" fallback="section" props={props} />; }
function StatCard(props) { return <HelperComponent name="StatCard" fallback="article" props={props} />; }
function Chip({ children, tone }) { return <HelperComponent name="Chip" fallback="span" props={{ tone }}>{children}</HelperComponent>; }
function AdSpendChart(props) { return <HelperComponent name="AdSpendChart" fallback="div" props={props} />; }
function KeywordRuleValidation(props) { return <HelperComponent name="KeywordRuleValidation" fallback="div" props={props} />; }
function KeywordManagerTable(props) { return <HelperComponent name="KeywordManagerTable" fallback="div" props={props} />; }
function ArticleDecisionNote(props) { return <HelperComponent name="ArticleDecisionNote" fallback="span" props={props} />; }

function mergeMediaRows(...args) { return callHelper("mergeMediaRows", (rows = []) => rows || [], ...args); }
function normalizeMediaDraft(...args) { return callHelper("normalizeMediaDraft", (row = {}) => row, ...args); }
function upsertMediaLocal(...args) { return callHelper("upsertMediaLocal", (rows = [], row = {}) => [...rows, row], ...args); }
function domainsForPressName(...args) { return callHelper("domainsForPressName", () => [], ...args); }
function mergeReporterRows(...args) { return callHelper("mergeReporterRows", (rows = []) => rows || [], ...args); }
function normalizeReporterDraft(...args) { return callHelper("normalizeReporterDraft", (row = {}) => row, ...args); }
function reporterDraftFromRemote(...args) { return callHelper("reporterDraftFromRemote", (row = {}) => row, ...args); }
function upsertReporterLocal(...args) { return callHelper("upsertReporterLocal", (state = {}) => state, ...args); }
function hideReporterLocal(...args) { return callHelper("hideReporterLocal", (state = {}) => state, ...args); }
function buildAdSpendData(...args) { return callHelper("buildAdSpendData", () => ({ monthly: [], media: [], type: [] }), ...args); }
function formatMoney(...args) { return callHelper("formatMoney", (value = 0) => `${Number(value || 0).toLocaleString("ko-KR")}원`, ...args); }
function unique(...args) { return callHelper("unique", (values = []) => Array.from(new Set(values)), ...args); }
function printAdReport(...args) { return callHelper("printAdReport", () => {}, ...args); }
function keywordRowsFromGroups(...args) { return callHelper("keywordRowsFromGroups", () => [], ...args); }
function mergeKeywordRows(...args) { return callHelper("mergeKeywordRows", (remoteRows = [], localRows = []) => [...remoteRows, ...localRows], ...args); }
function buildKeywordRuleValidation(...args) { return callHelper("buildKeywordRuleValidation", () => ({}), ...args); }
function upsertKeywordRow(...args) { return callHelper("upsertKeywordRow", (rows = [], row = {}) => [...rows, row], ...args); }
function keywordCategoryLabel(...args) { return callHelper("keywordCategoryLabel", (value = "") => value, ...args); }
function keywordSubcategoryLabel(...args) { return callHelper("keywordSubcategoryLabel", (value = "") => value, ...args); }
function keywordCategoryRule(...args) { return callHelper("keywordCategoryRule", () => "", ...args); }
function keywordCategoryTone(...args) { return callHelper("keywordCategoryTone", () => "중립", ...args); }
function keywordMatchModeLabel(...args) { return callHelper("keywordMatchModeLabel", (value = "") => value, ...args); }
function keywordEntityTypeLabel(...args) { return callHelper("keywordEntityTypeLabel", (value = "") => value, ...args); }
function keywordMatchTargetLabel(...args) { return callHelper("keywordMatchTargetLabel", (value = "") => value, ...args); }
function keywordDefaultToneLabel(...args) { return callHelper("keywordDefaultToneLabel", (value = "") => value, ...args); }
function splitKeywordTerms(...args) { return callHelper("splitKeywordTerms", (value = "") => String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean), ...args); }
function buildFeedbackRuleCandidates(...args) { return callHelper("buildFeedbackRuleCandidates", () => [], ...args); }
function formatFeedbackStamp(...args) { return callHelper("formatFeedbackStamp", (value = "") => String(value || "").slice(0, 16), ...args); }
function openArticleLink(...args) { return callHelper("openArticleLink", () => {}, ...args); }
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

export default function Management({ management, operations, onRefreshOperations, isWorking, helpers = {} }) {
  managementHelpers = helpers;
  const [tab, setTab] = useState("media");
  const tabs = [
    ["media", "언론사 관리", Building2],
    ["reporters", "기자 관리", Users],
    ["ads", "광고비 관리", WalletCards],
    ["keywords", "키워드 문맥", Settings],
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
      <section className="admin-crud-panel admin-crud-panel-top-tabs">
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
          {tab === "keywords" && <KeywordManagement keywords={operations.keywords || []} articles={operations.articles || []} />}
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

function KeywordManagement({ keywords = [], articles = [] }) {
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("own");
  const [subcategory, setSubcategory] = useState("");
  const [entityType, setEntityType] = useState("keyword");
  const [isSearchKeyword, setIsSearchKeyword] = useState(true);
  const [requireArticleMention, setRequireArticleMention] = useState(false);
  const [matchTarget, setMatchTarget] = useState("title_summary");
  const [matchMode, setMatchMode] = useState("keyword");
  const [contextTerms, setContextTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [defaultTone, setDefaultTone] = useState("neutral");
  const [analysisExcluded, setAnalysisExcluded] = useState(false);
  const [priority, setPriority] = useState(100);
  const [memo, setMemo] = useState("");
  const [editingKey, setEditingKey] = useState("");
  const [editingOriginal, setEditingOriginal] = useState(null);
  const [status, setStatus] = useState("");
  const [draftKeywords, setDraftKeywords] = useState([]);
  const isEditing = Boolean(editingKey);
  const rows = useMemo(
    () => mergeKeywordRows(keywords.length ? keywords : keywordRowsFromGroups(), draftKeywords),
    [keywords, draftKeywords],
  );
  const validation = useMemo(() => buildKeywordRuleValidation(rows, articles), [rows, articles]);

  const resetKeywordForm = ({ clearStatus = true } = {}) => {
    setKeyword("");
    setCategory("own");
    setSubcategory("");
    setEntityType("keyword");
    setIsSearchKeyword(true);
    setRequireArticleMention(false);
    setMatchTarget("title_summary");
    setMatchMode("keyword");
    setContextTerms("");
    setExcludeTerms("");
    setDefaultTone("neutral");
    setAnalysisExcluded(false);
    setPriority(100);
    setMemo("");
    setEditingKey("");
    setEditingOriginal(null);
    if (clearStatus) setStatus("");
  };

  const handleEditKeyword = (row) => {
    const normalized = normalizeKeywordRow(row);
    if (!normalized) return;
    setEditingKey(keywordRowIdentity(normalized));
    setEditingOriginal({ keyword: normalized.keyword, category: normalized.category });
    setKeyword(normalized.keyword);
    setCategory(normalized.category);
    setSubcategory(normalized.subcategory || "");
    setEntityType(normalized.entityType || "keyword");
    setIsSearchKeyword(normalized.isSearchKeyword !== false);
    setRequireArticleMention(normalized.requireArticleMention === true);
    setMatchTarget(normalized.matchTarget || "title_summary");
    setMatchMode(normalized.matchMode);
    setContextTerms((normalized.contextTerms || []).join(", "));
    setExcludeTerms((normalized.excludeTerms || []).join(", "));
    setDefaultTone(normalized.defaultTone || "neutral");
    setAnalysisExcluded(normalized.analysisExcluded === true);
    setPriority(normalized.priority || 100);
    setMemo(normalized.memo || "");
    setStatus(`${normalized.keyword} 분류 기준을 수정 중입니다. 상위 구분도 변경할 수 있습니다.`);
  };

  const handleAddKeyword = async () => {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      setStatus("추가할 키워드를 입력하세요.");
      return;
    }
    const nextKeyword = {
      keyword: cleanKeyword,
      category,
      subcategory: subcategory.trim(),
      entityType,
      enabled: true,
      isSearchKeyword,
      requireArticleMention,
      matchTarget,
      matchMode,
      contextTerms: splitKeywordTerms(contextTerms),
      excludeTerms: splitKeywordTerms(excludeTerms),
      defaultTone,
      analysisExcluded,
      priority: Number(priority) || 100,
      memo: memo.trim(),
    };
    if (isEditing && editingOriginal) {
      nextKeyword.previousKeyword = editingOriginal.keyword;
      nextKeyword.previousCategory = editingOriginal.category;
    }
    try {
      await saveMonitorKeyword(nextKeyword);
      setDraftKeywords((current) => {
        let nextRows = current;
        if (
          isEditing
          && editingOriginal
          && (editingOriginal.keyword !== nextKeyword.keyword || editingOriginal.category !== nextKeyword.category)
        ) {
          nextRows = upsertKeywordRow(nextRows, { ...editingOriginal, enabled: false });
        }
        return upsertKeywordRow(nextRows, nextKeyword);
      });
      resetKeywordForm({ clearStatus: false });
      setStatus(isEditing ? "문맥 조건 수정 저장 완료" : "운영 DB 저장 완료");
    } catch (error) {
      setStatus(error?.message?.includes("missing_dashboard_session") || error?.message?.includes("invalid_session")
        ? "운영 DB 세션이 필요합니다. 로그인 후 다시 저장하세요."
        : "운영 DB 저장 실패 · 연결과 권한을 확인하세요.");
    }
  };

  return (
    <section className="keyword-management-shell keyword-management-single">
      <Panel title="분류 기준 관리" icon={ShieldCheck} meta={`${rows.length.toLocaleString("ko-KR")}개 · 키워드/문맥 원장`}>
        <div className="keyword-ledger-editor">
          <div className="keyword-ledger-editor-head">
            <b>{isEditing ? "키워드 조건 수정" : "새 키워드 추가"}</b>
            <span>{isEditing ? "선택한 원장 행의 문맥 조건을 수정합니다." : "검색 키워드와 문맥 조건을 원장에 추가합니다."}</span>
          </div>
          <div className={`operation-form keyword-add-form${isEditing ? " is-editing" : ""}`}>
            <label>
              <span>상위 구분</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {keywordCategories.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>세부 구분</span>
              <input
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
                placeholder="예: 직접언급, 브랜드평판, 감독정책"
              />
            </label>
            <label>
              <span>키워드</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                disabled={isEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAddKeyword();
                }}
                placeholder="예: 글로벌금융판매"
              />
            </label>
            <label>
              <span>개체 유형</span>
              <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
                {keywordEntityTypes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>매칭 대상</span>
              <select value={matchTarget} onChange={(event) => setMatchTarget(event.target.value)}>
                {keywordMatchTargets.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>매칭 방식</span>
              <select value={matchMode} onChange={(event) => setMatchMode(event.target.value)}>
                {keywordMatchModes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>포함 문맥</span>
              <input
                value={contextTerms}
                onChange={(event) => setContextTerms(event.target.value)}
                placeholder="예: 보험, GA, 설계사"
              />
            </label>
            <label>
              <span>제외 문맥</span>
              <input
                value={excludeTerms}
                onChange={(event) => setExcludeTerms(event.target.value)}
                placeholder="예: 메가커피, 메가박스"
              />
            </label>
            <label>
              <span>검색어 여부</span>
              <select value={isSearchKeyword ? "yes" : "no"} onChange={(event) => setIsSearchKeyword(event.target.value === "yes")}>
                <option value="yes">검색에 사용</option>
                <option value="no">분류에만 사용</option>
              </select>
            </label>
            <label>
              <span>본문 등장</span>
              <select value={requireArticleMention ? "required" : "optional"} onChange={(event) => setRequireArticleMention(event.target.value === "required")}>
                <option value="optional">선택</option>
                <option value="required">필수</option>
              </select>
            </label>
            <label>
              <span>기본 논조</span>
              <select value={defaultTone} onChange={(event) => setDefaultTone(event.target.value)}>
                {keywordDefaultTones.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>분석 포함</span>
              <select value={analysisExcluded ? "exclude" : "include"} onChange={(event) => setAnalysisExcluded(event.target.value === "exclude")}>
                <option value="include">포함</option>
                <option value="exclude">제외</option>
              </select>
            </label>
            <label className="compact-field">
              <span>우선순위</span>
              <input
                type="number"
                min="1"
                max="999"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
            </label>
            <label className="keyword-memo-field">
              <span>운영 메모</span>
              <input
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="예: 보험/GA 문맥에서만 사용, 스포츠·행사 기사 제외"
              />
            </label>
            <div className="operation-form-actions">
              <button className="primary-button" onClick={handleAddKeyword}>{isEditing ? "수정 저장" : "키워드 추가"}</button>
              {isEditing && <button className="ghost-button keyword-edit-cancel" onClick={() => resetKeywordForm()}>취소</button>}
            </div>
            {status && <p className="status-note">{status}</p>}
          </div>
        </div>
        <KeywordRuleValidation validation={validation} />
        <KeywordManagerTable rows={rows} onEdit={handleEditKeyword} />
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

