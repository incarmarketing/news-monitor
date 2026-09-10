import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sections, expectedSection, validateSectionState } from "../frontend/scripts/qa-sections.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend/dist");
const output = path.join(root, "out/category-flows");
await mkdir(output, { recursive: true });
const date = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul"}).format(new Date());
const articles = [
  {title:"인카금융서비스 보험설계사 교육 및 소비자보호 지원 확대 - v.daum.net", category:"당사",tone:"긍정",own_mentioned:true},
  {title:"금융감독원 보험대리점 판매수수료 제도 개선 발표", category:"정책/규제",tone:"주의",source:"금융감독원"},
  {title:"보험업계 건강보험 보장 서비스 개편 - 보험매일",category:"보험사",tone:"중립"},
].map((article, index) => ({...article, id:`flow-${index}`,article_hash:`flow-${index}`,
  source:article.source || "보험매일",link:`https://example.com/article-${index}`,
  date,report_date:date,pub_date:`${date}T08:00:00+09:00`,time:"08:00",keyword:"보험",
  summary:"보험설계사와 소비자보호 관련 지원 및 제도 변경 내용입니다."}));
const snapshot = {status:"live",generatedAt:new Date().toISOString(),articles,
  notifications:[],watchRuns:[],reportRuns:[],jobRuns:[],scraps:[],mediaRelations:[],
  reporters:[],ads:[],aliases:[],keywords:[],feedback:[]};
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const server = createServer(async (request,response) => {
  const pathname = new URL(request.url,"http://localhost").pathname;
  const file = path.resolve(dist,`.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${dist}${path.sep}`)) { response.writeHead(403).end(); return; }
  try { const body = await readFile(file); response.writeHead(200,{"Content-Type":mime[path.extname(file)] || "application/octet-stream"}).end(body); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || "msedge"});
const results = [];
try {
  for (const width of [1366,390]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    let errors = [];
    page.on("pageerror",error => errors.push(error.message));
    await page.addInitScript(() => {
      window.addEventListener("error", event => {
        if (event.error?.cause) console.error("Underlying render error:", event.error.cause.stack || event.error.cause);
      });
    });
    page.on("console", message => { if (message.text().startsWith("Underlying render error:")) console.error(message.text()); });
    // No collection, notifications, paid API calls or production writes in UI QA.
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (/\/(operations|articles)\.json$/.test(url.pathname)) await route.fulfill({json:snapshot});
      else if (url.origin !== base || url.pathname.includes("/data/") || url.pathname.endsWith("supabase.json")) await route.fulfill({json:{}});
      else await route.continue();
    });
    await page.addInitScript(data => localStorage.setItem("incar_core_snapshot_v3",JSON.stringify({cachedAt:Date.now(),data})),snapshot);
    for (const section of sections) {
      errors = [];
      await page.goto(`${base}/?section=${section.id}`,{waitUntil:"networkidle"});
      await page.locator(`.app-shell[data-active-section="${expectedSection(section.id,width)}"]`).waitFor();
      await page.waitForFunction(() => ![...document.querySelectorAll("main.workspace")].some(el => el.getBoundingClientRect().width && el.innerText.includes("화면 불러오는 중")));
      const state = await page.evaluate(() => ({actual:document.querySelector(".app-shell")?.dataset.activeSection,
        visibleText:[...document.querySelectorAll("main.workspace")].filter(el=>el.getBoundingClientRect().width>0).map(el=>el.innerText).join(" "),
        overflow:document.documentElement.scrollWidth-innerWidth}));
      assert.deepEqual(validateSectionState({requested:section.id,width,...state,errors}),[],`${width}/${section.id}`);
      assert.ok(state.overflow <= 2,`${width}/${section.id} overflow=${state.overflow}`);
      if (section.id === "reports" && width > 1240) {
        for (const label of ["주간","월간","일간"]) {
          await page.locator(".report-period-picker").getByRole("button",{name:label,exact:true}).click();
          await page.locator(".report-workspace").waitFor();
        }
      }
      if (section.id === "management") {
        for (const label of ["기자 관리","광고비 관리","키워드 문맥","분류 피드백","분류 점검","언론사 관리"]) {
          await page.locator(".management-tabs").getByRole("button",{name:label,exact:true}).click();
          assert.ok((await page.locator(".admin-panel-body").innerText()).trim().length>10);
        }
      }
      if (section.id === "monitoring") {
        const workspace=page.locator(".monitoring-workspace");
        await workspace.locator(".feed-row").first().waitFor();
        const headlines = await workspace.locator(".feed-title-line > b").allTextContents();
        assert.ok(headlines.some(title => title.includes("인카금융서비스")));
        assert.ok(headlines.every(title => !/ - (v\.daum\.net|보험매일)$/.test(title)), "Headline source suffix should be hidden");
        assert.ok((await workspace.locator(".feed-meta").allTextContents()).some(meta => meta.includes("보험매일")), "Separate publisher metadata must stay visible");
        await workspace.getByPlaceholder("제목, 언론사, 키워드 검색").fill("없는검색어xyz");
        await workspace.getByRole("button",{name:"조회/검색",exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector(".monitoring-workspace .feed-row"));
        await workspace.getByRole("button",{name:"초기화",exact:true}).click();
        await workspace.locator(".feed-row").first().waitFor();
      }
      assert.deepEqual(errors,[],`${width}/${section.id} interaction errors`);
      await page.screenshot({path:path.join(output,`${width}-${section.id}.png`),fullPage:false});
      results.push({width,section:section.id,actual:state.actual,overflow:state.overflow,errors});
    }
    await page.close();
  }
  // Browsers with blocked storage must still render the public dashboard.
  const blocked = await browser.newPage({viewport:{width:1366,height:900}});
  const blockedErrors=[];
  blocked.on("pageerror",error=>blockedErrors.push(error.message));
  await blocked.route("**/*",route => new URL(route.request().url()).origin===base && !route.request().url().includes("/data/") ? route.continue() : route.fulfill({json:snapshot}));
  await blocked.addInitScript(()=>{
    for (const name of ["localStorage","sessionStorage"]) Object.defineProperty(window,name,{get(){throw new DOMException("Blocked","SecurityError");}});
  });
  await blocked.goto(base,{waitUntil:"networkidle"});
  await blocked.locator(".dashboard-workspace").waitFor();
  assert.deepEqual(blockedErrors,[]);
  assert.match(await blocked.locator(".side-brand-user").innerText(),/로그인 안 됨/);
  results.push({storage:"blocked",errors:blockedErrors});
  await blocked.close();
  await writeFile(path.join(output,"summary.json"),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:true,results},null,2));
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
