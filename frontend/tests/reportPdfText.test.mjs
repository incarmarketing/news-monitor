import assert from 'node:assert/strict';
import test from 'node:test';
import {pdfText} from '../src/reportPdfText.js';
import {buildReportPdfDefinition} from '../src/reportPdfModel.js';

test('Korean and Latin headlines keep their original font and exact text',()=>{
  assert.equal(pdfText('[보험저널] 보험설계사 「성장」 1200%'),'[보험저널] 보험설계사 「성장」 1200%');
});

test('CJK headline characters use the bundled fallback without dropping or replacing source text',()=>{
  const title='[디지털투데이] 해킹 공포에 보험 찾는 기업들…日 사이버 보험 시장 급성장 · 韓美中';
  const runs=pdfText(title);
  assert.equal(runs.map(run=>run.text).join(''),title);
  assert.ok(runs.filter(run=>run.font==='ReportCJK').map(run=>run.text).join('').includes('日'));
  assert.ok(runs.some(run=>run.font==='Pretendard' && run.text.includes('해킹')));
  const definition=buildReportPdfDefinition({title:'일일 언론 동향',articles:[{title,tone:'중립',category:'보험사',url:'https://example.com/original'}]});
  const entry=definition.content[3].columns[0].stack[1].table.body[0][2];
  assert.equal(entry.text.map(run=>run.text).join(''),title);
  assert.equal(entry.link,'https://example.com/original');
  assert.equal(entry.bold,true);
});
