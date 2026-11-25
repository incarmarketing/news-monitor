import { chartGeometry } from "./chartPresentation.js";
import { pdfText } from "./reportPdfText.js";

export const REPORT_PDF_MARGIN = 72 * 10 / 25.4;
const ink = "#131615", muted = "#686e6b", line = "#cdd1cf";
const tones = { "긍정": ["#397153", "#e7f0e9"], "주의": ["#a45a12", "#fbebd7"], "부정": ["#b33739", "#f7e7e7"] };
const xml = value => String(value || "").replace(/[<>&"']/g, char => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" })[char]);
const safeUrl = value => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
const color = value => /^#[\da-f]{6}$/i.test(value || "") ? value : "#7b901c";
const text = (root,selector) => root.querySelector(selector)?.textContent.trim() || "";

export function readReportPdfModel(sheet) {
  if (!sheet) throw new Error("report_document_not_ready");
  const bars = selector => [...sheet.querySelectorAll(selector)].map(row=>({name:text(row,":scope > span"),value:Number(row.dataset.count || 0),color:row.dataset.color}));
  return {
    title:text(sheet,".newspaper-nameplate h2"), scope:text(sheet,".newspaper-publisher span"),
    period:["daily","weekly","monthly"].find(period=>sheet.classList.contains(period)) || "daily",
    stats:[...sheet.querySelectorAll(".newspaper-metric-band button")].map(row=>({label:text(row,"span"),value:text(row,"b")})).sort((a,b)=>Number(a.label === "리스크")-Number(b.label === "리스크")),
    articles:[...sheet.querySelectorAll(".a4-priority-card")].map(row=>({title:text(row,".a4-priority-main > b"),tone:text(row,".a4-priority-meta .chip:first-child"),category:text(row,".a4-priority-meta .chip:nth-child(2)"),url:row.getAttribute("href")})),
    categories:bars(".a4-bar-list > div"), publishers:bars(".a4-press-rows > button"),
    articleTitle:text(sheet,".newspaper-article-desk .newspaper-panel-heading b"),
    pressTitle:sheet.dataset.pdfPressTitle || "언론사 보도량",
    chartTitle:text(sheet,".newspaper-data-section:last-child .newspaper-panel-heading b"),
    chart:JSON.parse(sheet.querySelector(".report-count-chart")?.dataset.pdfChart || "[]"),
    rule:text(sheet,".newspaper-footer span:last-child"),
  };
}

function chartSvg(rows = []) {
  const width = 258, height = 104;
  const normalized = rows.map(row => ({ ...row, total: Math.max(0, Number(row.total) || 0) }));
  const { padding, ticks, x, y } = chartGeometry(normalized, [{ key:"total" }], width, height, true);
  const grid = ticks.map(tick => `<line x1="${padding.left}" x2="${width-padding.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${line}" stroke-width="0.4"/><text x="${padding.left-6}" y="${y(tick)+3}" text-anchor="end">${tick}</text>`).join("");
  const labels = normalized.map((row,index) => `<text x="${x(index)}" y="${height-8}" text-anchor="middle">${xml(row.dateLabel || row.date)}</text>`).join("");
  const points = normalized.map((row,index) => `${x(index)},${y(row.total)}`).join(" ");
  const dots = normalized.map((row,index) => `<circle cx="${x(index)}" cy="${y(row.total)}" r="2" fill="white" stroke="#7b901c" stroke-width="1"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Pretendard" font-size="7" fill="${muted}">${grid}${labels}<polyline points="${points}" fill="none" stroke="#7b901c" stroke-width="1.3"/>${dots}</g></svg>`;
}

function barTable(rows = []) {
  const max = Math.max(1, ...rows.map(row => Number(row.value) || 0));
  return { table:{ widths:[75,127,40], body:rows.map(row => [
    { text:pdfText(row.name), fontSize:9.5 },
    { svg:`<svg xmlns="http://www.w3.org/2000/svg" width="127" height="10"><rect width="127" height="10" rx="2" fill="#f0f1f2"/><rect width="${127*Math.max(0,Number(row.value)||0)/max}" height="10" rx="2" fill="${color(row.color)}"/></svg>`, width:127, margin:[0,2,0,0] },
    { text:`${Number(row.value || 0).toLocaleString("ko-KR")}건`, bold:true, alignment:"right", fontSize:9.5 },
  ]) }, layout:{ hLineWidth:()=>0, vLineWidth:()=>0, paddingLeft:()=>0, paddingRight:()=>5, paddingTop:()=>3, paddingBottom:()=>3 } };
}

function sectionTitle(text) { return { text:pdfText(text), fontSize:13, bold:true, margin:[0,0,0,8] }; }

export function buildReportPdfDefinition(model) {
  if (!model?.title || !Array.isArray(model.articles)) throw new Error("report_document_not_ready");
  const categoryRows = model.categories || [];
  const pressRows = model.publishers || [];
  const articleBody = model.articles.map((article,index) => {
    const [foreground, background] = tones[article.tone] || [muted,"#f0f1f2"];
    return [
      { text:String(index+1).padStart(2,"0"), alignment:"center", bold:true, fontSize:14, margin:[0,2,0,0] },
      { stack:[{ text:article.tone || "중립", color:foreground, background, bold:true },{ text:article.category || "기타", margin:[0,4,0,0] }], fontSize:8.5, alignment:"center" },
      { text:pdfText(article.title), fontSize:10.5, bold:true, lineHeight:1.25, color:ink, link:safeUrl(article.url), margin:[0,2,0,0] },
    ];
  });
  const publisherPairs = [];
  for (let i=0; i<pressRows.length; i+=2) publisherPairs.push([pressRows[i],pressRows[i+1]].map(row => row ? { columns:[{ text:pdfText(row.name), fontSize:9.5, width:"*" },{ text:`${Number(row.value || 0).toLocaleString("ko-KR")}건`, fontSize:10, bold:true, width:36, alignment:"right" }], columnGap:4 } : ""));
  const sidebar = [sectionTitle("분류별 기사량"),
    categoryRows.length ? barTable(categoryRows) : {text:"집계 데이터 없음",color:muted},
    { columns:[{ text:"표시 분류 합계", width:"*" },{ text:`${categoryRows.reduce((sum,row)=>sum+Number(row.value || 0),0).toLocaleString("ko-KR")}건`, bold:true, alignment:"right", width:60 }], fontSize:9, margin:[0,10,0,12] },
    sectionTitle(model.pressTitle || "언론사 보도량"),
    ...(publisherPairs.length ? [{ table:{ widths:["*","*"], body:publisherPairs }, layout:{ hLineWidth:()=>0, vLineWidth:()=>0, paddingLeft:()=>0, paddingRight:()=>8, paddingTop:()=>3, paddingBottom:()=>3 } }] : [{text:"집계 데이터 없음",color:muted}]),
    { ...sectionTitle(model.chartTitle || "기사 수"), margin:[0,12,0,4] },
    model.chart?.length ? {svg:chartSvg(model.chart),width:258} : {text:"집계 데이터 없음",color:muted},
  ];
  return {
    info:{ title:`${model.title} ${model.scope || ""}`.trim(), creator:"INCAR Media Monitoring" },
    pageSize:"A4", pageOrientation:"landscape", pageMargins:[REPORT_PDF_MARGIN,REPORT_PDF_MARGIN,REPORT_PDF_MARGIN,34],
    defaultStyle:{font:"Pretendard",fontSize:10,color:ink,lineHeight:1.15},
    content:[
      { columns:[{text:pdfText(model.title),bold:true,fontSize:22,width:"auto"},{text:(model.stats || []).flatMap(stat=>[{text:pdfText(`${stat.label} `),fontSize:8.5},{text:pdfText(`${stat.value}   `),bold:true,fontSize:13}]),width:"*",margin:[10,8,0,0]}], columnGap:10 },
      {text:model.scope || "",fontSize:8,color:muted,alignment:"right",margin:[0,3,0,8]},
      {canvas:[{type:"line",x1:0,y1:0,x2:785.19,y2:0,lineWidth:0.8,lineColor:ink}],margin:[0,0,0,12]},
      { columns:[{width:"*",stack:[sectionTitle(model.articleTitle || "우선 확인 기사"),articleBody.length ? {table:{widths:[24,42,"*"],heights:model.period==="daily"?44:23,body:articleBody,dontBreakRows:true},layout:{hLineWidth:index=>index?0.5:0,vLineWidth:()=>0,hLineColor:()=>line,paddingLeft:()=>0,paddingRight:index=>index<2?10:0,paddingTop:()=>9,paddingBottom:()=>9}} : {text:"우선 확인할 기사가 없습니다.",color:muted}]},{width:258,stack:sidebar}],columnGap:22},
    ],
    footer:(current,pageCount)=>({margin:[REPORT_PDF_MARGIN,0,REPORT_PDF_MARGIN,0],stack:[{canvas:[{type:"line",x1:0,y1:0,x2:785.19,y2:0,lineWidth:0.8,lineColor:ink}]},{columns:[{text:`집계 구간: ${model.scope || "-"}`,width:"*"},{text:model.rule || "",width:"auto"},{text:`${current} / ${pageCount}`,width:34,alignment:"right"}],fontSize:7.5,color:muted,columnGap:12,margin:[0,6,0,0]}]}),
  };
}
