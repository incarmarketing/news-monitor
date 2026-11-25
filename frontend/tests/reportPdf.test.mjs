import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportPdfDefinition, REPORT_PDF_MARGIN } from '../src/reportPdfModel.js';

const model={title:'일일 언론 동향',scope:'2026-11-25 당일',period:'daily',stats:[{label:'분석',value:'171건'},{label:'리스크',value:'LOW'}],articles:[{title:'[보험저널] 제목을 자르지 않고 보존하는 보험대리점 기사',tone:'주의',category:'당사',url:'https://www.insjournal.co.kr/news/articleView.html?idxno=34047'}],categories:[{name:'당사',value:3,color:'#397153'}],publishers:[{name:'보험저널',value:10}],chart:[{date:'2026-11-24',dateLabel:'11/24',total:8},{date:'2026-11-25',dateLabel:'11/25',total:3}]};

test('PDF layout fixes landscape A4 and 10mm margins in the document, not the printer',()=>{
  const definition=buildReportPdfDefinition(model);
  assert.equal(definition.pageSize,'A4');
  assert.equal(definition.pageOrientation,'landscape');
  assert.deepEqual(definition.pageMargins,[REPORT_PDF_MARGIN,REPORT_PDF_MARGIN,REPORT_PDF_MARGIN,34]);
  assert.equal(definition.defaultStyle.font,'Pretendard');
  assert.equal(definition.content[3].columns[0].stack[1].table.dontBreakRows,true);
});

test('full article text remains selectable and original HTTP links remain clickable',()=>{
  const table=buildReportPdfDefinition(model).content[3].columns[0].stack[1].table;
  assert.equal(table.body[0][2].text,model.articles[0].title);
  assert.equal(table.body[0][2].link,model.articles[0].url);
  const unsafe=buildReportPdfDefinition({...model,articles:[{...model.articles[0],url:'javascript:alert(1)'}]});
  assert.equal(unsafe.content[3].columns[0].stack[1].table.body[0][2].link,undefined);
});

test('chart SVG escapes labels and invalid colors cannot inject markup',()=>{
  const definition=buildReportPdfDefinition({...model,chart:[{dateLabel:'<script> &',total:2}],categories:[{name:'당사',value:1,color:'red"/>'}]});
  const sidebar=definition.content[3].columns[1].stack;
  assert.ok(sidebar.at(-1).svg.includes('&lt;script&gt; &amp;'));
  assert.ok(!JSON.stringify(sidebar[1]).includes('red'));
});

test('empty reports export an honest empty state and invalid documents fail early',()=>{
  const definition=buildReportPdfDefinition({...model,articles:[],categories:[],publishers:[],chart:[]});
  assert.equal(definition.content[3].columns[0].stack[1].text,'우선 확인할 기사가 없습니다.');
  assert.throws(()=>buildReportPdfDefinition({}),/report_document_not_ready/);
});
