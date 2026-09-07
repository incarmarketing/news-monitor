export function registryRows(data, mode, query = "") {
  const key = mode === "unknown" ? "unknown" : mode === "reporters" ? "reporters" : "media";
  const rows = Array.isArray(data?.[key]) ? data[key] : [];
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => !needle || [row.name, row.media, row.host].some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
}

export function validRegistryPayload(data, mode = "summary") {
  if (!data || typeof data !== "object") return false;
  if (mode === "summary") return ["media", "unknown", "reporters"].every((key) => Array.isArray(data[key])) && Number.isFinite(data.own_articles);
  return Array.isArray(data.rows) && Number.isFinite(data.total) && data.rows.every((row) => Array.isArray(row.authors));
}

export function registryError(error) {
  const text = String(error?.message || error);
  if (/session|unauthorized/.test(text)) return "확정하려면 관리자 또는 편집자 로그인이 필요합니다. 입력 내용은 유지됩니다.";
  if (/write_not_allowed/.test(text)) return "언론사 정보를 확정할 권한이 없습니다.";
  if (/portal_requires/.test(text)) return "포털 주소는 일괄 지정할 수 없습니다. 기사별로 언론사를 확정해 주세요.";
  return "처리하지 못했습니다. 입력 내용을 유지했으니 잠시 후 다시 시도해 주세요.";
}

export function safeArticleUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}
