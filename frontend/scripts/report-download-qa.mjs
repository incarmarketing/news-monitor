import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base=process.env.DESIGN_QA_URL || "http://127.0.0.1:4186/";
const out=path.resolve(process.env.DESIGN_QA_OUT || ".qa/report-download");
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
const result={reports:[],errors:[],writes:[]};
try {
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const requests=[];
  page.on("pageerror",error=>result.errors.push(error.message));
  page.on("request",request=>{
    requests.push(request.url());
    if(!request.url().includes('/functions/v1/dashboard-api'))return;
    const action=request.postDataJSON()?.action || '';
    if(/^(save_|delete_|trigger_|dispatch|collect|generate_)/.test(action))result.writes.push(action);
  });
  await page.addInitScript(()=>{
    window.__printCalls=0;window.__pdfTitles=[];
    window.print=()=>{window.__printCalls++;throw new Error('PDF export must not invoke a printer');};
    document.addEventListener('click',event=>{
      if(event.target.closest('.report-download-button'))window.__pdfTitles=[...document.querySelectorAll('.a4-priority-main > b')].map(node=>node.textContent);
    },true);
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.desk-priority[aria-busy="false"]').waitFor({timeout:90000});
  await page.locator('[data-section="reports"]').click();
  await page.locator('.a4-priority-card').first().waitFor({timeout:60000});
  assert.ok(!requests.some(url=>/pdfmake|IncarReportCJK|Pretendard-(Regular|Bold)\.woff(?:\?|$)/.test(url)),'PDF assets were eagerly downloaded');
  const title=await page.title();
  for (const [period,label] of [['daily','일간'],['weekly','주간'],['monthly','월간']]) {
    await page.locator('.report-workspace').getByRole('button',{name:label,exact:true}).click();
    await page.locator(`.newspaper-report-sheet.${period}`).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const before=await page.locator('.report-workspace').boundingBox();
    const downloaded=page.waitForEvent('download',{timeout:60000});
    await page.getByRole('button',{name:'PDF 저장',exact:true}).click();
    const file=await downloaded;
    await file.saveAs(path.join(out,`${period}.pdf`));
    await page.getByRole('button',{name:'PDF 저장',exact:true}).waitFor();
    assert.equal(await file.failure(),null);
    assert.equal(await page.evaluate(()=>window.__printCalls),0);
    assert.equal(await page.title(),title);
    assert.equal(await page.locator('.app-shell').getAttribute('data-active-section'),'reports');
    assert.deepEqual(await page.locator('.report-workspace').boundingBox(),before);
    await page.screenshot({path:path.join(out,`${period}.png`)});
    result.reports.push({period,file:file.suggestedFilename(),articleTitles:await page.evaluate(()=>window.__pdfTitles)});
  }
  const fixtureTitle='[문자 검증] 한글 ABC 1200% 韓·日·美 기업 보험';
  const fixturePublisher='韓·日·美 보도';
  await page.locator('.a4-priority-main > b').first().evaluate((node,title)=>{node.textContent=title;},fixtureTitle);
  await page.locator('.a4-press-rows > button > span').first().evaluate((node,title)=>{node.textContent=title;},fixturePublisher);
  const cjkEvent=page.waitForEvent('download',{timeout:60000});
  await page.getByRole('button',{name:'PDF 저장',exact:true}).click();
  const cjk=await cjkEvent;
  await cjk.saveAs(path.join(out,'cjk.pdf'));
  result.reports.push({period:'cjk',file:cjk.suggestedFilename(),articleTitles:await page.evaluate(()=>window.__pdfTitles),expectedTexts:[fixturePublisher],expectedFonts:['IncarReportCJK-Regular','IncarReportCJK-Bold']});
  const recovery=await browser.newPage({viewport:{width:1600,height:900}});
  let blocked=0;
  await recovery.route('**/*',async route=>{
    const request=route.request();
    if(request.resourceType()==='script' && /\/pdfmake\.min[^/]*\.js$/.test(new URL(request.url()).pathname) && !request.url().includes('?url')){blocked++;return route.abort();}
    return route.continue();
  });
  await recovery.goto(base,{waitUntil:'domcontentloaded'});
  await recovery.locator('[data-section="reports"]').click();
  await recovery.locator('.a4-priority-card').first().waitFor({timeout:60000});
  await recovery.getByRole('button',{name:'PDF 저장',exact:true}).click();
  await recovery.locator('.report-download-error').waitFor({timeout:60000});
  assert.ok(blocked,'the failure test did not block the runtime asset');
  await recovery.unroute('**/*');
  const recovered=recovery.waitForEvent('download',{timeout:60000});
  await recovery.getByRole('button',{name:'PDF 저장',exact:true}).click();
  const retryDownload=await recovered;
  assert.equal(await retryDownload.failure(),null);
  assert.equal(await recovery.locator('.app-shell').getAttribute('data-active-section'),'reports');
  await recovery.close();
  result.errorRecovery=true;
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.writes,[]);
  console.log(JSON.stringify({reports:result.reports.map(row=>row.period),printCalls:0,lazyAssets:true,errorRecovery:result.errorRecovery,errors:result.errors,writes:result.writes}));
} finally {await browser.close();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));}
