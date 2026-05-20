const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER") || "incarmarketing";
  const repo = Deno.env.get("GITHUB_REPO") || "news-monitor";
  const workflow = Deno.env.get("GITHUB_WORKFLOW_FILE") || "news-briefing.yml";
  const ref = Deno.env.get("GITHUB_REF") || "main";

  if (!token) {
    return jsonResponse({ error: "missing_github_dispatch_token" }, 500);
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          period_reports: "none",
          send_kakao: "false",
          report_slot: "auto",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: "github_dispatch_failed", status: response.status, detail }, 502);
  }

  return jsonResponse({
    ok: true,
    message: "news collection workflow dispatched",
    workflow,
    ref,
    requested_at: new Date().toISOString(),
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
