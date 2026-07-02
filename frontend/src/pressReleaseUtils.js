export const PRESS_COMPANY_OVERVIEW = "인카금융서비스는 2007년 설립된 국내 최초의 코스닥 상장 GA로, 전속 설계사 2만 명 이상을 보유하고 있으며 2022년 코스닥 이전 상장에 이어 종합자산관리회사로의 도약을 단계적으로 추진하고 있다";

export const PRESS_RELEASE_TYPES = [
  { id: "plan", number: 1, title: "사업계획 보도자료", focus: "신규 전략, 사업 방향, 중장기 성장 계획을 발표합니다." },
  { id: "csr", number: 2, title: "사회공헌 보도자료", focus: "나눔 활동, 지역사회 기여, ESG 성격의 활동을 알립니다." },
  { id: "award", number: 3, title: "수상 보도자료", focus: "수상 사실, 평가 기준, 성과의 의미를 객관적으로 전달합니다." },
  { id: "performance", number: 4, title: "실적 보도자료", focus: "매출, 영업성과, 설계사 수 등 수치 기반 성과를 설명합니다." },
  { id: "partnership", number: 5, title: "제휴 보도자료", focus: "제휴 배경, 협력 범위, 고객·영업현장 기대효과를 알립니다." },
  { id: "event", number: 6, title: "행사 보도자료", focus: "행사 목적, 참석자, 주요 프로그램과 후속 계획을 정리합니다." },
];

export const PRESS_CORE_FIELDS = [
  { id: "announcement", label: "1. 주요 발표 내용은 무엇인가요?", placeholder: "예: 인카금융서비스가 우수인증설계사 2,262명을 배출했습니다." },
  { id: "value", label: "2. 이 소식이 왜 중요하고 가치 있는지 설명해 주세요.", placeholder: "예: 영업조직의 전문성과 완전판매 역량을 객관적으로 보여주는 지표입니다." },
  { id: "difference", label: "3. 인카금융서비스만의 차별화 포인트는 무엇인가요?", placeholder: "예: 업계 최대 수준의 설계사 네트워크와 체계적인 교육 시스템을 갖추고 있습니다." },
];

export function buildPressReleasePackage(type, answers, quoteSpeaker, customQuote = "", recipients = []) {
  const cleanAnswers = {
    announcement: cleanPressLine(answers.announcement),
    value: cleanPressLine(answers.value),
    difference: cleanPressLine(answers.difference),
    facts: cleanPressLine(answers.facts),
  };
  const headline = buildPressHeadline(type, cleanAnswers);
  const subtitle = buildPressSubtitle(type, cleanAnswers);
  const lead = buildPressLead(type, cleanAnswers);
  const body = buildPressBody(type, cleanAnswers);
  const quote = cleanPressLine(customQuote) || buildPressQuote(type, cleanAnswers, quoteSpeaker);
  const emailSummary = buildEmailSummary(cleanAnswers, type);
  const recipientText = buildRecipientText(recipients);
  const pressRelease = [
    headline,
    subtitle,
    "",
    lead,
    "",
    ...body,
    "",
    quote,
    "",
    PRESS_COMPANY_OVERVIEW,
  ].filter((line) => line !== null).join("\n");
  const email = [
    `제목: [보도자료] ${headline}`,
    "",
    "[본문]",
    "",
    "안녕하세요, 인카금융서비스 마케팅부입니다.",
    "",
    "언론 발전을 위해 항상 애쓰시는 기자님의 노고에 진심으로 감사드립니다.",
    "",
    ...emailSummary,
    "",
    "바쁘시겠지만 긍정적인 검토를 부탁드립니다.",
    "",
    "늘 건강하시고 좋은 하루 보내시길 바랍니다. 감사합니다.",
    "",
    "인카금융서비스 마케팅부",
    "",
    "담당자: 최진우 과장",
    "이메일: enul459@incar.co.kr",
    "전화: 02-6212-4650",
  ].join("\n");
  return {
    notice: "그리고나서 기자들에게 보낼 이메일 본문 작성을 시작하겠습니다.",
    recipients: recipientText,
    pressRelease,
    email,
    fullText: `${recipientText}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`,
  };
}

export function normalizeGeminiPressDraft(result = {}, fallback = {}) {
  const payload = result.package || result.draft || result;
  const pressRelease = String(payload.pressRelease || payload.press_release || fallback.pressRelease || "").trim();
  const email = String(payload.email || fallback.email || "").trim();
  const recipients = String(payload.recipients || fallback.recipients || "").trim();
  const notice = String(payload.notice || "Gemini API로 보도자료와 기자 발송 이메일을 작성했습니다.").trim();
  const fullText = String(payload.fullText || payload.full_text || "").trim()
    || `${recipients}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`;
  return {
    notice,
    recipients,
    pressRelease,
    email,
    fullText,
    model: result.model || "",
    usageMetadata: result.usageMetadata || {},
  };
}

export function buildPressQuote(type, answers, quoteSpeaker) {
  const speaker = quoteSpeaker === "chairman" ? "최병채 인카금융서비스 회장" : "인카금융서비스 관계자";
  const speakerJosa = quoteSpeaker === "chairman" ? "은" : "는";
  const quoteFocus = quoteSpeaker === "chairman"
    ? "회사의 지속 성장은 고객 신뢰와 현장 전문성이 함께 높아질 때 가능하다"
    : "이번 발표는 고객과 영업현장에 실질적인 가치를 제공하기 위한 실행의 일환";
  const action = {
    plan: "미래 성장 기반을 차근차근 강화하겠다",
    csr: "사회적 책임을 꾸준히 실천하겠다",
    award: "신뢰받는 금융서비스 회사로서 기준을 높여가겠다",
    performance: "질적 성장과 안정적 성과를 함께 만들어가겠다",
    partnership: "협력의 성과가 고객 혜택으로 이어지도록 하겠다",
    event: "현장과의 소통을 바탕으로 실행력을 높이겠다",
  }[type.id] || "고객 신뢰를 높여가겠다";
  const difference = sentenceObject(answers.difference);
  const strength = isMeaningfulPressInput(difference)
    ? `${difference}라는 강점을 바탕으로 `
    : "";
  return `${speaker}${speakerJosa} “${quoteFocus}”라며 “${strength}${action}”고 말했다.`;
}

function buildRecipientText(recipients = []) {
  if (!recipients.length) return "수신 대상: 선택된 이메일 기자 없음";
  const lines = recipients.map((row, index) => `${index + 1}. ${row.name || "기자명 미입력"} · ${row.media || row.outlet || "-"} · ${row.email}`);
  return [`수신 대상: ${recipients.length.toLocaleString("ko-KR")}명`, ...lines].join("\n");
}

function buildPressHeadline(type, answers) {
  const subject = stripTrailingPunctuation(answers.announcement);
  const fragments = {
    plan: `${subject}, 미래 성장 전략 본격화`,
    csr: `${subject}, 지역사회와 상생 가치 확산`,
    award: `${subject}, 전문성과 신뢰도 입증`,
    performance: `${subject}, 지속 성장 기반 강화`,
    partnership: `${subject}, 고객 가치 확대 나선다`,
    event: `${subject}, 현장 소통과 성장 방향 공유`,
  };
  return trimPressHeadline(fragments[type.id] || subject);
}

function buildPressSubtitle(type, answers) {
  const value = stripTrailingPunctuation(answers.value);
  const difference = stripTrailingPunctuation(answers.difference);
  const lines = [
    isMeaningfulPressInput(value) ? `- ${value}` : "",
    isMeaningfulPressInput(difference) ? `- ${difference}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

function buildPressLead(type, answers) {
  const announcement = sentenceObject(answers.announcement);
  if (type.id === "award" && /배출$/.test(announcement)) {
    return `인카금융서비스(대표이사 최병채, 천대권)는 ${normalizePressAchievementObject(announcement)}했다고 밝혔다.`;
  }
  const verb = {
    plan: "추진한다고 밝혔다",
    csr: "진행했다고 밝혔다",
    award: "성과를 거뒀다고 밝혔다",
    performance: "기록했다고 밝혔다",
    partnership: "협력한다고 밝혔다",
    event: "개최했다고 밝혔다",
  }[type.id] || "밝혔다";
  return `인카금융서비스(대표이사 최병채, 천대권)는 ${pressObjectPhrase(answers.announcement)} ${verb}.`;
}

function buildPressBody(type, answers) {
  const typeLead = {
    plan: "이번 계획은 회사의 중장기 성장 기반을 강화하고 고객 접점의 서비스 품질을 높이기 위해 마련됐다.",
    csr: "이번 활동은 회사가 보유한 인적·조직적 역량을 지역사회와 나누고 지속 가능한 상생 가치를 실천하기 위해 추진됐다.",
    award: "이번 수상은 회사의 영업 경쟁력과 고객 중심 운영 체계가 대외적으로 평가받은 결과라는 점에서 의미가 있다.",
    performance: "이번 성과는 영업조직의 질적 성장과 안정적인 사업 기반이 함께 반영된 결과로 풀이된다.",
    partnership: "이번 제휴는 양사의 강점을 결합해 고객과 영업현장에 실질적인 혜택을 제공하는 데 초점을 맞췄다.",
    event: "이번 행사는 주요 관계자와 현장 구성원이 함께 회사의 방향성과 실행 과제를 공유하기 위해 마련됐다.",
  }[type.id];
  const paragraphs = [];
  const value = sentenceObject(answers.value);
  const difference = sentenceObject(answers.difference);
  const facts = sentenceObject(answers.facts);

  paragraphs.push(isMeaningfulPressInput(value)
    ? `${typeLead} ${sentence(value)}`
    : `${typeLead} 회사는 이번 발표가 영업현장 전문성, 고객 신뢰, 완전판매 역량을 함께 보여주는 사례라고 설명했다.`);
  if (isMeaningfulPressInput(facts)) {
    paragraphs.push(`회사 측은 ${facts}를 주요 근거로 제시하며 발표 내용의 객관성과 실행 가능성을 강조했다.`);
  }
  paragraphs.push(isMeaningfulPressInput(difference)
    ? `인카금융서비스는 ${difference}를 차별화 포인트로 삼아 고객 신뢰와 현장 경쟁력을 동시에 높인다는 계획이다.`
    : "인카금융서비스는 체계적인 교육, 내부 관리, 현장 지원 역량을 바탕으로 고객 신뢰와 영업 경쟁력을 높인다는 계획이다.");
  paragraphs.push("인카금융서비스는 앞으로도 보험 소비자 보호와 영업현장 전문성 강화를 중심으로 지속 가능한 성장 체계를 고도화할 방침이다.");
  return paragraphs;
}

function buildEmailSummary(answers, type) {
  const rows = [
    sentence(answers.announcement),
    isMeaningfulPressInput(answers.value) ? sentence(answers.value) : "",
    isMeaningfulPressInput(answers.difference) ? `${type.title.replace(" 보도자료", "")}의 핵심은 ${sentenceObject(answers.difference)}입니다.` : "",
  ].filter(Boolean);
  return rows.slice(0, 3).map((line, index) => `${index + 1}. ${line}`);
}

function cleanPressLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/기업형\s*GA\s*/g, "")
    .trim();
}

function sentence(value) {
  const text = stripTrailingPunctuation(cleanPressLine(value));
  return text ? `${text}.` : "";
}

function sentenceObject(value) {
  return stripTrailingPunctuation(cleanPressLine(value));
}

function isMeaningfulPressInput(value) {
  const text = sentenceObject(value).trim();
  if (!text) return false;
  return !/^(없음|없다|없습니다|따로\s*없음|미정|해당\s*없음|n\/?a|null|none)$/i.test(text);
}

function pressObjectPhrase(value) {
  const text = sentenceObject(value);
  if (!text) return "주요 경영 성과를";
  if (/[을를]$/.test(text)) return text;
  if (/(명|건|개|곳|억|억원|위|회|년|월|일|%|퍼센트|포인트)$/.test(text)) return `${text}을`;
  return `${text}을`;
}

function normalizePressAchievementObject(value) {
  const text = sentenceObject(value);
  const countMatch = text.match(/^(.+?)([0-9,천만억]+(?:여)?명)\s*배출$/);
  if (countMatch) return `${countMatch[1]}${countMatch[2]}을 배출`;
  return pressObjectPhrase(text);
}

function stripTrailingPunctuation(value) {
  return cleanPressLine(value).replace(/[.。!！?？]+$/g, "");
}

function trimPressHeadline(value) {
  const text = stripTrailingPunctuation(value);
  return text.length > 58 ? `${text.slice(0, 56)}…` : text;
}
