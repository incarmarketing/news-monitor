export function filterRegulatorArticles(rows = [], { query = "", source = "all", tone = "all", keyword = "all" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return rows.filter(article => {
    const text = `${article.title || ""} ${article.source || ""} ${article.summary || ""} ${article.regulatorKeyword || ""}`.toLowerCase();
    return (!needle || text.includes(needle)) && (source === "all" || article.source === source)
      && (tone === "all" || article.tone === tone) && (keyword === "all" || article.regulatorKeyword === keyword);
  });
}
