import assert from "node:assert/strict";

const base="https://incarmarketing.github.io/news-monitor/";
async function json(url,options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
  return {status:response.status,headers:response.headers,body:await response.json()};
}
const config=await json(`${base}data/supabase.json`);
assert.equal(config.status,200);
const {url,anon_key:key}=config.body;
const headers={apikey:key,origin:new URL(base).origin,"content-type":"application/json"};
if (key.split(".").length===3) headers.Authorization=`Bearer ${key}`;
const call=(action,payload={})=>json(`${url}/functions/v1/dashboard-api`,{method:"POST",headers,body:JSON.stringify({action,payload})});
const snapshot=await call("snapshot");
assert.equal(snapshot.status,200);
assert.equal(snapshot.body.ok,true);
assert.ok(snapshot.body.data.articles.length>0);
assert.equal(snapshot.headers.get("cache-control"),"no-store");
const registry=await call("media_registry",{mode:"summary"});
assert.equal(registry.status,200);
const feed=await json(`${base}data/articles.json`);
assert.equal(feed.status,200);
assert.ok(feed.body.articles.length>0);
for (const name of ["summary","category_labels","tone_labels"]) assert.ok(name in feed.body);
const forbidden=await call("rest",{path:"news_articles",method:"GET"});
assert.equal(forbidden.status,401);
const net=await json(`${url}/rest/v1/http_request_queue?select=id&limit=0`,{headers:{...headers,"Accept-Profile":"net"}});
assert.equal(net.status,406);
assert.equal(net.body.code,"PGRST106");
console.log(JSON.stringify({passed:true,apiArticles:snapshot.body.data.articles.length,
  marketingFeedArticles:feed.body.articles.length,registryStatus:registry.status,
  privateRestStatus:forbidden.status,netRestStatus:net.status,warnings:snapshot.body.warnings}));
