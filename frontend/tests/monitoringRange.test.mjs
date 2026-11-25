import test from 'node:test';
import assert from 'node:assert/strict';

function browserTimers(t) {
  const previous = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
}

test('anonymous historical queries paginate through the restricted API, never direct tables', async (t) => {
  browserTimers(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('supabase.json')) return new Response(JSON.stringify({ url: 'https://db.example', anon_key: 'public-test' }));
    assert.match(String(url), /functions\/v1\/dashboard-api$/);
    const request = JSON.parse(options.body);
    requests.push(request);
    assert.equal(request.action, 'article_range');
    const index = requests.length;
    return new Response(JSON.stringify({ ok: true, articles: [{ article_hash: `a${index}`, title: `Article ${index}`, link: `https://press.test/${index}`, pub_date: '2026-09-14T01:45:00Z', category: 'own', tone: 'caution', source: '아시아경제' }], next_offset: index === 1 ? 1000 : null }));
  });
  const { loadArticleRange } = await import('../src/liveData.js?range-pagination');
  const rows = await loadArticleRange({ startDate: '2026-09-14', endDate: '2026-09-14' });
  assert.equal(rows.length, 2);
  assert.deepEqual(requests.map(r => r.payload.offset), [0, 1000]);
  assert.ok(requests.every(r => r.payload.start_date === '2026-09-14' && r.payload.end_date === '2026-09-14'));
});

test('historical query failure is not a successful empty result', async (t) => {
  browserTimers(t);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('supabase.json')) return new Response(JSON.stringify({ url: 'https://db.example', anon_key: 'public-test' }));
    return new Response(JSON.stringify({ error: 'article_range_unavailable' }), { status: 502 });
  });
  const { loadArticleRange } = await import('../src/liveData.js?range-failure');
  await assert.rejects(loadArticleRange({ startDate: '2026-09-14', endDate: '2026-09-14' }), /article_range_unavailable/);
});

test('complete historical reads continue beyond the old 8000-row default', async (t) => {
  browserTimers(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).endsWith('supabase.json')) return new Response(JSON.stringify({ url: 'https://db.example', anon_key: 'public-test' }));
    const request = JSON.parse(options.body);
    requests.push(request);
    const offset = request.payload.offset;
    const count = Math.min(1000, 8501 - offset);
    const articles = Array.from({ length: count }, (_, index) => ({ article_hash: `r${offset + index}`, title: `Insurance ${offset + index}`, link: `https://press.test/${offset + index}`, pub_date: '2026-09-14T01:45:00Z', category: 'insurance', tone: 'neutral', source: '보험저널' }));
    return new Response(JSON.stringify({ ok: true, articles, next_offset: offset + count < 8501 ? offset + count : null }));
  });
  const { loadArticleRange } = await import('../src/liveData.js?complete-long-range');
  const rows = await loadArticleRange({ startDate: '2026-08-28', endDate: '2026-11-25', maxRows: 20000, requireComplete: true });
  assert.equal(rows.length, 8501);
  assert.equal(requests.length, 9);
  assert.equal(requests.at(-1).payload.offset, 8000);
});

test('complete historical reads reject truncation and non-advancing cursors', async (t) => {
  browserTimers(t);
  let invalidCursor = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('supabase.json')) return new Response(JSON.stringify({ url: 'https://db.example', anon_key: 'public-test' }));
    return new Response(JSON.stringify({ ok: true, articles: Array.from({ length: 100 }, (_, index) => ({ article_hash: `r${index}`, title: `Insurance ${index}`, link: `https://press.test/${index}`, tone: 'neutral' })), next_offset: invalidCursor ? 0 : 100 }));
  });
  const { loadArticleRange } = await import('../src/liveData.js?complete-errors');
  await assert.rejects(loadArticleRange({ startDate: '2026-08-28', endDate: '2026-11-25', maxRows: 100, requireComplete: true }), /article_range_limit_reached/);
  invalidCursor = true;
  await assert.rejects(loadArticleRange({ startDate: '2026-08-28', endDate: '2026-11-25', requireComplete: true }), /invalid_article_range_cursor/);
});

test('missing configuration cannot become a successful empty complete read', async (t) => {
  browserTimers(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const { loadArticleRange } = await import('../src/liveData.js?complete-no-config');
  await assert.rejects(loadArticleRange({ requireComplete: true }), /missing_supabase_config/);
});

test('different article query IDs survive deduplication while tracking parameters do not', async (t) => {
  browserTimers(t);
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('supabase.json')) return new Response(JSON.stringify({ url: 'https://db.example', anon_key: 'public-test' }));
    const articles = [
      { article_hash: 'first', title: 'First insurance article', link: 'https://www.insjournal.co.kr/news/articleView.html?idxno=100', tone: 'neutral', category: 'insurance' },
      { article_hash: 'second', title: 'Second insurance article', link: 'https://www.insjournal.co.kr/news/articleView.html?idxno=101', tone: 'neutral', category: 'insurance' },
      { article_hash: 'tracking-copy', title: 'First insurance article', link: 'https://www.insjournal.co.kr/news/articleView.html?utm_source=feed&idxno=100#details', tone: 'neutral', category: 'insurance' },
    ];
    return new Response(JSON.stringify({ ok: true, articles, next_offset: null }));
  });
  const { loadArticleRange } = await import('../src/liveData.js?article-query-identity');
  const rows = await loadArticleRange({ startDate: '2026-08-28', endDate: '2026-11-25', requireComplete: true });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.title), ['First insurance article', 'Second insurance article']);
});
