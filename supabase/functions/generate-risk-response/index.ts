const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dashboard-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DraftRequest = {
  type?: "internal" | "press";
  issue?: string;
  url?: string;
  context?: unknown;
};

type SessionInfo = {
  ok?: boolean;
  employee_no?: string;
  display_name?: string;
  role?: "admin" | "editor" | "viewer" | "reporter";
  session_expires_at?: string;
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
  const session = await verifyDashboardSession(req.headers.get("x-dashboard-session") || "");
  if (!session.ok || !["admin", "editor", "reporter"].includes(session.role || "")) {
    return jsonResponse({ error: "invalid_session", detail: session.message || "risk_response_requires_login" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "missing_gemini_api_key" }, 500);
  }

  const body = await safeJson<DraftRequest>(req);
  const issue = String(body.issue || "").trim();
  if (!issue) {
    return jsonResponse({ error: "missing_issue" }, 400);
  }

  const type = body.type === "press" ? "press" : "internal";
  const model = Deno.env.get("GEMINI_EDGE_MODEL") || "gemini-2.5-flash";
  const maxOutputTokens = Number(Deno.env.get("GEMINI_MAX_OUTPUT_TOKENS") || "3600") || 3600;
  const prompt = buildPrompt({ type, issue, url: body.url || "", context: body.context });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "당신은 보험/GA 업계 언론홍보 리스크 대응 초안을 작성하는 한국어 PR 실무자입니다. 기사 주장을 그대로 반복하지 말고, 보도 쟁점 정의·확인 범위·대응 원칙·실제 문의 응대 문장으로 재구성합니다. 사실 확인 전 단정 표현을 피하고, 법적 책임 인정처럼 보이는 표현을 쓰지 않습니다. 빈말처럼 보이는 포괄 문장보다 담당자가 바로 확인할 수 있는 구체 문장을 우선합니다.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: "gemini_request_failed", status: response.status, detail }, 502);
  }

  const data = await response.json();
  const draft = extractText(data);
  if (!draft) {
    return jsonResponse({ error: "empty_gemini_response" }, 502);
  }

  return jsonResponse({
    ok: true,
    draft,
    model,
    finishReason: data?.candidates?.[0]?.finishReason || "",
    usageMetadata: data?.usageMetadata || {},
    requestedBy: session.employee_no || "",
  });
});

function buildPrompt(input: { type: "internal" | "press"; issue: string; url: string; context: unknown }) {
  const purpose = input.type === "press"
    ? "언론사 또는 외부 문의에 대응하기 위한 공식 입장문 초안"
    : "사내 공유 및 임원 보고를 위한 이슈 대응 메모";
  const format = input.type === "press"
    ? [
      "입장 요지",
      "확인 중인 사항",
      "당사 대응 방향",
      "문의 대응 문구",
    ]
    : [
      "이슈 개요",
      "리스크 판단",
      "확인 필요 사항",
      "즉시 조치",
      "대외 커뮤니케이션 원칙",
    ];

  return [
    `목적: ${purpose}`,
    "회사: 인카금융서비스",
    "부서: 마케팅부",
    `작성일: ${todayKst()}`,
    input.url ? `기사 URL: ${input.url}` : "기사 URL: 미입력",
    "",
    "사용자가 입력한 핵심 내용:",
    input.issue,
    "",
    "참고 컨텍스트:",
    JSON.stringify(input.context || {}, null, 2).slice(0, 2000),
    "",
    "작성 조건:",
    "- 한국어로 작성",
    "- 오늘 날짜는 위 작성일을 사용",
    "- Markdown 제목 기호(#, **, ---) 없이 작성",
    "- 각 항목은 [항목명] 다음 줄에 '- ' 불릿으로 작성",
    "- 첫 항목은 기사 제목 반복이 아니라 보도 쟁점의 성격을 한 문장으로 정의",
    "- 보험 꺾기, 불법 사채, 금융사 사칭, 고객 DB, 개인정보, 소비자 피해는 영업관리/소비자보호 고위험 사안으로 다룸",
    "- 투자의견 하향, 목표가 조정, 주가 하락은 직접 부정이 아니라 시장평가/재무 주의 사안으로 분리",
    "- 과장 표현 금지",
    "- 사실관계가 불명확하면 '확인 중'으로 표현",
    "- 법적 책임 인정처럼 보일 수 있는 표현 금지",
    "- 기사 제목과 본문 일부를 그대로 길게 복사하지 말고 핵심 쟁점만 재서술",
    "- 전체 분량은 언론 해명용 550~850자, 사내 공유용 750~1,100자 내외로 압축",
    "- 각 항목은 2~4개 불릿으로 작성하고 마지막 항목까지 완결",
    "- 중복 문장 금지",
    "- 금지 표현: '단정적인 입장을 내지 않겠습니다', '추가 확인이 완료되는 대로', '해당 보도와 관련해 현재 확인 가능한 핵심 쟁점은'",
    "- 금지 패턴: 입력 문장 끝에 '핵심입니다'를 붙여 반복, 기사 제목과 요약을 같은 문장으로 반복",
    "- 언론 해명용은 외부에 보낼 수 있는 신중한 표현으로 작성",
    "- 언론 해명용의 마지막 항목은 실제로 기자에게 말할 수 있는 짧은 인용문 2~3개로 작성",
    "- 사내 공유용은 담당부서가 바로 움직일 수 있게 확인 과제와 액션을 구체화",
    "- 문장 중간에서 끝내지 말고 대응 원칙, 확인 항목, 문의 대응 문구까지 마무리",
    `- 항목 구성: ${format.join(" / ")}`,
  ].join("\n");
}

function todayKst() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function extractText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text || "").join("\n").trim();
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
