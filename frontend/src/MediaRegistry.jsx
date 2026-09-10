import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search } from "lucide-react";
import { loadMediaRegistry, saveArticlePublisher, savePressAlias } from "./liveData";
import { registryError, registryRows, safeArticleUrl } from "./mediaRegistryModel.mjs";
import { displayHeadline } from "./publisherIdentity.js";
import "./mediaRegistry.css";

const date = (value) => value ? new Date(value).toLocaleDateString("ko-KR") : "-";
const statuses = { pending: "확인 대기", not_found: "기자명 미확인", needs_original: "원문 주소 필요", fetch_failed: "원문 접속 실패", verified: "확인 완료" };

export default function MediaRegistry({ children, reportersOnly = false, onSummary }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(reportersOnly ? "reporters" : "media");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState(null);
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try { const next = await loadMediaRegistry(); setData(next); onSummary?.(next); }
    catch { setError("누적 이력을 불러오지 못했습니다. 다시 조회해 주세요."); }
    finally { setBusy(false); }
  }, [onSummary]);
  useEffect(() => { refresh(); }, [refresh]);
  const rows = useMemo(() => registryRows(data, mode, query), [data, mode, query]);
  const mediaAuthors = useMemo(() => {
    const map = new Map();
    (data?.reporters || []).forEach((row) => map.set(row.media, [...(map.get(row.media) || []), row.name]));
    return map;
  }, [data]);
  const tabs = reportersOnly ? [["reporters", "작성 기자"], ["manual", "연락처·관리 정보"]]
    : [["media", "당사 보도 매체"], ["unknown", "언론사 미확인"], ["manual", "관리 정보"]];
  function chooseMode(next) { setMode(next); setPage(0); setQuery(""); setSelection(null); }
  function open(row) {
    setSelection(mode === "unknown" ? { mode: "unknown", key: row.host, title: row.host || "주소 미확인", portal: row.portal }
      : mode === "reporters" ? { mode: "reporter", key: JSON.stringify([row.media, row.name]), title: `${row.media} · ${row.name}` }
      : { mode: "media", key: row.name, title: row.name });
  }
  return <section className="media-registry" aria-label={reportersOnly ? "누적 기자 이력" : "누적 언론사 이력"}>
    <div className="registry-tabs" role="tablist">
      {tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={mode === key} className={mode === key ? "active" : ""} onClick={() => chooseMode(key)} key={key}>{label}{key === "unknown" && data && <span>{data.unknown.reduce((sum, row) => sum + row.article_count, 0)}</span>}</button>)}
    </div>
    {mode === "manual" ? children : selection ? <RegistryDetail key={`${selection.mode}:${selection.key}`} selection={selection} onBack={() => setSelection(null)} onSaved={refresh} /> : <>
      <div className="registry-toolbar">
        <div><h2>{reportersOnly ? "당사 보도 작성 기자" : mode === "unknown" ? "언론사 확인 대기" : "당사 보도 매체"}</h2>
          {data && <p>누적 당사 언급 {data.own_articles.toLocaleString()}건 · {date(data.as_of)} 기준</p>}</div>
        <label className="registry-search"><Search size={16} /><input aria-label="언론사·기자 검색" placeholder={mode === "unknown" ? "주소 검색" : "언론사·기자 검색"} value={query} onChange={(e) => {setQuery(e.target.value); setPage(0);}} /></label>
        <button type="button" className="registry-icon" title="누적 이력 새로고침" aria-label="누적 이력 새로고침" onClick={refresh} disabled={busy}><RefreshCw size={18} /></button>
      </div>
      {error && <p role="alert" className="registry-error">{error}</p>}
      {!data ? <p className="registry-empty" role="status">{busy ? "누적 이력 조회 중" : "조회 결과 없음"}</p> : <>
        <div className="registry-table-wrap"><table><thead><tr>
          <th>{mode === "unknown" ? "미확인 주소" : mode === "reporters" ? "기자" : "언론사"}</th>
          <th>{mode === "unknown" ? "당사 언급" : mode === "reporters" ? "언론사" : "작성 기자"}</th>
          <th>기사 수</th><th>최근 보도</th><th>이력</th>
        </tr></thead><tbody>{rows.slice(page * 20, (page + 1) * 20).map((row) => <tr key={mode === "unknown" ? row.host : `${row.media || ""}:${row.name}`}>
          <td><strong>{row.name || row.host || "주소 미확인"}</strong>{row.portal && <small>기사별 확인</small>}</td>
          <td>{mode === "unknown" ? `${row.own_count}건` : mode === "reporters" ? row.media : <>
            <span title={(mediaAuthors.get(row.name) || []).join(", ")}>{(mediaAuthors.get(row.name) || []).slice(0,2).join(", ") || "확인 필요"}{(mediaAuthors.get(row.name)?.length || 0) > 2 ? ` 외 ${mediaAuthors.get(row.name).length - 2}명` : ""}</span>
            <small>확인 {row.verified_count} / {row.article_count}건</small></>}</td>
          <td>{row.article_count.toLocaleString()}건</td><td>{date(row.last_at)}</td>
          <td><button type="button" className="registry-icon" title="기사 이력 보기" aria-label={`${row.name || row.host || "미확인"} 기사 이력 보기`} onClick={() => open(row)}><ChevronRight size={18} /></button></td>
        </tr>)}</tbody></table></div>
        {!rows.length && <p className="registry-empty">{query ? "검색 결과가 없습니다." : mode === "unknown" ? "확인 대기 중인 언론사가 없습니다." : "확인된 이력이 없습니다."}</p>}
        <RegistryPager offset={page * 20} count={rows.length} size={20} onPage={(offset) => setPage(offset / 20)} />
      </>}
    </>}
  </section>;
}

function RegistryPager({ offset, count, size, onPage }) {
  return <div className="registry-pager"><span>{count ? offset + 1 : 0}–{Math.min(offset + size, count)} / {count.toLocaleString()}</span>
    <button type="button" className="registry-icon" aria-label="이전 페이지" disabled={!offset} onClick={() => onPage(offset - size)}><ChevronLeft size={18} /></button>
    <button type="button" className="registry-icon" aria-label="다음 페이지" disabled={offset + size >= count} onClick={() => onPage(offset + size)}><ChevronRight size={18} /></button></div>;
}

function RegistryDetail({ selection, onBack, onSaved }) {
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    loadMediaRegistry(selection.mode, selection.key, offset).then((value) => { if (active) setData(value); })
      .catch(() => { if (active) setError("기사 이력을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [selection.mode, selection.key, offset, revision]);
  const saved = () => { setOffset(0); setRevision((value) => value + 1); onSaved(); };
  return <div>
    <div className="registry-toolbar"><button type="button" className="registry-icon" aria-label="목록으로" onClick={onBack}><ArrowLeft size={18} /></button><h2>{selection.title}</h2>
      <button type="button" className="registry-icon" aria-label="기사 이력 새로고침" onClick={() => setRevision((v) => v + 1)}><RefreshCw size={18} /></button></div>
    {selection.mode === "unknown" && !selection.portal && <PublisherResolve host={selection.key} onSaved={saved} />}
    {error && <p role="alert" className="registry-error">{error}</p>}
    {!data && !error && <p className="registry-empty" role="status">기사 이력 조회 중</p>}
    {data && <><ul className="registry-articles">{data.rows.map((row) => <li key={row.article_hash}>
      <div className="registry-article-meta"><span>{date(row.pub_date)}</span><span>{row.source}</span>{row.own_mentioned && <span>당사 언급</span>}</div>
      <a className="registry-headline" href={safeArticleUrl(row.link) || undefined} target="_blank" rel="noreferrer">{displayHeadline(row)}<ExternalLink size={15} /></a>
      <div className="registry-evidence"><span>기자: {row.authors.map((author) => author.name).join(", ") || statuses[row.byline_status] || "미확인"}</span>
        {row.checked_at && <span>{date(row.checked_at)} 확인</span>}
        {safeArticleUrl(row.evidence_url) && <a href={safeArticleUrl(row.evidence_url)} target="_blank" rel="noreferrer">확인 출처 <ExternalLink size={13} /></a>}</div>
      {selection.mode === "unknown" && selection.portal && <PublisherResolve articleHash={row.article_hash} onSaved={saved} />}
    </li>)}</ul>
      {!data.rows.length && <p className="registry-empty">표시할 기사가 없습니다.</p>}
      <RegistryPager offset={offset} count={data.total} size={30} onPage={setOffset} />
    </>}
  </div>;
}

function PublisherResolve({ host, articleHash, onSaved }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (articleHash) await saveArticlePublisher(articleHash, name); else await savePressAlias(host, name);
      setMessage("언론사 확정 완료"); setName(""); onSaved();
    } catch (error) { setMessage(registryError(error)); }
    finally { setBusy(false); }
  }
  return <form className="registry-resolve" onSubmit={submit}>
    <label><span>{articleHash ? "이 기사 언론사" : "해당 주소 언론사"}</span><input value={name} aria-label="확정 언론사명" placeholder="확인한 언론사명" maxLength={100} required onChange={(e) => setName(e.target.value)} /></label>
    <button type="submit" disabled={busy || !name.trim()}><Check size={16} />{busy ? "저장 중" : "확정"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
