import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base=process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out=path.resolve(process.env.DESIGN_QA_OUT || ".qa/monitor-toolbar");
await fs.mkdir(out,{recursive:true});
const result={layouts:[],errors:[],writes:[]};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('request',request=>{
   if(!request.url().includes('/functions/v1/dashboard-api'))return;
   if(/^(save_|delete_|trigger_|dispatch|collect|generate_)/.test(request.postDataJSON()?.action || ''))result.writes.push(request.postDataJSON().action);
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('[data-section="monitoring"]').click();
 const main=page.locator('main.workspace:visible');
 await main.locator('.monitor-results[aria-busy="false"]').waitFor({timeout:90000});
 await main.locator('.monitor-article-row').first().waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const collection=page.getByRole('button',{name:'새 기사 수집',exact:true});
 assert.equal(await collection.innerText(),'');
 assert.equal(await collection.getAttribute('title'),'새 기사 수집');
 assert.equal(await collection.locator('svg').count(),2);
 assert.equal(await main.locator('.monitor-header button').count(),0);
 const exportButton=main.locator('.monitor-results-header .monitor-export');
 for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1600,900],[1920,1080],[1024,768],[390,844]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await main.evaluate(node=>{
     const box=selector=>{const r=node.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     return{width:innerWidth,overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight,
       title:box('.monitor-header'),updated:box('.monitor-updated'),category:box('.monitor-category-tabs'),csv:box('.monitor-export'),
       headers:[...node.querySelectorAll('thead th')].filter(n=>n.getBoundingClientRect().width).map(n=>({font:getComputedStyle(n).fontSize,align:getComputedStyle(n).textAlign}))};
   });
   assert.ok(layout.overflowX<=1);
   if(width>1200)assert.ok(layout.overflowY<=1);
   assert.ok(Math.abs(layout.updated.right-layout.title.right)<=1,'date is not right aligned');
   assert.ok(layout.category.right+10<=layout.csv.x,'CSV overlaps the category tabs');
   assert.ok(Math.abs(layout.category.y+layout.category.height/2-layout.csv.y-layout.csv.height/2)<=1,'CSV is not on the category row');
   assert.ok(layout.headers.every(h=>h.align==='center' && h.font===(width>760?'16px':'14px')));
   assert.ok((await main.locator('.monitor-category-tabs button').evaluateAll(nodes=>nodes.map(node=>node.scrollWidth-node.clientWidth))).every(overflow=>overflow<=1),'category labels shrink and overlap');
   assert.ok((await main.locator('.monitor-time small,.monitor-clock').evaluateAll(nodes=>nodes.map(node=>node.scrollWidth-node.clientWidth))).every(overflow=>overflow<=1),'publication date/time wraps or overflows');
   await page.screenshot({path:path.join(out,`monitor-${width}.png`),animations:'disabled'});
   result.layouts.push(layout);
 }
 await page.setViewportSize({width:1600,height:900});
 const before=await exportButton.boundingBox();
 await main.locator('.monitor-article-row input[type="checkbox"]').first().check();
 const after=await exportButton.boundingBox();
 assert.deepEqual(after,before,'selection resized the export button');
 const downloadPromise=page.waitForEvent('download');await exportButton.click();
 assert.match((await downloadPromise).suggestedFilename(),/-selected\.csv$/);
 await main.locator('.monitor-article-row input[type="checkbox"]').first().uncheck();
 await main.getByRole('textbox',{name:'검색어',exact:true}).fill('서울법인금융센터');
 await main.getByRole('button',{name:'조회/검색',exact:true}).click();
 const row=main.locator('.monitor-article-row').filter({hasText:'인카금융서비스 7위로 급락'});
 await row.first().waitFor({timeout:90000});
 assert.equal(await row.count(),1);
 assert.equal(await row.locator('.monitor-clock').innerText(),'08:10','known publication time was dropped');
 assert.equal(await row.locator('time').getAttribute('datetime'),'2026-11-25T08:10:00+09:00');
 const dateBounds=await row.locator('.monitor-time').evaluate(node=>{
   const cell=node.getBoundingClientRect(),time=node.querySelector('time').getBoundingClientRect();
   return{cell:cell.y+cell.height/2,time:time.y+time.height/2};
 });
 assert.ok(Math.abs(dateBounds.cell-dateBounds.time)<=1,'publication date/time is not vertically centered');
 await page.screenshot({path:path.join(out,'known-clock.png')});
 await main.getByRole('button',{name:'검색 초기화',exact:true}).click();
 const dateOnlyPage=await browser.newPage({viewport:{width:1600,height:900}});
 dateOnlyPage.on('pageerror',e=>result.errors.push(e.message));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 await dateOnlyPage.route('**/functions/v1/dashboard-api',async route=>{
   if(route.request().postDataJSON()?.action!=='snapshot')return route.continue();
   const response=await route.fetch();const payload=await response.json();const data=payload.data || payload;
   data.articles=[{article_hash:'e'.repeat(64),title:'QA 검증용 발행일만 확인된 보험 기사',link:'https://example.com/date-only-qa',source:'보험저널',pub_date:today,report_date:today,category:'insurance',tone:'neutral'}];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 const fixtureUrl=new URL(base);fixtureUrl.searchParams.set('section','monitoring');
 await dateOnlyPage.goto(fixtureUrl.href,{waitUntil:'domcontentloaded'});
 const dateOnlyCell=dateOnlyPage.locator('.monitor-article-row .monitor-time');
 await dateOnlyCell.waitFor({timeout:60000});
 assert.equal(await dateOnlyCell.innerText(),today.replaceAll('-','.'));
 assert.equal(await dateOnlyCell.locator('.monitor-clock').count(),0);
 const dateOnlyBounds=await dateOnlyCell.evaluate(node=>{const cell=node.getBoundingClientRect(),date=node.querySelector('small').getBoundingClientRect();return{cell:cell.y+cell.height/2,date:date.y+date.height/2};});
 assert.ok(Math.abs(dateOnlyBounds.cell-dateOnlyBounds.date)<=1,'a date without a clock is not vertically centered');
 await dateOnlyPage.screenshot({path:path.join(out,'date-only-fixture.png')});
 await dateOnlyPage.close();
 result.dateOnlyCentered=true;
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.writes,[]);
 console.log(JSON.stringify({layouts:result.layouts.length,knownTime:'08:10',dateOnlyCentered:result.dateOnlyCentered,selectedCsv:true,errors:result.errors,writes:result.writes}));
}finally{await browser.close();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));}
