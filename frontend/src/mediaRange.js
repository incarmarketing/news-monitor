import { loadArticleRange } from "./liveData.js";

export function createMediaRangeLoader(readRange = loadArticleRange, now = Date.now) {
  const cache = new Map();
  return ({ startDate, endDate, revision = "", force = false }) => {
    const key = [startDate, endDate, revision].join(":");
    const cached = cache.get(key);
    if (!force && cached && now() - cached.createdAt < 120000) return cached.promise;
    const entry = { createdAt: now() };
    entry.promise = Promise.resolve().then(() => readRange({ startDate, endDate, maxRows: 20000, requireComplete: true }))
      .then(articles => ({ articles, startDate, endDate, loadedAt: now() }))
      .catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    return entry.promise;
  };
}

export const loadMediaArticleRange = createMediaRangeLoader();
