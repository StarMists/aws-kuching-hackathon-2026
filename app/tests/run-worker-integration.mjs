#!/usr/bin/env node
// One process tree keeps HTTP tests and Worker in the same isolated execution namespace.
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.QA_PORT||5174),base=`http://127.0.0.1:${port}`;
const temp=await mkdtemp(path.join(tmpdir(),'aitlau-qa-')),statePath=path.join(temp,'state.json');
let server,log='',exitCode=0;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 log='';
 server=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--inspector-port','0','--port',String(port)],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:temp},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 for(const stream of [server.stdout,server.stderr])stream.on('data',v=>{log+=v;process.stdout.write(v);});
 for(let i=0;i<120;i++){
  if(server.exitCode!==null)throw Error('Worker exited before readiness: '+log.slice(-2000));
  try{const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(800)});if(response.status!==503&&response.status!==502){console.log('QA local Worker ready');return;}}catch{}
  await pause(500);
 }
 throw Error('Worker did not become ready: '+log.slice(-2000));
}
async function stop(){
 if(!server||server.exitCode!==null)return;
 const child=server;
 try{process.platform==='win32'?child.kill('SIGTERM'):process.kill(-child.pid,'SIGTERM');}catch{}
 for(let i=0;i<30&&child.exitCode===null;i++)await pause(100);
 if(child.exitCode===null)try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}
 server=null;
}
async function testSuite(){
 return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--test','tests/api-integration.test.mjs'],{cwd:root,env:{...process.env,QA_BASE_URL:base,QA_AUTH_MODE:'headers',QA_TEST_STATE:statePath},stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>resolve(code??1));
 });
}
async function snapshot(state){
 const headers={'oai-authenticated-user-id':state.owner,'oai-authenticated-user-email':state.owner+'@synthetic.invalid'};
 const result={};
 for(const [key,route]of Object.entries({project:'/api/projects/'+state.project_id,document:'/api/documents/'+state.document_id,task:'/api/tasks/'+state.task_id,...(state.chat_id?{chat:'/api/chats/'+state.chat_id}:{})})){
  const response=await fetch(base+route,{headers,signal:AbortSignal.timeout(10000)});assert.ok(response.ok,`Persistence read ${route} returned ${response.status}`);result[key]=await response.json();
 }
 return result;
}
try{
 await start();exitCode=await testSuite();
 let state;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{}
 if(state){
  const before=await snapshot(state);await stop();await start();const after=await snapshot(state);assert.deepEqual(after,before,'Actual D1/R2/API envelopes must survive a Worker restart unchanged');
  console.log('PASS actual Worker restart preserved project, documents/pages, tasks, notes and any saved chat envelopes.');
  const source=await fetch(base+'/api/documents/'+state.document_id+'/file',{headers:{'oai-authenticated-user-id':state.owner,'oai-authenticated-user-email':state.owner+'@synthetic.invalid'}});assert.ok(source.ok);assert.ok((await source.text()).includes(state.novel_nonce));
  console.log('PASS private original R2 file survives actual Worker restart.');
  if(process.env.QA_REPORT_PATH)await writeFile(process.env.QA_REPORT_PATH,JSON.stringify({created_at:new Date().toISOString(),base,test_exit_code:exitCode,restart_persistence:'pass',original_file_after_restart:'pass',synthetic_state:state},null,2));
 }else{console.error('Persistence restart not run: no successful source record from API suite.');exitCode=1;}
}catch(error){console.error(error);exitCode=1;}finally{await stop();}
process.exitCode=exitCode;
