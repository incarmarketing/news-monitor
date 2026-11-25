import assert from 'node:assert/strict';
import test from 'node:test';
import { collapsePortalArticleAliases } from '../src/articleAliases.js';

const headline = '"인카금융 3708명 위반해도 영업정지 피할 수 있나"…금융위 GA 과징금 개정안 논란';
const original = { articleHash:'original', title:'"인카금융 3708명 위반해도 영업정지 피할 수 있나"…금융위 GA 과징금 ...', source:'녹색경제신문', date:'2026-11-25', pubDate:'2026-11-25T07:40:00Z', link:'https://www.greened.kr/news/articleView.html?idxno=355569' };
const portal = { ...original, articleHash:'portal', title:`${headline} - 녹색경제신문`, pubDate:'2026-11-25T07:40:22Z', link:'https://news.google.com/rss/articles/copy?oc=5' };

test('verified long truncated title, same publisher and minute resolves to the full headline and original URL', () => {
  const rows = collapsePortalArticleAliases([portal, original]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].link, original.link);
  assert.equal(rows[0].articleHash, 'original');
  assert.equal(rows[0].title, headline);
  assert.equal(rows[0].articleAliases[0].articleHash, 'portal');
  assert.deepEqual(collapsePortalArticleAliases(rows), rows);
});

test('ambiguous follow-up titles or different original IDs are never combined', () => {
  assert.equal(collapsePortalArticleAliases([original, portal, {...portal, articleHash:'follow-up', link:`${portal.link}2`, title:`${headline} 후속 조치`}]).length, 3);
  assert.equal(collapsePortalArticleAliases([original, portal, {...original, articleHash:'original2', link:original.link.replace('355569','355570')}]).length, 3);
});

test('truncated matches require known publisher, explicit same minute, same day and a long prefix', () => {
  for (const change of [{source:'다른 언론사'}, {pubDate:'2026-11-25T07:41:22Z'}, {pubDate:'2026-11-25'}, {pubDate:'2026-11-25 16:40:00'}, {date:'2026-11-24'}, {title:'인카금융 ...'}]) {
    assert.equal(collapsePortalArticleAliases([original, {...portal, ...change}]).length, 2, JSON.stringify(change));
  }
  assert.equal(collapsePortalArticleAliases([original, {...portal, title:original.title}]).length, 2);
});
