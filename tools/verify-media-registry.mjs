import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend/dist");
const output = path.join(root, "out/media-registry");
await mkdir(output, {recursive:true});
const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png"};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const file = path.resolve(dist, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
  if (!file.startsWith(`${dist}${path.sep}`)) return response.writeHead(403).end();
  try {response.writeHead(200, {"Content-Type":mime[path.extname(file)] || "application/octet-stream"}); response.end(await readFile(file));}
  catch {response.writeHead(404).end();}
});
await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const snapshot = {articles:[],notifications:[],watchRuns:[],reportRuns:[],jobRuns:[],mediaRelations:[],reporters:[],aliases:[],keywords:[]};
const summary = {own_articles:971,as_of:new Date().toISOString(),byline_pending:10,
  media:[{name:"보험저널",article_count:31,verified_count:20,last_at:"2026-09-04"}],
  unknown:[{host:"news.google.com",portal:true,article_count:1,own_count:1,last_at:"2026-09-04"},{host:"publisher.example",portal:false,article_count:1,own_count:0,last_at:"2026-09-04"}],
  reporters:[{name:"홍길동",media:"보험저널",article_count:2,last_at:"2026-09-04"}]};
const browser = await chromium.launch({channel:"msedge",headless:true});
const results = [];
try {
  for (const width of [1366,1920,390]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    const errors = [], requests = [], writes = [];
    let fail = false;
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/*", async route => {
      const url=new URL(route.request().url());
      if(url.pathname.endsWith("supabase.json")) return route.fulfill({json:{url:"https://registry.test",anon_key:"public-test-key"}});
      if(url.pathname.endsWith("/dashboard-api")) {
        const body=route.request().postDataJSON();
        if(body.action==="media_registry") {
          requests.push(body.payload);
          if(fail) return route.fulfill({status:502,json:{error:"temporarily_unavailable"}});
          if(body.payload.mode==="summary") return route.fulfill({json:{ok:true,data:summary}});
          const offset=body.payload.offset || 0;
          return route.fulfill({json:{ok:true,data:{total:31,offset,page_size:30,rows:Array.from({length:offset?1:30},(_,i)=>({article_hash:`article-${offset+i}`,source:"보험저널",title:`${offset+i+1}. 인카금융서비스 보험설계사 교육 지원과 소비자보호 체계 개선을 위한 현장 활동 및 장기 운영 계획 발표`,link:"https://example.com/article",pub_date:"2026-09-04",own_mentioned:true,authors:[{name:"홍길동",method:"byline"}],byline_status:"verified",checked_at:"2026-09-07",evidence_url:"https://example.com/article"}))}}});
        }
        if(body.action==="rest" && body.payload.method==="POST") writes.push(body.payload);
        return route.fulfill({json:{ok:true,data:[]}});
      }
      if(/\/(operations|articles)\.json$/.test(url.pathname)) return route.fulfill({json:snapshot});
      if(url.origin!==base || url.pathname.includes("/data/")) return route.fulfill({json:{}});
      return route.continue();
    });
    await page.goto(`${base}/?section=dashboard`,{waitUntil:"networkidle"});
    assert.equal(requests.length,0,"dashboard must not request cumulative registry");
    await page.goto(`${base}/?section=management`,{waitUntil:"networkidle"});
    const registry=page.locator(".media-registry");
    await registry.getByRole("button",{name:"보험저널 기사 이력 보기",exact:true}).waitFor();
    assert.match(await registry.textContent(),/971/);
    assert.equal(requests.filter(r=>r.mode!=="summary").length,0,"article history is lazy");
    await registry.getByRole("button",{name:"보험저널 기사 이력 보기",exact:true}).click();
    await registry.locator(".registry-articles li").first().waitFor();
    assert.equal(await registry.locator(".registry-articles li").count(),30);
    await registry.getByRole("button",{name:"다음 페이지",exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll(".registry-articles li").length===1);
    assert.match(await registry.locator(".registry-headline").innerText(),/^31\./);
    assert.equal(await registry.locator(".registry-headline").getAttribute("href"),"https://example.com/article");
    await registry.getByRole("tab",{name:/언론사 미확인/}).click();
    await registry.getByRole("button",{name:"news.google.com 기사 이력 보기",exact:true}).click();
    await registry.locator(".registry-articles li").first().waitFor();
    assert.equal(await registry.getByText("해당 주소 언론사",{exact:true}).count(),0);
    const form=registry.locator(".registry-resolve").first();
    await form.getByLabel("확정 언론사명").fill("보험저널");
    await form.getByRole("button",{name:"확정",exact:true}).click();
    await form.getByRole("status").waitFor();
    assert.match(await form.getByRole("status").textContent(),/로그인/);
    assert.equal(await form.getByLabel("확정 언론사명").inputValue(),"보험저널");
    await page.evaluate(()=>sessionStorage.setItem("marketing_pr_session_v1",JSON.stringify({session_token:"test-session",session_expires_at:"2099-01-01T00:00:00Z"})));
    const savedArticle=page.waitForResponse(response=>response.url().endsWith("/dashboard-api") && response.request().postDataJSON()?.action==="rest");
    await form.getByRole("button",{name:"확정",exact:true}).click();
    await savedArticle;
    assert.equal(writes[0].path,"article_publisher_overrides?on_conflict=article_hash");
    assert.equal(writes[0].body[0].press_name,"보험저널");
    await registry.getByRole("tab",{name:/언론사 미확인/}).click();
    await registry.getByRole("button",{name:"publisher.example 기사 이력 보기",exact:true}).click();
    const hostForm=registry.locator(".registry-resolve").first();
    await hostForm.getByLabel("확정 언론사명").fill("새언론");
    const savedHost=page.waitForResponse(response=>response.url().endsWith("/dashboard-api") && response.request().postDataJSON()?.action==="rest");
    await hostForm.getByRole("button",{name:"확정",exact:true}).click();
    await savedHost;
    assert.equal(writes[1].path,"press_aliases?on_conflict=host");
    assert.equal(writes[1].body[0].host,"publisher.example");
    await registry.getByRole("tab",{name:"당사 보도 매체",exact:true}).click();
    await page.screenshot({path:path.join(output,`registry-${width}.png`),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,`page overflow ${width}: ${overflow}`);
    await page.getByRole("button",{name:"기자 관리",exact:true}).click();
    await registry.getByRole("button",{name:"홍길동 기사 이력 보기",exact:true}).waitFor();
    await registry.getByRole("button",{name:"홍길동 기사 이력 보기",exact:true}).click();
    await registry.locator(".registry-articles li").first().waitFor();
    assert.ok(requests.some(r=>r.mode==="reporter" && r.key==='["보험저널","홍길동"]'));
    await registry.getByRole("button",{name:"목록으로",exact:true}).click();
    fail=true;
    await registry.getByRole("button",{name:"누적 이력 새로고침",exact:true}).click();
    await registry.getByRole("alert").waitFor();
    assert.equal(await registry.getByRole("button",{name:"홍길동 기사 이력 보기",exact:true}).count(),1,"failed refresh preserves last data");
    assert.deepEqual(errors,[]);
    results.push({width,overflow,registryRequests:requests.length,passed:true});
    await page.close();
  }
  console.log(JSON.stringify({results,screenshots:output},null,2));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
