const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dashboard-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PressReleaseRequest = {
  type?: {
    id?: string;
    title?: string;
    focus?: string;
  };
  answers?: {
    announcement?: string;
    value?: string;
    difference?: string;
    facts?: string;
  };
  quoteSpeaker?: "chairman" | "official" | string;
  quote?: string;
  recipients?: Array<{
    name?: string;
    media?: string;
    outlet?: string;
    email?: string;
  }>;
};

type SessionInfo = {
  ok?: boolean;
  employee_no?: string;
  display_name?: string;
  role?: "admin" | "editor" | "viewer" | "reporter";
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!isAllowedApiKey(req.headers.get("apikey"))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const sessionToken = req.headers.get("x-dashboard-session") || "";
  const session = sessionToken ? await verifyDashboardSession(sessionToken) : { ok: false, message: "anonymous" };
  const requireLogin = Deno.env.get("REQUIRE_PRESS_RELEASE_LOGIN") === "true";
  if (requireLogin && (!session.ok || !["admin", "editor", "reporter"].includes(session.role || ""))) {
    return jsonResponse({ error: "invalid_session", detail: session.message || "press_release_requires_login" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "missing_gemini_api_key" }, 500);
  }

  const body = await safeJson<PressReleaseRequest>(req);
  const clean = normalizeRequest(body);
  if (!clean.typeTitle || !clean.announcement || !clean.value || !clean.difference || !clean.quoteSpeaker) {
    return jsonResponse({ error: "missing_press_release_inputs" }, 400);
  }

  const model = Deno.env.get("GEMINI_PRESS_RELEASE_MODEL")
    || Deno.env.get("GEMINI_EDGE_MODEL")
    || Deno.env.get("GEMINI_MODEL")
    || "gemini-2.5-pro";
  const maxOutputTokens = Number(Deno.env.get("GEMINI_PRESS_RELEASE_MAX_OUTPUT_TOKENS") || "7200") || 7200;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "당신은 인카금융서비스의 보도자료를 작성하는 한국어 홍보·언론 전문가입니다.",
              "입력값이 짧아도 '주요 세부 내용 없음', '따로 없음', '관련 수치 없음' 같은 표현을 절대 쓰지 않습니다.",
              "사용자가 제공하지 않은 숫자, 순위, 기관명, 일정, 제품, 서비스, 출시 사실은 만들지 않습니다.",
              "사용자의 주요 발표 내용에 있는 명사, 숫자, 대상은 절대 다른 개념으로 바꾸지 않습니다.",
              "부족한 정보는 자연스럽게 생략하고, 제공된 사실의 뉴스 가치와 맥락을 확장해 언론 배포 가능한 완성 문장으로 씁니다.",
              "광고 문구처럼 과장하지 말고, 객관적이고 명확한 보도자료 문체로 작성합니다.",
              "반드시 JSON 객체 하나만 출력하고 Markdown, 코드블록, JSON 밖 설명은 쓰지 않습니다.",
            ].join("\n"),
          }],
        },
        contents: [{ role: "user", parts: [{ text: buildPrompt(clean) }] }],
        generationConfig: {
          temperature: 0.12,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: "gemini_request_failed", status: response.status, detail }, 502);
  }

  const data = await response.json();
  const rawText = extractText(data);
  if (!rawText) {
    return jsonResponse({ error: "empty_gemini_response" }, 502);
  }
  const parsed = parseJsonObject(rawText);
  if (!parsed) {
    return jsonResponse({ error: "invalid_gemini_json", raw: rawText.slice(0, 2000) }, 502);
  }

  const pack = normalizePackage(parsed, clean);
  return jsonResponse({
    ok: true,
    package: pack,
    model,
    finishReason: data?.candidates?.[0]?.finishReason || "",
    usageMetadata: data?.usageMetadata || {},
    requestedBy: session.ok ? session.employee_no || "" : "dashboard_public_press_release",
  });
});

function normalizeRequest(body: PressReleaseRequest) {
  const quoteSpeaker = body.quoteSpeaker === "chairman" ? "chairman" : body.quoteSpeaker === "official" ? "official" : "";
  return {
    typeId: String(body.type?.id || "").trim(),
    typeTitle: String(body.type?.title || "").trim(),
    typeFocus: String(body.type?.focus || "").trim(),
    announcement: limitText(body.answers?.announcement, 1000),
    value: limitText(body.answers?.value, 1000),
    difference: limitText(body.answers?.difference, 1000),
    facts: limitText(body.answers?.facts, 1600),
    quoteSpeaker,
    quote: limitText(body.quote, 1200),
    recipients: Array.isArray(body.recipients) ? body.recipients.slice(0, 200) : [],
  };
}

function buildPrompt(input: ReturnType<typeof normalizeRequest>) {
  const quoteName = input.quoteSpeaker === "chairman" ? "최병채 인카금융서비스 회장" : "인카금융서비스 관계자";
  return [
    "보도자료 유형:",
    `${input.typeTitle} (${input.typeFocus || "유형 설명 없음"})`,
    "",
    "사용자가 입력한 핵심 질문 답변:",
    `1. 주요 발표 내용: ${input.announcement}`,
    `2. 중요성/가치: ${input.value}`,
    `3. 차별화 포인트: ${input.difference}`,
    `추가 참고자료: ${input.facts || "추가 입력 없음"}`,
    "",
    "인용문 작성자:",
    quoteName,
    input.quote ? `사용자가 수정한 인용문 기본값: ${input.quote}` : "사용자 수정 인용문 없음",
    "",
    "핵심 사실 고정 규칙:",
    `- 아래 문장을 보도자료의 핵심 사실로 고정합니다: ${input.announcement}`,
    `- 제목 기준 문장: ${buildLockedHeadline(input)}`,
    `- 리드 첫 문장 기준: ${buildLockedLead(input)}`,
    "- 제목, 리드, 본문 첫 문단에는 위 핵심 사실의 대상과 숫자를 그대로 유지합니다.",
    "- '배출'은 '출시', '탑재', '개발', '판매', '도입'으로 바꾸지 않습니다.",
    "- '설계사'는 '기능', '솔루션', '서비스', '시스템'으로 바꾸지 않습니다.",
    "- 사용자가 '출시', '신제품', '솔루션'을 입력하지 않았다면 제품 출시 보도자료처럼 쓰지 않습니다.",
    "- '업계 최초', '압도적', '최대'는 사용자가 명확히 입력한 경우에만 씁니다.",
    "",
    "반드시 지켜야 할 작성 원칙:",
    "- 작성 시작 전 멘트는 JSON에 넣지 않습니다.",
    "- 보도자료는 바로 언론사 배포가 가능한 수준으로 작성합니다.",
    "- 제목은 짧고 핵심 뉴스가 드러나게 작성합니다.",
    "- 부제목은 1~2줄, 각 줄은 '- '로 시작합니다.",
    "- 도입부에 날짜와 지역을 표시하지 않습니다.",
    "- 도입부 회사명은 반드시 '인카금융서비스(대표이사 최병채, 천대권)' 또는 '코스닥상장사 인카금융서비스(대표이사 최병채, 천대권)' 중 하나만 씁니다.",
    "- '기업형 GA 인카금융서비스'라는 표현은 절대 쓰지 않습니다.",
    "- 한 문단은 하나의 메시지만 담고, 문장은 쉽게 씁니다.",
    "- 인용문 작성자가 회장일 때는 '최병채 인카금융서비스 회장'으로 표기합니다.",
    "- 인용문 작성자가 관계자일 때는 '인카금융서비스 관계자'로 표기하고, 조사는 반드시 '는'을 사용합니다.",
    "- 회사 개요는 아래 문장만 그대로 사용합니다.",
    "인카금융서비스는 2007년 설립된 국내 최초의 코스닥 상장 GA로, 전속 설계사 2만 명 이상을 보유하고 있으며 2022년 코스닥 이전 상장에 이어 종합자산관리회사로의 도약을 단계적으로 추진하고 있다",
    "",
    "절대 금지 표현:",
    "- 주요 세부 내용은 따로 없음",
    "- 관련 세부 내용 없음",
    "- 수치 없음",
    "- 시스템과 투명한 수수료처럼 문장이 끝나지 않는 표현",
    "- 관계자은",
    "- 기능 탑재",
    "- 솔루션 출시",
    "- ##",
    "- **",
    "- 이번 발표는 의미가 있다만 반복하는 빈 문장",
    "",
    "기자 발송 이메일 양식:",
    "제목: [보도자료] 기사 제목",
    "안녕하세요, 인카금융서비스 마케팅부입니다.",
    "언론 발전을 위해 항상 애쓰시는 기자님의 노고에 진심으로 감사드립니다.",
    "기사 본문 3줄 요약",
    "바쁘시겠지만 긍정적인 검토를 부탁드립니다.",
    "늘 건강하시고 좋은 하루 보내시길 바랍니다. 감사합니다.",
    "인카금융서비스 마케팅부",
    "담당자: 최진우 과장",
    "이메일: enul459@incar.co.kr",
    "전화: 02-6212-4650",
    "",
    "출력 JSON 스키마:",
    JSON.stringify({
      notice: "그리고나서 기자들에게 보낼 이메일 본문 작성을 시작하겠습니다.",
      headline: "기사 제목",
      pressRelease: "제목, 부제목, 본문, 인용문, 회사 개요를 포함한 전체 보도자료",
      email: "기자 발송 이메일 본문",
    }, null, 2),
  ].join("\n");
}

function normalizePackage(parsed: any, input: ReturnType<typeof normalizeRequest>) {
  const rawHeadline = cleanText(parsed.headline || extractHeadline(parsed.pressRelease) || "");
  const rawPressRelease = cleanText(parsed.pressRelease || parsed.press_release || "");
  const rawEmail = cleanText(parsed.email || "");
  if (hasFactDrift(`${rawHeadline}\n${rawPressRelease}`, input)) {
    return buildGuardedPackage(input);
  }
  const headline = rawHeadline && keepsLockedTerms(rawHeadline, input) ? rawHeadline : buildLockedHeadline(input);
  const pressRelease = rawPressRelease || buildGuardedPressRelease(input);
  const email = rawEmail || buildGuardedEmail(input, headline);
  const recipients = buildRecipientText(input.recipients);
  const notice = cleanText(parsed.notice || "그리고나서 기자들에게 보낼 이메일 본문 작성을 시작하겠습니다.");
  return {
    notice,
    headline,
    recipients,
    pressRelease,
    email,
    fullText: `${recipients}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`,
  };
}

function buildGuardedPackage(input: ReturnType<typeof normalizeRequest>) {
  const headline = buildLockedHeadline(input);
  const recipients = buildRecipientText(input.recipients);
  const pressRelease = buildGuardedPressRelease(input);
  const email = buildGuardedEmail(input, headline);
  return {
    notice: "그리고나서 기자들에게 보낼 이메일 본문 작성을 시작하겠습니다.",
    headline,
    recipients,
    pressRelease,
    email,
    fullText: `${recipients}\n\n---\n\n${pressRelease}\n\n---\n\n${email}\n\n보도자료 작성이 완료되었습니다.`,
  };
}

function buildGuardedPressRelease(input: ReturnType<typeof normalizeRequest>) {
  const headline = buildLockedHeadline(input);
  const subtitle = [
    input.value ? `- ${ensureSentence(input.value)}` : "",
    input.difference ? `- ${ensureSentence(input.difference)}` : "",
  ].filter(Boolean).join("\n");
  const quoteName = input.quoteSpeaker === "chairman" ? "최병채 인카금융서비스 회장" : "인카금융서비스 관계자";
  const quote = input.quote || `${quoteName}는 “이번 성과는 고객에게 신뢰받는 영업문화를 만들기 위해 현장에서 쌓아온 전문성과 완전판매 노력을 보여주는 결과”라며 “인카금융서비스는 앞으로도 설계사 교육과 내부통제 체계를 고도화해 금융소비자 보호와 현장 경쟁력을 함께 높여가겠다”고 말했다.`;
  return [
    headline,
    subtitle,
    "",
    buildLockedLead(input),
    "",
    input.value ? `이번 성과는 ${ensureSentence(input.value)}` : "",
    input.difference ? `인카금융서비스는 ${ensureSentence(input.difference)}` : "",
    meaningfulFacts(input.facts) ? `특히 ${ensureSentence(input.facts)}` : "",
    "인카금융서비스는 앞으로도 보험 소비자 보호와 영업현장 전문성 강화를 중심으로 지속 가능한 성장 체계를 고도화할 방침이다.",
    "",
    quote,
    "",
    "인카금융서비스는 2007년 설립된 국내 최초의 코스닥 상장 GA로, 전속 설계사 2만 명 이상을 보유하고 있으며 2022년 코스닥 이전 상장에 이어 종합자산관리회사로의 도약을 단계적으로 추진하고 있다",
  ].filter((line) => line !== "").join("\n");
}

function buildGuardedEmail(input: ReturnType<typeof normalizeRequest>, headline: string) {
  const summary = [
    `- ${ensureSentence(input.announcement)}`,
    input.value ? `- ${ensureSentence(input.value)}` : "",
    input.difference ? `- ${ensureSentence(input.difference)}` : "",
  ].filter(Boolean);
  return [
    `제목: [보도자료] ${headline}`,
    "",
    "[본문]",
    "",
    "안녕하세요, 인카금융서비스 마케팅부입니다.",
    "",
    "언론 발전을 위해 항상 애쓰시는 기자님의 노고에 진심으로 감사드립니다.",
    "",
    ...summary,
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
}

function buildLockedHeadline(input: ReturnType<typeof normalizeRequest>) {
  let subject = input.announcement
    .replace(/^인카금융서비스가\s*/, "")
    .replace(/^인카금융서비스는\s*/, "")
    .replace(/(했습니다|하였다|했다|합니다|한다고 밝혔다|다고 밝혔다)[.。]?$/g, "")
    .trim();
  if (!subject) subject = input.announcement;
  const suffix = input.typeId === "award" ? "전문성과 신뢰도 입증" : "고객 가치 확대";
  const headline = `인카금융서비스, ${subject}…${suffix}`;
  return headline.length > 64 ? `인카금융서비스, ${subject}` : headline;
}

function buildLockedLead(input: ReturnType<typeof normalizeRequest>) {
  let subject = input.announcement
    .replace(/^인카금융서비스가\s*/, "")
    .replace(/^인카금융서비스는\s*/, "")
    .replace(/했습니다[.。]?$/g, "했다")
    .replace(/합니다[.。]?$/g, "한다고 밝혔다")
    .trim();
  if (!/(했다|밝혔다|기록했다|배출했다|선정됐다|수상했다|체결했다)$/.test(subject)) {
    subject = `${subject.replace(/[.。]+$/g, "")}했다고 밝혔다`;
  } else {
    subject = `${subject.replace(/[.。]+$/g, "")}고 밝혔다`;
  }
  return `인카금융서비스(대표이사 최병채, 천대권)는 ${subject}.`;
}

function hasFactDrift(text: string, input: ReturnType<typeof normalizeRequest>) {
  const source = `${input.announcement} ${input.value} ${input.difference} ${input.facts}`;
  const forbidden = ["MDRT", "솔루션", "기능 탑재", "출시", "신제품", "플랫폼 구축"];
  return forbidden.some((word) => text.includes(word) && !source.includes(word)) || !keepsLockedTerms(text, input);
}

function keepsLockedTerms(text: string, input: ReturnType<typeof normalizeRequest>) {
  const source = input.announcement;
  const terms = Array.from(source.matchAll(/[가-힣A-Za-z0-9,]+/g))
    .map((match) => normalizeLockedTerm(match[0]))
    .filter((term) => term.length >= 3 && !["인카금융서비스가", "인카금융서비스는", "했습니다", "합니다"].includes(term));
  const important = terms.filter((term) => /\d|우수인증|설계사|인카금융/.test(term)).slice(0, 4);
  return important.every((term) => text.includes(term));
}

function ensureSentence(value: string) {
  const text = cleanText(value).replace(/[.。]+$/g, "");
  return text ? `${text}.` : "";
}

function meaningfulFacts(value: string) {
  const text = cleanText(value);
  return text && !/추가 입력 없음|없음|따로 없음/.test(text);
}

function normalizeLockedTerm(value: string) {
  return String(value || "")
    .replace(/(을|를|이|가|은|는|으로|로|에|에서|부터|까지)$/g, "")
    .replace(/,$/g, "");
}

function buildRecipientText(recipients: Array<{ name?: string; media?: string; outlet?: string; email?: string }>) {
  const rows = recipients.filter((row) => row.email);
  if (!rows.length) return "수신 대상: 선택된 이메일 기자 없음";
  return [
    `수신 대상: ${rows.length.toLocaleString("ko-KR")}명`,
    ...rows.map((row, index) => `${index + 1}. ${row.name || "기자명 미입력"} · ${row.media || row.outlet || "-"} · ${row.email}`),
  ].join("\n");
}

function extractHeadline(text: string) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
}

function limitText(value: unknown, max = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text || "").join("\n").trim();
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function safeJson<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    return {} as T;
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function verifyDashboardSession(token: string): Promise<SessionInfo> {
  if (!token || token.trim().length < 32) {
    return { ok: false, message: "missing_session" };
  }
  const result = await supabaseRpc("verify_dashboard_session", { p_session_token: token.trim() });
  if (!result.ok) return { ok: false, message: `session_rpc_${result.status}` };
  return result.data as SessionInfo;
}

async function supabaseRpc(functionName: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return { ok: false, status: 500, data: { error: "missing_supabase_service_config" } };
  }
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = [
    Deno.env.get("PUBLIC_SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ].filter(Boolean);
  return allowed.includes(apiKey);
}
