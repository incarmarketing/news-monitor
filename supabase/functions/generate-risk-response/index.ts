const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DraftRequest = {
  type?: "internal" | "press";
  issue?: string;
  url?: string;
  context?: unknown;
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
  const model = (Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash").replace(/^models\//, "");
  const prompt = buildPrompt({ type, issue, url: body.url || "", context: body.context });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "당신은 보험/GA 업계 언론홍보 리스크 대응 초안을 작성하는 한국어 PR 실무자입니다. 사실 확인 전 단정 표현을 피하고, 회사에 불리한 법적 판단을 확정하지 않으며, 내부 확인과 대응 순서를 명확히 씁니다.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 1400,
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

  return jsonResponse({ ok: true, draft, model });
});

function buildPrompt(input: { type: "internal" | "press"; issue: string; url: string; context: unknown }) {
  const purpose = input.type === "press"
    ? "언론사 또는 외부 문의에 대응하기 위한 공식 입장문 초안"
    : "사내 공유 및 임원 보고를 위한 이슈 대응 메모";
  const format = input.type === "press"
    ? [
      "제목",
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
    "- Markdown 기호(#, **, ---) 없이 일반 보고 문장으로 작성",
    "- 과장 표현 금지",
    "- 사실관계가 불명확하면 '확인 중'으로 표현",
    "- 법적 책임 인정처럼 보일 수 있는 표현 금지",
    "- 바로 보고서에 붙일 수 있게 제목과 항목을 간결하게 구성",
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

function isAllowedApiKey(apiKey: string | null) {
  if (!apiKey) return false;
  const allowed = [
    Deno.env.get("PUBLIC_SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ].filter(Boolean);
  return allowed.includes(apiKey);
}
