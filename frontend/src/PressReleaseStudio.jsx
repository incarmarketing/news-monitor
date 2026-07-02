import { useEffect, useMemo, useState } from "react";
import { FilePenLine, FileText, Megaphone, Newspaper, Users } from "lucide-react";
import { journalistRows } from "./data";
import { generatePressReleaseWithGemini } from "./liveData";
import {
  buildPressQuote,
  buildPressReleasePackage,
  normalizeGeminiPressDraft,
  PRESS_CORE_FIELDS,
  PRESS_RELEASE_TYPES,
} from "./pressReleaseUtils";

export default function PressReleaseStudio({ operations }) {
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

function PageTitle({ eyebrow, title, description, right }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

function Panel({ title, icon: Icon = FileText, meta, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2><Icon />{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </section>
  );
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
