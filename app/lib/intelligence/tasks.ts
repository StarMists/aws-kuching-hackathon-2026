import { db,first,newId,now,parseJson,scopedDocuments } from '../db';
import { ApiError } from '../http';
import { ownedTask,taskView,type StoredTask } from '../ingest/tasks';
import { createAnalysisJob,processAnalysisJob,retryAnalysisJob,stopAnalysisJob } from './jobs';
import type { AnalysisInput } from './workflows';
import type { SourceSnapshot } from './sources';
export async function processIntelligenceTask(owner:string,id:string) {
  const initial=await ownedTask(owner,id);
  if(initial.kind==='ingestion')throw new ApiError(400,'WRONG_TASK_KIND','Use the source ingestion processor for this task.');
  if(['completed','failed','stopped','idle'].includes(initial.status))return taskView(owner,id);
  const time=now(),claim=newId(),expiry=new Date(Date.now()+60000).toISOString();
  const task=await db().prepare("UPDATE tasks SET status='processing',attempt=attempt+1,claim_id=?,lease_expires_at=?,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND kind<>'ingestion' AND (status='queued' OR (status='processing' AND (claim_id IS NULL OR lease_expires_at<?))) AND NOT EXISTS (SELECT 1 FROM tasks other WHERE other.owner_id=? AND other.id<>? AND other.status='processing') AND (status='processing' OR NOT EXISTS (SELECT 1 FROM tasks earlier WHERE earlier.owner_id=? AND earlier.status='queued' AND (COALESCE(earlier.queue_position,2147483647)<COALESCE(tasks.queue_position,2147483647) OR (COALESCE(earlier.queue_position,2147483647)=COALESCE(tasks.queue_position,2147483647) AND earlier.created_at<tasks.created_at)))) RETURNING *").bind(claim,expiry,time,id,owner,time,owner,id,owner).first<StoredTask>();
  if(!task)return taskView(owner,id);
  try {
    const input=parseJson<AnalysisInput&{source_hashes?:Record<string,string|null>}>(task.request_json,{project_id:task.project_id||'',kind:task.kind as AnalysisInput['kind']});input.kind=task.kind as AnalysisInput['kind'];
    let existing=await first<{id:string;status:string}>('SELECT id,status FROM analysis_jobs WHERE id=? AND owner_id=?',id,owner);
    if(!existing){const docs=await scopedDocuments(owner,null,input.document_ids),snapshot:SourceSnapshot[]=docs.map(doc=>({document_id:doc.id,source_sha256:input.source_hashes?.[doc.id]??doc.source_sha256,version:doc.version,title:doc.title}));await createAnalysisJob(owner,input,{id,snapshot});existing={id,status:'queued'};}
    else if(['failed','stopped'].includes(existing.status)&&initial.status==='queued')await retryAnalysisJob(owner,id);
    const result=await processAnalysisJob(owner,id,{parent_task_id:id,parent_claim_id:claim});
    const status=result.job.status==='completed'?'completed':result.job.status==='failed'?'failed':result.job.status==='stopped'?'stopped':'processing';
    await db().prepare("UPDATE tasks SET status=?,result_artifact_id=?,model=?,error_message=?,claim_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status='processing'").bind(status,result.artifact?.id||null,result.artifact?`${(result.artifact.content as {receipt?:{provider?:string;model?:string}}).receipt?.provider}:${(result.artifact.content as {receipt?:{provider?:string;model?:string}}).receipt?.model}`:null,result.job.error_message,now(),id,owner,claim).run();
    return {...await taskView(owner,id),analysis_job:result.job,artifact:result.artifact};
  } catch(error) {const message=error instanceof Error?error.message:'The intelligence task failed.';await db().prepare("UPDATE tasks SET status='failed',error_message=?,claim_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status='processing'").bind(message,now(),id,owner,claim).run();return taskView(owner,id);}
}
export async function stopIntelligenceTask(owner:string,id:string) {const task=await ownedTask(owner,id);if(task.kind==='ingestion')throw new ApiError(400,'WRONG_TASK_KIND','Stop ingestion through its task controls.');if(await first<{id:string}>('SELECT id FROM analysis_jobs WHERE id=? AND owner_id=?',id,owner))await stopAnalysisJob(owner,id);return taskView(owner,id);}
