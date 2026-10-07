import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCitation,validateClaims,quoteId,selectEvidence,citationMarkdown} from '../lib/intelligence/evidence.ts';
const source={chunk_id:'chunk-a',document_id:'doc-a',document_title:'Synthetic circular',page_number:2,text:'Action A-17: Mira Tan must submit a report by 30 October 2026.',page_text:'Header\nAction A-17: Mira Tan must submit a report by 30 October 2026.\nFooter',score:1,source_sha256:'a'.repeat(64),version:'2',source_date:'2026-10-05',document_type:'circular'};
test('citations are derived from actual selected chunk/page, not model document IDs',async()=>{
 const citation=await validateCitation({chunk_id:'chunk-a',quote:'Mira Tan must submit a report'},[source]);
 assert.equal(citation.document_id,'doc-a');assert.equal(citation.page_number,2);assert.equal(citation.version,'2');assert.match(citation.quote_id,/^q_[0-9a-f]{24}$/);
 assert.match(citationMarkdown(citation),/document=doc-a&page=2&chunk=chunk-a&quote=q_/);
});
test('fabricated, foreign, wrong-page and malformed citations fail closed',async()=>{
 const cases=[
  {raw:{chunk_id:'foreign-chunk',quote:'Mira Tan'},sources:[source]},
  {raw:{chunk_id:'chunk-a',quote:'Approved contractor is Zeta'},sources:[source]},
  {raw:{chunk_id:'chunk-a',quote:'Mira Tan'},sources:[{...source,page_text:'An unrelated page'}]},
  {raw:{chunk_id:'chunk-a',quote:'Mira Tan'},sources:[{...source,page_number:0}]},
  {raw:{chunk_id:'chunk-a',quote:''},sources:[source]}
 ];
 for(const {raw,sources} of cases)await assert.rejects(()=>validateCitation(raw,sources),e=>['UNSUPPORTED_CITATION','INVALID_CITATION'].includes(e.code));
});
test('quote identity is stable across whitespace and changes with source hash',async()=>{
 assert.equal(await quoteId(source,'Mira  Tan\n must'),await quoteId(source,'Mira Tan must'));
 assert.notEqual(await quoteId(source,'Mira Tan'),await quoteId({...source,source_sha256:'b'.repeat(64)},'Mira Tan'));
});
test('claims need at least one real citation and unique IDs',async()=>{
 await assert.rejects(()=>validateClaims([{id:'a',text:'Something happened',citations:[]}],[source]),e=>e.code==='UNCITED_CLAIM');
 const claim={id:'a',text:'The recorded action belongs to Mira Tan.',citations:[{chunk_id:'chunk-a',quote:'Mira Tan must submit a report'}]};
 assert.equal((await validateClaims([claim],[source]))[0].support,'source-grounded');
 await assert.rejects(()=>validateClaims([claim,claim],[source]),e=>e.code==='UNCITED_CLAIM');
});
test('bounded evidence preserves cross-document coverage and discloses omissions',()=>{
 const sources=[0,1,2].flatMap(i=>[source,{...source,chunk_id:'chunk-b',document_id:'doc-b',text:'Revised date is recorded.'}].map((s,j)=>({...s,chunk_id:`chunk-${j}-${i}`})));
 const selected=selectEvidence(sources,['doc-a','doc-b'],10000,2);
 assert.deepEqual(selected.sources.map(s=>s.document_id),['doc-a','doc-b']);assert.equal(selected.coverage.truncated,true);
 const empty=selectEvidence(sources,['doc-a','doc-b'],1,2);assert.equal(empty.sources.length,0);assert.deepEqual(empty.coverage.excluded_document_ids,['doc-a','doc-b']);
});
