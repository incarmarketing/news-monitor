import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublisherAnalysis, filterPublisherArticles, publisherDateRange } from '../src/publisherAnalysisModel.js';

const range = publisherDateRange('2026-11-25',30);
const row = {id:'a',link:'https://www.insjournal.co.kr/news/articleView.html?idxno=1',source:'보험저널',date:'2026-11-25',title:'보험업계 신규 상품 출시 소식과 판매 전략',tone:'중립',category:'보험사'};

test('publisher analysis counts the complete selected period, not an article page or other publisher', () => {
  const articles = Array.from({length:67},(_,i) => ({...row,id:`a${i}`,link:`${row.link}${i}`}));
  const model = buildPublisherAnalysis([...articles,{...row,link:'https://other.example/article',source:'다른 언론사'}, {...row,date:'2026-10-26'}],'보험저널',range);
  assert.equal(model.total,67);
  assert.equal(model.tones.reduce((n,item)=>n+item.count,0),67);
  assert.equal(model.categories.reduce((n,item)=>n+item.count,0),67);
  assert.equal(filterPublisherArticles(model.rows,{category:'insurance'}).length,67);
});

test('company mentions and directly targeted negative reporting remain different facts', () => {
  const articles = [
    {...row,id:'1',link:`${row.link}1`,tone:'부정',category:'당사',aiContext:{ownMentioned:true,negativeTarget:'industry'}},
    {...row,id:'2',link:`${row.link}2`,tone:'부정',category:'당사',aiContext:{ownMentioned:true,negativeTarget:'own'}},
    {...row,id:'3',link:`${row.link}3`,tone:'부정',category:'당사'},
    {...row,id:'4',link:`${row.link}4`,tone:'주의',category:'정책/규제'},
  ];
  const model=buildPublisherAnalysis(articles,'보험저널',range);
  assert.equal(model.own,3);
  assert.equal(model.directNegative,1);
  assert.equal(filterPublisherArticles(model.rows,{directNegative:true})[0].id,'2');
  assert.equal(filterPublisherArticles(model.rows,{tone:'부정'}).length,3);
});

test('unclassified/excluded rows stay in the denominator and portal aliases do not inflate counts', () => {
  const model=buildPublisherAnalysis([row,{...row,id:'portal',link:'https://news.google.com/rss/articles/copy'}, {...row,id:'excluded',link:`${row.link}2`,title:'제외 대상 기사',tone:'제외',category:'제외'}, {...row,id:'unknown',link:`${row.link}3`,title:'미분류 기사',tone:'',category:''}],'보험저널',range);
  assert.equal(model.total,3);
  assert.equal(model.tones.reduce((n,item)=>n+item.count,0),3);
  assert.equal(model.categories.reduce((n,item)=>n+item.count,0),3);
});

test('30 and 90 day scopes are inclusive calendar ranges', () => {
  assert.deepEqual(range,{startDate:'2026-10-27',endDate:'2026-11-25'});
  assert.deepEqual(publisherDateRange('2026-11-25',90),{startDate:'2026-08-28',endDate:'2026-11-25'});
  assert.equal(publisherDateRange('invalid',30),null);
});
