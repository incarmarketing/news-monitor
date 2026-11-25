import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chooseOption} from './select-qa.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const out=path.resolve(process.env.DESIGN_QA_OUT || '.qa/management-analysis-fixture');
const base=process.env.DESIGN_QA_URL || 'http://127.0.0.1:4186/';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
const result={views:[],errors:[],writes:[],analysis:[]};
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const stamp=days=>new Date(Date.parse(`${today}T00:00:00Z`)-days*86400000).toISOString();
const articles=Array.from({length:126},(_,i)=>({article_hash:`fixture-${i}`,source:'보험저널',title:`인카금융서비스 보험 판매 동향 ${i}`,link:`https://www.insjournal.co.kr/news/articleView.html?idxno=${900000+i}`,pub_date:stamp(i%90),category:i%3?'industry':'own',tone:i%5?'neutral':'caution',own_mentioned:i%3===0}));
const auditRows=articles.slice(0,30).map(row=>({...row,authors:[{name:'확인 기자'}],byline_status:'verified',checked_at:stamp(0),evidence_url:row.link}));
let failRange=false;
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',error=>result.errors.push(error.message));
 await page.route('**/functions/v1/dashboard-api',async route=>{
  const request=route.request();
  if(request.method()!=='POST')return route.continue();
  const {action,payload={}}=request.postDataJSON() || {};
  if(/^(save_|delete_|trigger_|dispatch|collect|generate_)/.test(action)){result.writes.push(action);return route.abort();}
  let data;
  if(action==='media_registry'){
   data=payload.mode==='summary' ? {media:[{name:'보험저널',article_count:126,verified_count:126,last_at:stamp(0)}],unknown:[{host:'jejumbc.com',article_count:2,own_count:0,portal:false}],reporters:[{name:'확인 기자',media:'보험저널',article_count:126,last_at:stamp(0)}],own_articles:42,as_of:stamp(0)}
    : {rows:payload.mode==='unknown'?auditRows.slice(0,2).map(row=>({...row,source:'언론사 확인 필요',link:row.link.replace('www.insjournal.co.kr','jejumbc.com')})):auditRows,total:payload.mode==='unknown'?2:126};
  } else if(action==='article_range') {
   if(failRange)return route.fulfill({status:502,json:{error:'fixture_range_unavailable'}});
   const scoped=articles.filter(row=>row.pub_date.slice(0,10)>=payload.start_date && row.pub_date.slice(0,10)<=payload.end_date);
   return route.fulfill({json:{ok:true,articles:scoped,next_offset:null}});
  } else return route.continue();
  return route.fulfill({json:{ok:true,data}});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('.newsroom-navigation [data-section="management"]').click();
 const main=page.locator('main.workspace:visible');
 await main.getByRole('button',{name:'보험저널 보도 분석 보기',exact:true}).click();
 const analysis=main.locator('.publisher-analysis');
 for(const days of [30,90]) {
  if(days===90)await chooseOption(page,main.getByRole('combobox',{name:'언론사 분석 기간'}),'90');
  await analysis.locator('.publisher-metrics').waitFor({timeout:90000});
  const total=Number((await analysis.locator('.publisher-metrics > button').first().locator('b').innerText()).replace(/\D/g,''));
  const sums=await analysis.locator('.publisher-distribution').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('button b')].reduce((sum,item)=>sum+Number(item.textContent.replace(/\D/g,'')),0)));
  assert.deepEqual(sums,[total,total]);assert.ok(total>30);
  result.analysis.push({days,total,sums});
 }
 await analysis.locator('.publisher-distribution').first().getByRole('button',{name:/주의/}).click();
 assert.ok((await analysis.locator('tbody tr td:nth-child(2)').allTextContents()).every(text=>text==='주의'));
 await main.getByRole('button',{name:'보도 분석 필터 초기화'}).click();
 for(const [width,height] of [[1600,1000],[1366,768],[390,844]]) {
  await page.setViewportSize({width,height});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`publisher-${width}.png`),animations:'disabled'});
  result.views.push(`analysis-${width}`);
 }
 await page.setViewportSize({width:1600,height:1000});
 failRange=true;
 await main.getByRole('button',{name:'언론사 상세 새로고침'}).click();
 await analysis.getByRole('alert').waitFor({timeout:60000});
 assert.equal(await analysis.locator('.publisher-metrics').count(),0,'a failed complete read became zero metrics');
 failRange=false;
 await analysis.getByRole('button',{name:'다시 조회'}).click();
 await analysis.locator('.publisher-metrics').waitFor();
 await main.getByRole('tab',{name:'기사·기자 이력',exact:true}).click();
 await main.locator('.registry-articles li').first().waitFor();
 assert.equal(await main.locator('.registry-evidence').count(),30);
 await main.getByRole('button',{name:'목록으로',exact:true}).click();
 await main.getByRole('tab',{name:/언론사 미확인/}).click();
 await main.locator('.registry-table tbody tr').first().getByRole('button').click();
 await main.locator('.registry-articles li').first().waitFor();
 const input=await main.getByRole('textbox',{name:'확정 언론사명'}).boundingBox();
 const button=await main.getByRole('button',{name:'확정',exact:true}).boundingBox();
 assert.ok(Math.abs(input.y-button.y)<1 && input.height===button.height);
 for(const [width,height] of [[1600,1000],[390,844]]) {
  await page.setViewportSize({width,height});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`unknown-${width}.png`)});
  result.views.push(`unknown-${width}`);
 }
 await main.locator('.management-tabs').getByRole('button',{name:'분류 피드백',exact:true}).click();
 for(const [width,height] of [[1600,1000],[390,844]]) {
  await page.setViewportSize({width,height});
  await main.getByRole('textbox',{name:'분류 수정 이력 검색'}).fill('no-matching-article');
  await main.getByRole('button',{name:'분류 이력 검색 초기화'}).click();
  assert.equal(await main.getByRole('textbox',{name:'분류 수정 이력 검색'}).inputValue(),'');
  const controlHeight=await main.getByRole('button',{name:'분류 이력 검색 초기화'}).evaluate(node=>node.getBoundingClientRect().height);
  assert.equal(controlHeight,40);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`feedback-${width}.png`)});
  result.views.push(`feedback-${width}`);
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.writes,[]);
 console.log(JSON.stringify(result));
}finally{await browser.close();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));}
