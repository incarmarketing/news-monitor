import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { getStoredSession, loadClassificationMaintenance } from "./liveData";
import { safeArticleUrl } from "./mediaRegistryModel.mjs";
import { auditLabel, auditPercent, auditStamp } from "./classificationAuditModel.mjs";
import "./classificationAudit.css";

function Decision({ value = {} }) {
  return <span className="audit-decision"><strong>{auditLabel(value.category)}</strong><span>{auditLabel(value.tone)}</span>
    {value.own_mentioned && <small>당사 언급</small>}{value.alert_eligible && <small>부정 경보 대상</small>}</span>;
}

export default function ClassificationMaintenance() {
  const [query, setQuery] = useState({ runId: "", mode: "reviews", offset: 0, revision: 0 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const allowed = ["admin", "editor"].includes(getStoredSession()?.role);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true); setError("");
    loadClassificationMaintenance(query.runId, query.mode, query.offset)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) { setData(null); setError("분류 점검 이력을 불러오지 못했습니다. 로그인 상태와 연결을 확인해 주세요."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, query]);
  if (!allowed) return <section className="classification-audit"><h2>분류 점검</h2><p role="status">관리자 또는 편집자 로그인이 필요한 운영 기록입니다.</p></section>;
  const changeQuery = (patch) => { const runId = data?.run?.run_id; setData(null); setQuery((value) => ({ ...value, runId: runId || value.runId, offset: 0, ...patch })); };
  const run = data?.run;
  const gate = run?.gate || {};
  const failures = Array.isArray(gate.failures) ? gate.failures : [];
  return <section className="classification-audit" aria-busy={loading}>
    <div className="audit-toolbar"><h2><ShieldCheck size={20} />분류 점검</h2>
      <label>점검 이력 <select aria-label="점검 이력" value={query.runId || ""} disabled={loading} onChange={(event) => changeQuery({ runId: event.target.value })}>
        <option value="">최신 점검</option>{data?.runs?.map((item) => <option key={item.run_id} value={item.run_id}>{auditStamp(item.generated_at || item.created_at)} · {auditLabel(item.status)}</option>)}
      </select></label>
      <button type="button" title="분류 점검 이력 새로고침" aria-label="분류 점검 이력 새로고침" disabled={loading} onClick={() => changeQuery({ revision: query.revision + 1 })}><RefreshCw size={18} /></button>
    </div>
    {loading && <p role="status">점검 기록을 불러오는 중입니다.</p>}
    {error && <p role="alert" className="audit-warning">{error}</p>}
    {!loading && !error && !run && <p>아직 등록된 분류 점검 이력이 없습니다.</p>}
    {run && <>
      <dl className="audit-summary">
        <div><dt>마지막 점검</dt><dd>{auditStamp(run.generated_at || run.created_at)}</dd></div>
        <div><dt>점검 기사</dt><dd>{run.row_count ?? "-"}건</dd></div>
        <div><dt>재검토 후보</dt><dd>{run.review_count ?? "-"}건</dd></div>
        <div><dt>실제 보정</dt><dd>{run.applied_count ?? 0}건</dd></div>
        <div><dt>처리 상태</dt><dd>{auditLabel(run.status)}</dd></div>
      </dl>
      {(run.block_reason || failures.length > 0) && <div className="audit-warning" role="status"><strong>{auditLabel(run.block_reason)}</strong>
        <span>{failures.map(auditLabel).join(" · ")}</span></div>}
      <div className="audit-quality"><div><h3>검증 결과</h3><p>표본 {gate.case_count ?? 0}건 · 부정 {Number(gate.alert_confusion?.true_positive || 0) + Number(gate.alert_confusion?.false_negative || 0)}건</p></div>
        <div className="audit-table-wrap"><table><thead><tr><th>항목</th><th>결과</th><th>통과 기준</th></tr></thead><tbody>
          {["category_accuracy", "tone_accuracy", "exact_accuracy", "alert_precision", "alert_recall"].map((key) => <tr key={key}><th scope="row">{auditLabel(key)}</th><td>{auditPercent(gate[key])}</td><td>{auditPercent(gate.thresholds?.[key])}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="audit-toolbar"><div className="audit-modes" role="group" aria-label="점검 항목">
        {[ ["reviews", "재검토 후보"], ["candidates", "자동 보정 후보"], ["repairs", "실제 보정 이력"] ].map(([mode, label]) => <button key={mode} aria-pressed={query.mode === mode} disabled={loading} onClick={() => changeQuery({ mode })}>{label}</button>)}
      </div><span>{data.total}건</span></div>
      <div className="audit-table-wrap"><table className="audit-articles"><thead><tr><th>기사</th><th>기존</th><th aria-label="변경 방향"></th><th>{query.mode !== "repairs" ? "재검토 결과" : "보정 후"}</th><th>근거·처리</th></tr></thead><tbody>
        {data.items.map((item) => <tr key={item.id}><td>{safeArticleUrl(item.link) ? <a href={safeArticleUrl(item.link)} target="_blank" rel="noopener noreferrer">{item.title || "제목 미기록"}<ExternalLink size={14} /></a> : item.title}<small>{item.source || "언론사 미기록"} · #{item.id}</small></td>
          <td><Decision value={item.before} /></td><td><ArrowRight size={16} /></td><td><Decision value={item.proposed} /></td>
          <td>{query.mode !== "repairs" && <strong>{auditLabel(item.evidence_status)}{item.protected ? " · 자동 변경 제외" : ""}</strong>}<p>{item.reason || "근거 미기록"}</p>{item.source_excerpt && <small>{item.source_excerpt}</small>}</td></tr>)}
        {!data.items.length && <tr><td colSpan={5}>{query.mode !== "repairs" ? "이 점검의 검토 후보가 없습니다." : "이 점검에서 실제로 변경한 기사가 없습니다."}</td></tr>}
      </tbody></table></div>
      <footer className="audit-pagination"><span>{data.total ? `${data.offset + 1}–${Math.min(data.offset + data.page_size, data.total)} / ${data.total}` : "0건"}</span>
        <button title="이전 페이지" aria-label="이전 페이지" disabled={loading || data.offset === 0} onClick={() => changeQuery({ offset: Math.max(0, data.offset - 25) })}><ChevronLeft size={18} /></button>
        <button title="다음 페이지" aria-label="다음 페이지" disabled={loading || data.offset + 25 >= data.total} onClick={() => changeQuery({ offset: data.offset + 25 })}><ChevronRight size={18} /></button>
      </footer>
    </>}
  </section>;
}
