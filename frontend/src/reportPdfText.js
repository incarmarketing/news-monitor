import coverage from "./assets/fonts/cjk-coverage.json" with { type:"json" };

function hasCjkGlyph(point) {
  let low=0, high=coverage.ranges.length-1;
  while (low<=high) {
    const middle=(low+high)>>1;
    const [start,end]=coverage.ranges[middle];
    if (point<start) high=middle-1;
    else if (point>end) low=middle+1;
    else return true;
  }
  return false;
}

export function pdfText(value) {
  const text=String(value ?? "");
  const runs=[];
  let fallback=false;
  for (const char of text) {
    const font=hasCjkGlyph(char.codePointAt(0)) ? "ReportCJK" : "Pretendard";
    if (font==="ReportCJK") fallback=true;
    if (runs.at(-1)?.font===font) runs.at(-1).text+=char;
    else runs.push({text:char,font});
  }
  return fallback ? runs : text;
}
