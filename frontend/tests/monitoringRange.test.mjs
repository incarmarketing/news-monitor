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
