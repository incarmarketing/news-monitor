import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {chooseOption} from "./select-qa.mjs";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base=process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out=path.resolve(process.env.DESIGN_QA_OUT || ".qa/report-print");
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
const result={errors:[],charts:[],reports:[],writes:[]};
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 page.on("pageerror",e=>result.errors.push(e.message));
 page.on("request",request=>{
   if(!request.url().includes("/functions/v1/dashboard-api"))return;
   const action=request.postDataJSON()?.action || "";
   if(/^(save_|delete_|trigger_|dispatch|collect|generate_)/.test(action))result.writes.push(action);
 });
 await page.addInitScript(()=>{
   window.__chartSizes=[];let previous="";const started=performance.now();
   const tick=()=>{
     const charts=[...document.querySelectorAll(".desk-small-multiples svg")].map(node=>({viewBox:node.getAttribute("viewBox"),width:Math.round(node.parentElement.clientWidth),height:Math.round(node.parentElement.clientHeight)}));
     const key=JSON.stringify(charts);
     if(charts.length && key!==previous){previous=key;window.__chartSizes.push(charts);}
     if(performance.now()-started<10000)requestAnimationFrame(tick);
   };requestAnimationFrame(tick);
 });
 await page.goto(base,{waitUntil:"domcontentloaded"});
 for(let round=0;round<2;round++){
   if(round)await page.reload({waitUntil:"domcontentloaded"});
   await page.locator('.desk-priority[aria-busy="false"] article').first().waitFor({timeout:60000});
   await page.waitForTimeout(1000);
   const sizes=await page.evaluate(()=>window.__chartSizes);
   assert.ok(sizes.length);
   for(const frame of sizes)for(const size of frame)assert.equal(size.viewBox,`0 0 ${size.width} ${size.height}`,"a guessed chart size was painted");
   result.charts.push(sizes);
 }
 const storyBounds=await page.locator('.desk-story-grid').boundingBox();
 for(const sort of ["own","latest","spread","risk"]){
   await chooseOption(page,page.getByRole("combobox",{name:"우선 이슈 정렬 및 보기"}),sort);
   assert.equal(await page.locator('.desk-story-grid > article').count(),5);
   assert.deepEqual(await page.locator('.desk-story-grid').boundingBox(),storyBounds);
   const empty=await page.locator('.desk-story-grid > article').evaluateAll(nodes=>nodes.map(node=>node.classList.contains('desk-story-empty')));
   assert.ok(!empty.slice(empty.indexOf(true)+1).includes(false) || !empty.includes(true),"articles appear after blank slots");
 }
 await page.locator('[data-section="reports"]').click();
 await page.locator('.report-workspace .a4-priority-card').first().waitFor({timeout:60000});
 for(const [period,label] of [["daily","일간"],["weekly","주간"],["monthly","월간"]]){
   await page.locator('.report-workspace').getByRole('button',{name:label,exact:true}).click();
   await page.locator(`.newspaper-report-sheet.${period}`).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const before=await page.locator('.report-workspace').boundingBox();
   await page.pdf({path:path.join(out,`${period}.pdf`),preferCSSPageSize:true,printBackground:true});
   assert.equal(await page.locator('.app-shell').getAttribute('data-active-section'),'reports',"printing navigated away from reports");
   assert.deepEqual(await page.locator('.report-workspace').boundingBox(),before);
   await page.screenshot({path:path.join(out,`${period}-returned.png`)});
   result.reports.push(period);
 }
 await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++;};});
 const title=await page.title();
 const downloadEvent=page.waitForEvent('download',{timeout:60000});
 await page.getByRole('button',{name:'PDF 저장',exact:true}).click();
 const download=await downloadEvent;
 await download.saveAs(path.join(out,'direct-download.pdf'));
 assert.equal(await page.evaluate(()=>window.__printCalls),0,'PDF export still used the printer driver');
 await page.emulateMedia({media:'print'});
 await page.setViewportSize({width:1100,height:800});
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.app-shell').getAttribute('data-active-section'),'reports');
 await page.setViewportSize({width:1600,height:900});
 await page.emulateMedia({media:'screen'});
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 assert.equal(await page.locator('.app-shell').getAttribute('data-active-section'),'reports',"print cancellation changed the selected screen");
 assert.equal(await page.title(),title);
 await page.setViewportSize({width:390,height:844});
 await page.locator('.app-shell[data-active-section="overview"]').waitFor();
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.writes,[]);
 console.log(JSON.stringify({chartRounds:result.charts.length,reports:result.reports,cancelPreservedReport:true,mobileGuardPreserved:true,errors:result.errors,writes:result.writes}));
}finally{await browser.close();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));}
