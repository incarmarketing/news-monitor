import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import AppSelect from "./AppSelect.jsx";
import MediaSkeleton from "./MediaSkeleton.jsx";
import { displayHeadline, resolvePublisher } from "./publisherIdentity.js";
import { mediaArticleDate, mediaArticleKey, mediaArticleUrl, mediaIssueArticles, mediaIssuePage } from "./mediaIssueModel.js";
import "./media-issues.css";

export default function MediaIssueDigest({ issues = [], loading = false, error = "" }) {
  const [selection, setSelection] = useState(null);
  const opener = useRef(null);
  const fallback = useRef(null);
  return <div className="media-issue-view" ref={fallback} tabIndex={-1}>
    {loading ? <MediaSkeleton kind="issues" /> : error ? <p className="empty-list-note" role="status">선택 기간 조회를 완료하지 못했습니다.</p> : !issues.length ? <p className="empty-list-note">선택 기간에 표시할 주요 이슈가 없습니다.</p> : <div className="media-issue-digest">
      {issues.map((issue, index) => {
        const rows = mediaIssueArticles(issue);
        const href = mediaArticleUrl(issue);
        const headline = displayHeadline(issue);
        return <article className="media-issue-entry" data-article-count={rows.length} key={issue.eventKey || mediaArticleKey(issue)}>
          <div className="media-issue-kicker"><span className="media-issue-number">{String(index + 1).padStart(2, "0")}</span><span data-tone={issue.tone || "중립"}>{issue.tone || "중립"}</span><span>{issue.category || "이슈"}</span></div>
          <h3>{href ? <a href={href} target="_blank" rel="noopener noreferrer" title={headline}>{headline}</a> : headline}</h3>
          <div className="media-issue-footer"><span>{resolvePublisher({ ...issue, source: issue.representativeSource || issue.source })} · {mediaArticleDate(issue)}</span>
            {rows.length > 1 ? <button type="button" aria-label={`${headline} 기사 ${rows.length}건 보기`} onClick={event => { opener.current = event.currentTarget; setSelection({ issue, rows }); }}>기사 {rows.length.toLocaleString("ko-KR")}건<ChevronRight size={16} /></button> : <span className="media-issue-count">기사 {rows.length}건</span>}
          </div>
        </article>;
      })}
    </div>}
    {selection && <RelatedArticlesDrawer {...selection} onClose={() => setSelection(null)} opener={opener} fallback={fallback} />}
  </div>;
}

function RelatedArticlesDrawer({ issue, rows, onClose, opener, fallback }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  const scroll = useRef(null);
  const result = useMemo(() => mediaIssuePage(rows, { query, sort, page }), [rows, query, sort, page]);
  const representative = mediaArticleKey(issue);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => { node.close(); (opener.current?.isConnected ? opener.current : fallback.current)?.focus({ preventScroll: true }); };
  }, [opener, fallback]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [result.current, query, sort]);
  const changeQuery = value => { setQuery(value); setPage(1); };
  const trapFocus = event => {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus({ preventScroll: true });
    }
  };
  return createPortal(<dialog ref={dialog} className="media-related-drawer" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapFocus} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="media-related-heading"><div><span>관련 보도 · {rows.length.toLocaleString("ko-KR")}건</span><h2 id={titleId} title={displayHeadline(issue)}>{issue.eventLabel || displayHeadline(issue)}</h2></div><button type="button" className="icon-button" aria-label="관련 기사 닫기" title="닫기" autoFocus onClick={onClose}><X /></button></header>
    <div className="media-related-toolbar"><label><Search size={18} aria-hidden="true" /><input aria-label="관련 기사 검색" placeholder="제목·언론사" value={query} onChange={event => changeQuery(event.target.value)} />{query && <button type="button" aria-label="관련 기사 검색 초기화" title="검색 초기화" onClick={() => changeQuery("")}><X size={16} /></button>}</label><AppSelect aria-label="관련 기사 정렬" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="latest">최신순</option><option value="oldest">오래된순</option></AppSelect></div>
    <section className="media-related-content" ref={scroll} aria-label="관련 기사 목록">
      <div className="media-related-columns" aria-hidden="true"><span>언론사</span><span>작성일시</span><span>논조</span><span>기사 제목</span></div>
      <ul>{result.rows.map(article => {
        const href = mediaArticleUrl(article), headline = displayHeadline(article);
        const isRepresentative = mediaArticleKey(article) === representative || article.articleAliases?.some(alias => mediaArticleKey(alias) === representative);
        const content = <><span className="media-related-publisher">{resolvePublisher(article)}</span><time>{mediaArticleDate(article)}</time><span className="media-related-tone" data-tone={article.tone || "중립"}>{article.tone || "중립"}</span><span className="media-related-headline">{isRepresentative && <small>대표</small>}<b title={headline}>{headline}</b>{href && <ArrowUpRight size={17} aria-hidden="true" />}</span></>;
        return <li key={mediaArticleKey(article)}>{href ? <a className="media-related-row" href={href} target="_blank" rel="noopener noreferrer" title={headline}>{content}</a> : <div className="media-related-row" aria-label={`${headline} · 원문 주소 없음`}>{content}</div>}</li>;
      })}</ul>
      {!result.total && <p className="media-related-empty" role="status">검색 결과가 없습니다.</p>}
    </section>
    <footer className="media-related-footer"><span role="status">{result.start}–{result.end} / {result.total.toLocaleString("ko-KR")}건</span><div><button type="button" className="icon-button" aria-label="관련 기사 이전 페이지" title="이전 페이지" disabled={result.current <= 1} onClick={() => setPage(result.current - 1)}><ChevronLeft /></button><AppSelect aria-label="관련 기사 페이지" value={result.current} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: result.pages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} / {result.pages}</option>)}</AppSelect><button type="button" className="icon-button" aria-label="관련 기사 다음 페이지" title="다음 페이지" disabled={result.current >= result.pages} onClick={() => setPage(result.current + 1)}><ChevronRight /></button></div></footer>
  </dialog>, document.body);
}
