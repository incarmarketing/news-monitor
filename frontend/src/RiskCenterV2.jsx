import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FilePenLine, RefreshCw, ShieldCheck } from "lucide-react";
import { generateRiskResponseWithGemini } from "./liveData";
export default function RiskCenterV2({ articles = [], allArticles = [], operations = {}, onRefreshOperations, helpers = {} }) {
  const {
    ArticleSummaryBlock,
    Chip,
    Fact,
    PageTitle,
    Panel,
    articleSelectionKey,
    buildRiskCenterFacts,
    buildRiskResponseDraft,
    buildRiskResponseIssue,
    extractFirstUrl,
    findArticleByUrl,
    makeManualRiskArticle,
    normalizeRiskUrl,
    openArticleLink,
    riskDraftArticlePayload,
    riskDraftMatchesArticle,
    riskDraftTypeLabel,
    selectRiskCenterArticles,
  } = helpers;
  const sourceArticles = allArticles.length ? allArticles : articles;
  const riskArticles = useMemo(() => selectRiskCenterArticles(sourceArticles), [sourceArticles]);
  const savedDrafts = useMemo(() => Array.isArray(operations.riskDrafts) ? operations.riskDrafts : [], [operations.riskDrafts]);
  const [draftType, setDraftType] = useState("press");
  const [articleUrl, setArticleUrl] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [draft, setDraft] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");

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
  const activeSavedDraft = savedDrafts.find((row) => row.draftType === draftType && riskDraftMatchesArticle(row, activeArticle));
  const displayedDraft = draft || activeSavedDraft?.draft || "";
  const visibleDrafts = savedDrafts.slice(0, 6);

  const applyArticle = (article) => {
    setSelectedArticle(article);
    setArticleUrl(article.link && article.link !== "#" ? article.link : "");
    setDraft("");
    setDraftError("");
  };

  const applyUrl = (value) => {
    const nextUrl = extractFirstUrl(value) || value.trim();
    setArticleUrl(nextUrl);
    setSelectedArticle(findArticleByUrl(sourceArticles, nextUrl));
    setDraft("");
    setDraftError("");
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

  const handleGenerateDraft = async () => {
    if (!operations?.session?.session_token) {
      setDraftError("대응 초안 생성과 DB 저장은 운영 DB 로그인이 필요합니다. 로그인 후 다시 실행하면 초안이 저장됩니다.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("news-monitor:login-required"));
      }
      return;
    }
    if (typeof window !== "undefined" && !window.confirm("선택한 기사 기준으로 초안을 생성할까요?")) return;
    setGeneratingDraft(true);
    setDraftError("");
    try {
      const issue = buildRiskResponseIssue(activeArticle, facts);
      const result = await generateRiskResponseWithGemini({
        type: draftType,
        issue,
        url: activeArticle?.link && activeArticle.link !== "#" ? activeArticle.link : articleUrl,
        context: facts,
        article: riskDraftArticlePayload(activeArticle),
        save: true,
      });
      setDraft(result?.draft || buildRiskResponseDraft(draftType, activeArticle, facts));
      await onRefreshOperations?.();
    } catch (error) {
      setDraft(buildRiskResponseDraft(draftType, activeArticle, facts));
      setDraftError(`Gemini 저장 생성 실패: ${error?.message || "fallback"}`);
    } finally {
      setGeneratingDraft(false);
    }
  };

  return (
    <main className="workspace">
      <PageTitle
        eyebrow="Risk Response"
        title="대응센터"
        description="당사 직접 언급 리스크 기사와 외부 URL을 기준으로 팩트체크와 대응 초안을 관리합니다."
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
              <b>당사 리스크 기사</b>
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
              <div className="risk-empty">당사 직접 언급 리스크 기사가 없습니다.</div>
            )}
          </div>
        </Panel>
        <Panel title="대응 초안" icon={FilePenLine} meta={displayedDraft ? "초안 저장/확인" : "생성 전 확인"}>
          <div className="segmented">
            <button className={draftType === "press" ? "active" : ""} onClick={() => { setDraftType("press"); setDraft(""); }}>언론 해명용</button>
            <button className={draftType === "internal" ? "active" : ""} onClick={() => { setDraftType("internal"); setDraft(""); }}>사내 해명용</button>
          </div>
          <div className="draft-preview">
            <b>{draftType === "press" ? "언론 해명용 초안" : "사내 공유용 초안"}</b>
            {activeSavedDraft && !draft && (
              <span className="risk-draft-meta">DB 저장 초안 · {activeSavedDraft.date} {activeSavedDraft.time} · {activeSavedDraft.model || "Gemini"}</span>
            )}
            <p>{displayedDraft || "팩트체크 내용을 확인한 뒤 초안을 생성합니다."}</p>
          </div>
          {draftError && <div className="risk-ai-status warning">{draftError}</div>}
          <div className="risk-draft-ledger">
            <div className="risk-section-head">
              <b>저장된 초안</b>
              <span>{savedDrafts.length.toLocaleString("ko-KR")}건</span>
            </div>
            {visibleDrafts.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`risk-draft-row ${row.draftType === draftType && riskDraftMatchesArticle(row, activeArticle) ? "active" : ""}`}
                onClick={() => {
                  setDraftType(row.draftType || "press");
                  setDraft(row.draft || "");
                  if (row.link) setArticleUrl(row.link);
                  setSelectedArticle(findArticleByUrl(sourceArticles, row.link) || {
                    title: row.title,
                    link: row.link,
                    source: row.source,
                    tone: row.tone,
                    riskLevel: row.riskLevel,
                  });
                }}
              >
                <span>{riskDraftTypeLabel(row.draftType)} · {row.source || "출처 확인"} · {row.date} {row.time}</span>
                <b>{row.title}</b>
              </button>
            ))}
            {!visibleDrafts.length && <div className="risk-empty compact">저장된 초안이 아직 없습니다.</div>}
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
            <button className="primary-button confirm-button" onClick={handleGenerateDraft} disabled={generatingDraft}>
              {generatingDraft ? "생성/저장 중" : "초안 생성"}
            </button>
          </div>
        </Panel>
      </section>
    </main>
  );
}
