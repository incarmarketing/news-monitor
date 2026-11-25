import runtimeUrl from "pdfmake/build/pdfmake.min.js?url";
import regularUrl from "pretendard/dist/web/static/woff/Pretendard-Regular.woff?url";
import boldUrl from "pretendard/dist/web/static/woff/Pretendard-Bold.woff?url";
import cjkRegularUrl from "./assets/fonts/IncarReportCJK-Regular.woff?url";
import cjkBoldUrl from "./assets/fonts/IncarReportCJK-Bold.woff?url";
import pdfLicenseUrl from "./assets/licenses/pdfmake-MIT.txt?url&no-inline";
import textLicenseUrl from "./assets/licenses/Pretendard-OFL.txt?url&no-inline";
import cjkLicenseUrl from "./assets/licenses/NotoSansKR-OFL.txt?url&no-inline";
import { buildReportPdfDefinition } from "./reportPdfModel.js";

let runtimePromise;
function loadPdfRuntime() {
  if (!runtimePromise) runtimePromise = new Promise((resolve,reject) => {
    const script=document.createElement("script");
    const fail=()=>{window.clearTimeout(timer);script.remove();reject(new Error("pdf_runtime_unavailable"));};
    const timer=window.setTimeout(fail,30000);
    script.src=runtimeUrl; script.async=true;
    script.onload=()=>{window.clearTimeout(timer);if (window.pdfMake) resolve(window.pdfMake);else fail();};
    script.onerror=fail;
    document.head.appendChild(script);
  }).catch(error=>{runtimePromise=undefined;throw error;});
  return runtimePromise;
}

export async function createReportPdf(model) {
  const pdfMake=await loadPdfRuntime();
  const absolute=value=>new URL(value,location.href).href;
  pdfMake.addFonts({
    Pretendard:{normal:absolute(regularUrl),bold:absolute(boldUrl),italics:absolute(regularUrl),bolditalics:absolute(boldUrl)},
    ReportCJK:{normal:absolute(cjkRegularUrl),bold:absolute(cjkBoldUrl),italics:absolute(cjkRegularUrl),bolditalics:absolute(cjkBoldUrl)},
  });
  pdfMake.setUrlResourceCaching(true);
  const definition=buildReportPdfDefinition(model);
  definition.info.subject=`Open-source notices:\n${[pdfLicenseUrl,textLicenseUrl,cjkLicenseUrl].map(absolute).join("\n")}`;
  let timer;
  try {
    return await Promise.race([
      pdfMake.createPdf(definition).getBlob(),
      new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error("pdf_generation_timeout")),45000);}),
    ]);
  } finally { window.clearTimeout(timer); }
}

export async function downloadReportPdf(model) {
  const blob=await createReportPdf(model);
  if (!blob?.size) throw new Error("empty_report_pdf");
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;
  link.download=`${model.title} ${model.scope || ""}`.replace(/[<>:"/\\|?*\x00-\x1f]/g," ").trim()+".pdf";
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
