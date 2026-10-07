import test from 'node:test';
import assert from 'node:assert/strict';
import {runAnalysis} from '../lib/intelligence/workflows.ts';
const sources=[
 {chunk_id:'old-c',document_id:'old-doc',document_title:'Synthetic old circular',page_number:1,text:'Planned launch: 12 November 2026. Approval remains unresolved.',page_text:'Planned launch: 12 November 2026. Approval remains unresolved.',score:1,version:'1',source_date:'2026-09-14',source_sha256:'a'.repeat(64)},
 {chunk_id:'new-c',document_id:'new-doc',document_title:'Synthetic new circular',page_number:1,text:'Revised planned launch: 19 November 2026. This supersedes the old planning date.',page_text:'Revised planned launch: 19 November 2026. This supersedes the old planning date.',score:1,version:'2',source_date:'2026-10-05',source_sha256:'b'.repeat(64)}
];
const coverage={selected_document_count:2,included_document_count:2,total_chunk_count:2,included_chunk_count:2,truncated:false,excluded_document_ids:[]};
const receipt={provider:'gemini',model:'synthetic-mock-only',usage:{input_tokens:1,output_tokens:1,total_tokens:2},latency_ms:0,fallback_used:false,attempts:1,cached:false};
const oldClaim={id:'old',text:'The old source proposes 12 November 2026.',citations:[{chunk_id:'old-c',quote:'Planned launch: 12 November 2026.'}]};
const newClaim={id:'new',text:'The revised source proposes 19 November 2026.',citations:[{chunk_id:'new-c',quote:'Revised planned launch: 19 November 2026.'}]};
const finding=(extra={})=>({id:'finding',type:'question',title:'Synthetic finding',claim_ids:[],old_claim_ids:[],new_claim_ids:[],date:null,date_basis:'unspecified',change_type:null,old_outcome:null,new_outcome:null,questions:[],...extra});
const response=(extra={})=>({title:'SYNTHETIC MOCK ONLY',claims:[],sections:[],findings:[],missing_evidence:[],...extra});
const run=(kind,raw,input={})=>runAnalysis({project_id:'synthetic-project',kind,public_data_acknowledged:true,...input},sources,coverage,async()=>({...receipt,text:JSON.stringify(raw)}));
test('MOCK ONLY: absent evidence stays an evidence question, not an invented negative fact',async()=>{
 const result=await run('gap',response({findings:[finding({questions:['Can the signed procurement clearance be supplied?']})],missing_evidence:['The selected excerpts do not identify an approved supplier.']}));
 assert.equal(result.content.claims.length,0);assert.equal(result.content.findings[0].review.status,'unreviewed');assert.match(result.markdown,/Insufficient evidence/);assert.match(result.markdown,/Can the signed procurement clearance be supplied/);
});
test('MOCK ONLY: a conflict requires actual evidence on both sides',async()=>{
 await assert.rejects(()=>run('conflict',response({claims:[oldClaim],findings:[finding({old_claim_ids:['old']})]})),e=>e.code==='UNSUPPORTED_CONFLICT');
 const result=await run('conflict',response({claims:[oldClaim,newClaim],findings:[finding({old_claim_ids:['old'],new_claim_ids:['new'],change_type:'superseded'})]}));
 assert.equal(result.content.findings[0].change_type,'superseded');assert.equal(result.content.claims[0].evidence[0].document_id,'old-doc');assert.equal(result.content.claims[1].evidence[0].document_id,'new-doc');
});
test('MOCK ONLY: old/new rule references must cite the explicitly selected documents',async()=>{
 await assert.rejects(()=>run('impact',response({claims:[newClaim],findings:[finding({old_claim_ids:['new'],new_claim_ids:['new']})]}),{previous_document_id:'old-doc',new_document_id:'new-doc'}),e=>e.code==='INVALID_VERSION_CITATION');
});
test('MOCK ONLY: replay with missing case/rule evidence is indeterminate and never labelled historical',async()=>{
 const caseText='Synthetic hypothetical harbour replacement with unknown supplier.';
 const result=await run('replay',response({findings:[finding({old_outcome:'supported',new_outcome:'unsupported',questions:['Supply a relevant source and the actual case facts.']})]}),{case_text:caseText,previous_document_id:'old-doc',new_document_id:'new-doc'});
 assert.equal(result.content.findings[0].old_outcome,'indeterminate');assert.equal(result.content.findings[0].new_outcome,'indeterminate');assert.equal(result.content.case_text,caseText);assert.match(result.markdown,/conditional comparison/);assert.match(result.markdown,/not a historical case outcome/);
});
test('MOCK ONLY: model-authored date text alone cannot establish explicit event date',async()=>{
 const invented={...oldClaim,text:'The launch is 2099-01-01.'};
 const result=await run('timeline',response({claims:[invented],findings:[finding({claim_ids:['old'],date:'2099-01-01',date_basis:'explicit'})]}));
 assert.equal(result.content.findings[0].date,null);assert.equal(result.content.findings[0].date_basis,'unspecified');
});
test('MOCK ONLY: quoted natural dates normalize and timeline sorts by actual calendar order',async()=>{
 const result=await run('timeline',response({claims:[oldClaim,newClaim],findings:[finding({id:'later',claim_ids:['new'],date:'2026-11-19',date_basis:'explicit'}),finding({id:'earlier',claim_ids:['old'],date:'12 November 2026',date_basis:'explicit'})]}));
 assert.deepEqual(result.content.findings.map(f=>f.id),['earlier','later']);assert.equal(result.content.findings[0].date_basis,'explicit');
});
