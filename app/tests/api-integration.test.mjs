import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=process.env.QA_BASE_URL;
const authMode=process.env.QA_AUTH_MODE||'headers';
const live=process.env.QA_LIVE_AI==='true';
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures/synthetic-civic');
const run=randomUUID().slice(0,8),ownerA='synthetic-qa-a-'+run,ownerB='synthetic-qa-b-'+run;
let cookie='';
if(base&&!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('This mutating QA suite only accepts an isolated loopback preview.');
async function request(route,{method='GET',body,owner=ownerA,form,headers={},allowError=false,raw=false}={}){
 const h=new Headers(headers);
 if(owner){
  if(authMode==='headers'){h.set('oai-authenticated-user-id',owner);h.set('oai-authenticated-user-email',owner+'@synthetic.invalid');}
  else if(cookie)h.set('cookie',cookie);
 }
 if(body!==undefined)h.set('content-type','application/json');
 const response=await fetch(new URL(route,base),{method,headers:h,body:form||((body!==undefined)?JSON.stringify(body):undefined),signal:AbortSignal.timeout(30000)});
 if(raw)return response;
 const text=await response.text();let result;try{result=JSON.parse(text);}catch{throw Error(`${method} ${route}: HTTP ${response.status} returned non-JSON ${text.slice(0,120)}`);}
 if(!allowError)assert.ok(response.ok,`${method} ${route}: HTTP ${response.status} ${JSON.stringify(result)}`);
 return {status:response.status,result,data:result.data,error:result.error};
}
async function owned(route,opts){return (await request(route,opts)).data;}
async function ready(upload){
 assert.ok(upload?.document?.id);assert.ok(upload?.task?.id);
 let detail=await owned('/api/documents/'+upload.document.id);
 for(let i=0;detail.document.status!=='ready'&&i<12;i++){
  if(detail.document.status==='failed')throw Error(`Ingestion failed: ${detail.document.error_message}`);
  const progress=await request('/api/tasks/'+upload.task.id+'/process',{method:'POST',body:{},allowError:true});
  assert.ok(progress.status<500||!live,`Process error ${JSON.stringify(progress.result)}`);
  detail=await owned('/api/documents/'+upload.document.id);
 }
 assert.equal(detail.document.status,'ready',detail.document.error_message||'Document did not reach ready');return detail;
}
async function uploadText(text,projectId,extra={}){
 return owned('/api/documents',{method:'POST',body:{text,title:'SYNTHETIC QA '+run,filename:'synthetic-'+run+'.txt',document_type:'synthetic QA fixture',source_date:'2026-10-07',project_id:projectId,...extra}});
}
async function uploadFile(filename,projectId,extra={}){
 const bytes=await readFile(path.join(fixture,filename));const form=new FormData();
 const type=filename.endsWith('.pdf')?'application/pdf':filename.endsWith('.jpg')?'image/jpeg':'text/plain';
 form.set('file',new Blob([bytes],{type}),filename);form.set('project_id',projectId);form.set('title','SYNTHETIC '+filename);
 for(const [k,v]of Object.entries(extra))form.set(k,String(v));
 return {upload:await owned('/api/documents',{method:'POST',form}),bytes};
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('actual local Worker + D1/R2 integration (synthetic records only)',{skip:!base},async(t)=>{
 if(authMode==='cookie'){
  const signIn=await fetch(new URL('/signin-with-chatgpt?return_to=/',base),{redirect:'manual'});
  cookie=signIn.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert.ok(cookie,'Local sign-in must return a cookie');
 }
 let config,project,otherProject,foreignProject,doc,foreignDoc,upload,chat,note;
 await t.test('authenticated readiness is truthful; anonymous writes are rejected',async()=>{
  config=await owned('/api/config');assert.equal(typeof config.configured,'boolean');assert.equal(config.paid_calls_enabled,false);
  const health=await owned('/api/health');assert.ok(health);
  const anonymous=await request('/api/projects',{method:'POST',body:{name:'SYNTHETIC anonymous should fail'},owner:null,allowError:true});assert.equal(anonymous.status,401);
 });
 await t.test('projects create and reload durably with distinct scopes',async()=>{
  project=await owned('/api/projects',{method:'POST',body:{name:'SYNTHETIC Serai QA '+run,description:'Original fictional test corpus'}});
  otherProject=await owned('/api/projects',{method:'POST',body:{name:'SYNTHETIC Separate Scope '+run}});
  assert.notEqual(project.id,otherProject.id);
  const list=await owned('/api/projects');assert.ok(list.some(p=>p.id===project.id));
  const detail=await owned('/api/projects/'+project.id);assert.equal(detail.project.name,project.name);assert.deepEqual(detail.documents,[]);
 });
 await t.test('actual new text upload produces exact source pages, chunks and original-file bytes',async()=>{
  const value=431+Math.floor(Math.random()*500),nonce='FRESH-'+randomUUID();
  const text=`SYNTHETIC QA FIXTURE. Fictional Serai office. Fresh field record ${nonce}. The newly recorded west-ramp test width is ${value} cm. This number is invented solely for this QA run. It is not an official measurement. No signed approval or contractor identity is supplied.\n\f\nSYNTHETIC QA SECOND PAGE. Follow-up action belongs to Mira Tan and remains unresolved. The unique fresh record identifier is ${nonce}.`;
  upload=await uploadText(text,project.id,{title:'SYNTHETIC Fresh Record '+run});doc=await ready(upload);
  assert.equal(doc.document.page_count,2);assert.ok(doc.document.chunk_count>0);assert.equal(doc.pages[0].page_number,1);assert.equal(doc.pages[1].page_number,2);
  assert.equal(doc.pages[0].text,text.split('\f')[0]);assert.equal(doc.pages[1].text,text.split('\f')[1]);
  const original=await request('/api/documents/'+doc.document.id+'/file',{raw:true});assert.ok(original.ok);assert.equal(hash(Buffer.from(await original.arrayBuffer())),hash(Buffer.from(text)));
  doc.novel={nonce,value,text};
 });
 await t.test('keyword retrieval uses real uploaded chunks and enforces project scopes',async()=>{
  const hit=await owned('/api/search',{method:'POST',body:{query:doc.novel.nonce,project_id:project.id,mode:'keyword',limit:10}});
  assert.ok(hit.results.length>0);assert.ok(hit.results.every(r=>r.document_id===doc.document.id));assert.ok(hit.results.some(r=>r.text.includes(doc.novel.nonce)));assert.equal(hit.mode,'keyword');doc.search_hit=hit.results[0];
  const empty=await owned('/api/search',{method:'POST',body:{query:doc.novel.nonce,project_id:otherProject.id,mode:'keyword'}});assert.equal(empty.results.length,0);
  const invalid=await request('/api/search',{method:'POST',body:{query:'Serai',project_id:otherProject.id,document_ids:[doc.document.id],mode:'keyword'},allowError:true});assert.ok(invalid.status>=400&&invalid.status<500);
 });
 await t.test('native text PDF ingestion preserves actual pages and original bytes',async()=>{
  const result=await uploadFile('circular-v1.pdf',project.id,{document_type:'circular',source_date:'2026-09-14',version:'1'});
  const pdf=await ready(result.upload);assert.equal(pdf.pages.length,3);assert.match(pdf.pages[0].text,/12 November 2026/);assert.match(pdf.pages[1].text,/SERAI-47-PLUM-KITE/);
  const original=await request('/api/documents/'+pdf.document.id+'/file',{raw:true});assert.ok(original.ok);assert.equal(hash(Buffer.from(await original.arrayBuffer())),hash(result.bytes));
 });
 await t.test('attach/detach affects membership only and does not lose source records',async()=>{
  await owned('/api/projects/'+otherProject.id+'/documents',{method:'POST',body:{document_ids:[doc.document.id]}});
  assert.ok((await owned('/api/projects/'+otherProject.id)).documents.some(d=>d.id===doc.document.id));
  await owned('/api/projects/'+otherProject.id+'/documents',{method:'DELETE',body:{document_ids:[doc.document.id]}});
  assert.ok(!(await owned('/api/projects/'+otherProject.id)).documents.some(d=>d.id===doc.document.id));assert.equal((await owned('/api/documents/'+doc.document.id)).document.id,doc.document.id);
 });
 await t.test('notes and graph derive from actual project sources and reload',async()=>{
  note=await owned('/api/notes',{method:'POST',body:{project_id:project.id,title:'SYNTHETIC review '+run,content:'Needs a signed ramp assessment.',citations:[{document_id:doc.document.id,chunk_id:doc.search_hit.chunk_id,page_number:doc.search_hit.page_number,quote:doc.search_hit.text.slice(0,120)}]}});
  const edited=await owned('/api/notes/'+note.id,{method:'PATCH',body:{content:'SYNTHETIC edited: signed assessment still needed.',expected_updated_at:note.updated_at}});assert.match(edited.content,/edited/);
  const stale=await request('/api/notes/'+note.id,{method:'PATCH',body:{content:'Stale update must fail',expected_updated_at:note.updated_at},allowError:true});assert.equal(stale.status,409);assert.equal(stale.error.code,'NOTE_CHANGED');
  for(const citation of [{document_id:doc.document.id,chunk_id:doc.search_hit.chunk_id,page_number:999,quote:doc.search_hit.text.slice(0,120)},{document_id:doc.document.id,chunk_id:doc.search_hit.chunk_id,page_number:doc.search_hit.page_number,quote:'Fabricated approval not in source'}]){const forged=await request('/api/notes',{method:'POST',body:{project_id:project.id,title:'Forged citation must fail',content:'Synthetic',citations:[citation]},allowError:true});assert.equal(forged.status,400);}
  assert.ok((await owned('/api/projects/'+project.id)).notes.some(n=>n.id===note.id&&n.content.includes('edited')));
  const graph=await owned('/api/graph?project_id='+project.id);assert.ok(graph.nodes.some(n=>n.document_id===doc.document.id));
  const empty=await owned('/api/graph?project_id='+otherProject.id);assert.ok(!empty.nodes.some(n=>n.document_id===doc.document.id));
 });
 await t.test('no-key reasoning fails visibly without a fabricated answer',{skip:live||config?.configured},async()=>{
  chat=await owned('/api/chats',{method:'POST',body:{project_id:project.id,title:'SYNTHETIC no-key '+run}});
  const answer=await request('/api/chats/'+chat.id+'/messages',{method:'POST',body:{text:'What is the recorded ramp width?',document_ids:[doc.document.id],public_data_acknowledged:true},allowError:true});
  if(answer.status<400){
   assert.ok(answer.data.job?.id);const processed=await request('/api/jobs/'+answer.data.job.id+'/process',{method:'POST',body:{},allowError:true});
   const saved=await owned('/api/jobs/'+answer.data.job.id);assert.equal(saved.job?.status||saved.status,'failed');
   assert.ok(processed.error||saved.job?.error_message||saved.error_message);
  }else{assert.equal(answer.status,503);assert.match(answer.error.code,/AI_DISABLED|AI_NOT_CONFIGURED/);}
  const savedChat=await owned('/api/chats/'+chat.id);assert.ok(!savedChat.messages.some(m=>m.role==='assistant'&&m.status==='completed'&&m.parts?.some(p=>p.type==='text'&&p.text)));
  const brief=await request('/api/analysis',{method:'POST',body:{project_id:project.id,kind:'brief',document_ids:[doc.document.id],public_data_acknowledged:true},allowError:true});
  if(brief.status<400){const processed=await request('/api/analysis/'+brief.data.job.id+'/process',{method:'POST',body:{},allowError:true});const saved=await owned('/api/analysis/'+brief.data.job.id);assert.equal(saved.job?.status||saved.status,'failed');assert.ok(processed.error||saved.job?.error_message||saved.error_message);}else assert.equal(brief.status,503);
 });
 await t.test('no-key photo OCR fails honestly and preserves a retryable source',{skip:live||config?.ocr_configured},async()=>{
  const result=await uploadFile('field-slip-photo.jpg',project.id,{public_data_acknowledged:'true'});
  await request('/api/tasks/'+result.upload.task.id+'/process',{method:'POST',body:{},allowError:true});
  const detail=await owned('/api/documents/'+result.upload.document.id);assert.equal(detail.document.status,'failed');assert.ok(detail.document.error_message);assert.equal(detail.pages.length,0);
  const original=await request('/api/documents/'+detail.document.id+'/file',{raw:true});assert.ok(original.ok);assert.equal(hash(Buffer.from(await original.arrayBuffer())),hash(result.bytes));
 });
 await t.test('cross-owner direct IDs and mixed source lists are denied',{skip:authMode!=='headers'},async()=>{
  foreignProject=await owned('/api/projects',{method:'POST',body:{name:'SYNTHETIC foreign '+run},owner:ownerB});
  const foreignUpload=await owned('/api/documents',{method:'POST',owner:ownerB,body:{text:'SYNTHETIC FOREIGN SECRET KEYWORD OTHER-OWNER-'+run+'. This is fictional private content owned by QA B. It must never appear in QA A retrieval, files, graphs, chat or analysis. No personal real records are present.',title:'SYNTHETIC owner B',project_id:foreignProject.id}});
  foreignDoc=foreignUpload.document;
  for(const route of ['/api/projects/'+foreignProject.id,'/api/documents/'+foreignDoc.id,'/api/documents/'+foreignDoc.id+'/file','/api/tasks/'+foreignUpload.task.id]){
   const r=await request(route,{allowError:true});assert.ok([403,404].includes(r.status),route+' returned '+r.status);
  }
  const foreignSearch=await request('/api/search',{method:'POST',body:{query:'OTHER-OWNER-'+run,project_id:foreignProject.id,mode:'keyword'},allowError:true});assert.ok([403,404].includes(foreignSearch.status));
  const mixed=await request('/api/projects/'+project.id+'/documents',{method:'POST',body:{document_ids:[doc.document.id,foreignDoc.id]},allowError:true});assert.ok(mixed.status>=400&&mixed.status<500);
  const list=await owned('/api/documents');assert.ok(!list.some(d=>d.id===foreignDoc.id));
  if(chat){const denied=await request('/api/chats/'+chat.id,{owner:ownerB,allowError:true});assert.ok([403,404].includes(denied.status));}
  if(note){const denied=await request('/api/notes/'+note.id,{method:'PATCH',owner:ownerB,body:{content:'must not write'},allowError:true});assert.ok([403,404].includes(denied.status));}
 });
 if(process.env.QA_TEST_STATE&&project&&doc)await writeFile(process.env.QA_TEST_STATE,JSON.stringify({owner:ownerA,project_id:project.id,document_id:doc.document.id,task_id:upload.task.id,chat_id:chat?.id,note_id:note?.id,novel_nonce:doc.novel.nonce},null,2));
});
