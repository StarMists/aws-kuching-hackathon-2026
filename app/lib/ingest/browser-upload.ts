'use client';
import type { Document,Task } from '../contracts';
export interface BrowserTaskView {task:Task;document:Document|null;progress:{completed_pages:number;total_pages:number};}
export interface ProcessTaskOptions {signal?:AbortSignal;public_data_acknowledged?:boolean;}
const inFlight=new Map<string,Promise<BrowserTaskView>>();
async function readResponse(response:Response):Promise<BrowserTaskView> {
  const body=await response.json() as {data:BrowserTaskView;error?:{message?:string}};
  if(!response.ok)throw new Error(body?.error?.message||'The task could not be processed.');
  return body.data as BrowserTaskView;
}
function pause(ms:number,signal?:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Processing was interrupted.','AbortError'));return;}
    const cancel=()=>{clearTimeout(timer);reject(new DOMException('Processing was interrupted.','AbortError'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});
  });
}
/** Drives durable server slices. Closing this tab never erases the queued source or extracted pages. */
export function processDocumentTask(taskId:string,onProgress?:(view:BrowserTaskView)=>void,options:ProcessTaskOptions={}):Promise<BrowserTaskView> {
  const existing=inFlight.get(taskId);if(existing)return existing;
  const run=(async()=>{
    let view=await readResponse(await fetch(`/api/tasks/${encodeURIComponent(taskId)}`,{cache:'no-store',signal:options.signal}));onProgress?.(view);
    while(view.task.status==='queued'||view.task.status==='processing') {
      if(options.signal?.aborted)throw new DOMException('Processing was interrupted.','AbortError');
      view=await readResponse(await fetch(`/api/tasks/${encodeURIComponent(taskId)}/process`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({public_data_acknowledged:options.public_data_acknowledged===true}),signal:options.signal}));onProgress?.(view);
      if(view.task.status==='queued'||view.task.status==='processing')await pause(view.task.status==='queued'?1200:350,options.signal);
    }
    return view;
  })().finally(()=>inFlight.delete(taskId));inFlight.set(taskId,run);return run;
}
export async function resumeDocumentTasks(onProgress?:(view:BrowserTaskView)=>void,options:ProcessTaskOptions={}):Promise<void> {
  const response=await fetch('/api/tasks?status=active',{cache:'no-store',signal:options.signal});const body=await response.json() as {data:BrowserTaskView[];error?:{message?:string}};
  if(!response.ok)throw new Error(body?.error?.message||'Pending tasks could not be loaded.');
  // Respect durable queue order; never start a second authoritative client queue.
  for(const view of body.data as BrowserTaskView[])if(view.task.kind==='ingestion'&&(view.task.status==='queued'||view.task.status==='processing'))await processDocumentTask(view.task.id,onProgress,options);
}
