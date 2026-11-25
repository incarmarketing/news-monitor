import runtimeUrl from "pdfmake/build/pdfmake.min.js?url";
import regularUrl from "pretendard/dist/web/static/woff/Pretendard-Regular.woff?url";
import boldUrl from "pretendard/dist/web/static/woff/Pretendard-Bold.woff?url";
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
  pdfMake.addFonts({Pretendard:{normal:new URL(regularUrl,location.href).href,bold:new URL(boldUrl,location.href).href,italics:new URL(regularUrl,location.href).href,bolditalics:new URL(boldUrl,location.href).href}});
  pdfMake.setUrlResourceCaching(true);
  let timer;
  try {
    return await Promise.race([
      pdfMake.createPdf(buildReportPdfDefinition(model)).getBlob(),
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
