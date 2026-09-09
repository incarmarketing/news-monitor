import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceDir = fileURLToPath(new URL("../src/", import.meta.url));
const files = fs.readdirSync(sourceDir).filter(name => /\.(jsx?|mjs)$/.test(name)).map(name => path.join(sourceDir,name));
const sourceFiles = new Set(files.map(file=>path.resolve(file)));
const program = ts.createProgram(files, {allowJs:true,checkJs:true,noEmit:true,
  jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  target:ts.ScriptTarget.ES2022,skipLibCheck:true});
// This is a missing-symbol gate, not a claim that untyped legacy code is type-safe.
const errors = ts.getPreEmitDiagnostics(program).filter(item =>
  [2304,2552,2451,2454].includes(item.code) && item.file && sourceFiles.has(path.resolve(item.file.fileName)));
for (const error of errors) {
  const line = error.file.getLineAndCharacterOfPosition(error.start).line+1;
  console.error(`${path.basename(error.file.fileName)}:${line} ${ts.flattenDiagnosticMessageText(error.messageText," ")}`);
}
console.log(`Checked ${files.length} frontend modules; ${errors.length} unresolved or invalid local references.`);
if (errors.length) process.exitCode=1;
