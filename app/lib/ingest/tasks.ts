import { AIError, aiReadiness, extractVisionPage } from '../ai';
import type { Document, Page, Task } from '../contracts';
import { all, bucket, db, first, newId, now, ownedDocument, parseJson } from '../db';
import { ApiError } from '../http';
import { reserveAIUsage,completeAIUsage } from '../intelligence/usage';
import { chunkPageText } from './chunks';
import { bytesToBase64 } from './images';
import { INGEST_LIMITS, type IngestionManifest, type IngestionPage, type IngestionRequest } from './limits';

export type StoredTask=Task&{kind:string;request_json:string;claim_id:string|null;lease_expires_at:string|null;queue_position?:number|null};
export interface TaskView { task:StoredTask; document:Document|null; progress:{completed_pages:number;total_pages:number}; }
export async function ownedTask(owner:string,id:string):Promise<StoredTask> {
  const task=await first<StoredTask>('SELECT * FROM tasks WHERE id=? AND owner_id=?',id,owner);
  if(!task)throw new ApiError(404,'TASK_NOT_FOUND','This task was not found in your workspace.');
  return task;
}
export async function taskView(owner:string,id:string):Promise<TaskView> {
  const task=await ownedTask(owner,id);
  const document=task.document_id?await ownedDocument(owner,task.document_id):null;
  const progress=document?await first<{completed_pages:number}>('SELECT COUNT(*) AS completed_pages FROM pages WHERE document_id=?',document.id):null;
  return {task,document,progress:{completed_pages:progress?.completed_pages||0,total_pages:document?.page_count||0}};
}
export async function listTaskViews(owner:string,status?:string|null,projectId?:string|null):Promise<TaskView[]> {
  const values:(string|number|null)[]=[owner];let sql='SELECT * FROM tasks WHERE owner_id=?';
  if(status==='active')sql+=" AND status IN ('idle','queued','processing')";
  else if(status) {
    if(!['idle','queued','processing','completed','failed','stopped'].includes(status))throw new ApiError(400,'INVALID_TASK_STATUS','Choose a canonical task status.');
    sql+=' AND status=?';values.push(status);
  }
  if(projectId){sql+=' AND project_id=?';values.push(projectId);}
  sql+=" ORDER BY CASE WHEN status='processing' THEN 0 WHEN status='queued' THEN 1 ELSE 2 END,COALESCE(queue_position,2147483647),created_at LIMIT 100";
  const tasks=await all<StoredTask>(sql,...values);
  if(!tasks.length)return [];
  const documents=await all<Document>('SELECT * FROM documents WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))',owner,JSON.stringify(tasks.map(task=>task.document_id||'')));
  const progress=await all<{document_id:string;completed_pages:number}>('SELECT document_id,COUNT(*) AS completed_pages FROM pages WHERE document_id IN (SELECT value FROM json_each(?)) GROUP BY document_id',JSON.stringify(documents.map(document=>document.id)));
  return tasks.map(task=>{const document=documents.find(row=>row.id===task.document_id)||null;return {task,document,progress:{completed_pages:progress.find(row=>row.document_id===document?.id)?.completed_pages||0,total_pages:document?.page_count||0}};});
}
export async function processIngestionTask(owner:string,id:string):Promise<TaskView> {
  const initial=await ownedTask(owner,id);
  if(initial.kind!=='ingestion')throw new ApiError(400,'WRONG_TASK_KIND','This is not a document ingestion task.');
  if(['completed','failed','stopped','idle'].includes(initial.status))return taskView(owner,id);
  const time=now(),claim=newId(),expiry=new Date(Date.now()+60_000).toISOString();
  // A per-owner serial queue and claim fencing preserve the original one-task-at-a-time invariant.
  const claimed=await db().prepare(`UPDATE tasks SET status='processing',attempt=attempt+1,claim_id=?,lease_expires_at=?,error_message=NULL,updated_at=?
    WHERE id=? AND owner_id=? AND kind='ingestion' AND (status='queued' OR (status='processing' AND (claim_id IS NULL OR lease_expires_at<?)))
    AND NOT EXISTS (SELECT 1 FROM tasks other WHERE other.owner_id=? AND other.id<>? AND other.status='processing')
    AND (status='processing' OR NOT EXISTS (SELECT 1 FROM tasks earlier WHERE earlier.owner_id=? AND earlier.status='queued' AND (COALESCE(earlier.queue_position,2147483647)<COALESCE(tasks.queue_position,2147483647) OR (COALESCE(earlier.queue_position,2147483647)=COALESCE(tasks.queue_position,2147483647) AND earlier.created_at<tasks.created_at)))) RETURNING *`)
    .bind(claim,expiry,time,id,owner,time,owner,id,owner).first<StoredTask>();
  if(!claimed)return taskView(owner,id);
  let model:string|null=null;let usageReservation:string|null=null;
  try {
    if(!claimed.document_id)throw new ApiError(409,'SOURCE_MISSING','The ingestion task has no source document.');
    const document=await ownedDocument(owner,claimed.document_id);
    await db().prepare("UPDATE documents SET status='processing',error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND claim_id=? AND status='processing')").bind(time,document.id,owner,id,claim).run();
    const request=parseJson<IngestionRequest|null>(claimed.request_json,null);
    if(!request?.manifest_r2_key||request.source_sha256!==document.source_sha256)throw new ApiError(409,'SOURCE_MANIFEST_INVALID','The durable source manifest is missing or does not match the original.');
    const object=await bucket().get(request.manifest_r2_key);
    if(!object||object.customMetadata?.document_id!==document.id||object.customMetadata?.owner_id!==owner)throw new ApiError(409,'SOURCE_MANIFEST_MISSING','The source extraction manifest is unavailable.');
    const manifest=await object.json<IngestionManifest>();
    if(manifest.schema_version!==1||manifest.source_sha256!==document.source_sha256||manifest.total_pages!==document.page_count||manifest.pages.length!==document.page_count)throw new ApiError(409,'SOURCE_MANIFEST_INVALID','The source extraction manifest does not match the durable document.');
    const persisted=await all<{page_number:number}>('SELECT page_number FROM pages WHERE document_id=?',document.id);
    const done=new Set(persisted.map(page=>page.page_number));
    const remaining=manifest.pages.filter(page=>!done.has(page.page_number));
    const slice:IngestionPage[]=[];let visionUsed=false;
    for(const sourcePage of remaining) {
      if(slice.length>=8)break;
      const page:IngestionPage={...sourcePage,extraction_metadata:{schema_version:1,source_sha256:document.source_sha256,verification_status:'source_text',...sourcePage.extraction_metadata}};
      if(page.extraction_method==='vision_ocr') {
        if(visionUsed||slice.length)break;visionUsed=true;
        if(!request.public_data_acknowledged)throw new ApiError(400,'PUBLIC_DATA_ACKNOWLEDGEMENT_REQUIRED','Confirm the source is permitted for free Gemini OCR before retrying this task.');
        if(!page.image_r2_key||!page.image_content_type)throw new ApiError(409,'OCR_PAGE_IMAGE_MISSING',`The image for scanned page ${page.page_number} is missing.`);
        const image:R2ObjectBody|null=await bucket().get(page.image_r2_key);
        if(!image||image.customMetadata?.document_id!==document.id||image.customMetadata?.source_sha256!==document.source_sha256||image.customMetadata?.page_number!==String(page.page_number))throw new ApiError(409,'OCR_PAGE_IMAGE_MISSING',`The source image for page ${page.page_number} is unavailable.`);
        const bytes=new Uint8Array(await image.arrayBuffer());
        const imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
        if(imageHash!==image.customMetadata?.image_sha256||imageHash!==page.extraction_metadata?.source_artifact_sha256)throw new ApiError(409,'OCR_IMAGE_HASH_MISMATCH','The scanned page image no longer matches its retained source artifact.');
        if(bytes.length>INGEST_LIMITS.max_page_image_bytes)throw new ApiError(413,'OCR_IMAGE_TOO_LARGE','A scanned page exceeds the bounded OCR input limit.');
        const readiness=aiReadiness();
        if(!readiness.ocr_configured)throw new ApiError(503,'OCR_NOT_CONFIGURED','Photo transcription requires a configured Gemini vision API key. The private original has been retained; retry after configuration.');
        usageReservation=await reserveAIUsage(owner,id,'gemini',String(readiness.model),5000,2000);
        const result=await extractVisionPage({base64:bytesToBase64(bytes),mime_type:page.image_content_type,page_number:page.page_number,public_data_acknowledged:true,signal:AbortSignal.timeout(24_000)});
        await completeAIUsage(usageReservation,result);usageReservation=null;
        if(result.text.length>INGEST_LIMITS.max_page_chars||result.markdown.length>INGEST_LIMITS.max_page_chars)throw new ApiError(413,'OCR_TEXT_LIMIT','The OCR response exceeds the page-text limit.');
        page.text=result.text;page.markdown=result.markdown;model=result.model;
        page.extraction_metadata={...page.extraction_metadata,verification_status:'unverified',processing_seconds:result.latency_ms/1000,provider:result.provider,model:result.model,usage:result.usage,request_id:result.request_id||null,fallback_used:result.fallback_used,illegible_regions:result.illegible_regions};
      }
      slice.push(page);if(visionUsed)break;
    }
    for(const page of slice)await persistPage(owner,claimed,claim,page);
    const current=await ownedTask(owner,id);
    if(current.claim_id!==claim||current.status!=='processing')return taskView(owner,id);
    const count=await first<{page_count:number;chunk_count:number;chars:number}>(`SELECT (SELECT COUNT(*) FROM pages WHERE document_id=?) AS page_count,(SELECT COUNT(*) FROM chunks WHERE document_id=?) AS chunk_count,(SELECT COALESCE(SUM(length(text)),0) FROM pages WHERE document_id=?) AS chars`,document.id,document.id,document.id);
    if((count?.chars||0)>INGEST_LIMITS.max_document_chars)throw new ApiError(413,'DOCUMENT_TEXT_LIMIT','The extracted source exceeds the one-million-character limit.');
    const completed=count?.page_count===document.page_count;
    if(completed&&!count?.chunk_count)throw new ApiError(400,'NO_READABLE_TEXT','The source contains no readable text. Review the original photo or PDF and upload a clearer source.');
    const methods=[...new Set(manifest.pages.map(page=>page.extraction_method))].join('+');
    await db().batch([
      db().prepare("UPDATE documents SET status=?,extraction_method=?,chunk_count=?,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND claim_id=? AND status='processing')").bind(completed?'ready':'processing',methods,count?.chunk_count||0,now(),document.id,owner,id,claim),
      db().prepare('UPDATE tasks SET status=?,model=COALESCE(?,model),claim_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status=\'processing\'').bind(completed?'completed':'processing',model,now(),id,owner,claim),
    ]);
  } catch(error) {
    if(usageReservation)await completeAIUsage(usageReservation,null,true).catch(()=>undefined);
    const message=error instanceof ApiError||error instanceof AIError?error.message:'Document ingestion failed. Retry the task or upload an undamaged source.';
    await db().batch([
      db().prepare("UPDATE documents SET status='failed',error_message=?,updated_at=? WHERE id=? AND owner_id=? AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND claim_id=? AND status='processing')").bind(message,now(),claimed.document_id,owner,id,claim),
      db().prepare("UPDATE tasks SET status='failed',error_message=?,claim_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status='processing'").bind(message,now(),id,owner,claim),
    ]);
  }
  return taskView(owner,id);
}
async function persistPage(owner:string,task:StoredTask,claim:string,page:IngestionPage):Promise<void> {
  const pageId=newId(),time=now();const chunks=chunkPageText(page.text).map((chunk,index)=>({id:newId(),page_id:pageId,page_number:page.page_number,sequence:(page.page_number-1)*1000+index,...chunk}));
  await db().batch([
    db().prepare(`INSERT INTO pages (id,document_id,page_number,text,markdown,extraction_method,extraction_metadata_json,image_r2_key,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND owner_id=? AND claim_id=? AND status='processing') ON CONFLICT(document_id,page_number) DO NOTHING`)
      .bind(pageId,task.document_id,page.page_number,page.text,page.markdown,page.extraction_method,JSON.stringify(page.extraction_metadata||{schema_version:1,verification_status:'source_text'}),page.image_r2_key||null,time,task.id,owner,claim),
    db().prepare(`INSERT INTO chunks (id,document_id,page_id,page_number,sequence,text,start_offset,end_offset,created_at)
      SELECT json_extract(value,'$.id'),?,json_extract(value,'$.page_id'),json_extract(value,'$.page_number'),json_extract(value,'$.sequence'),json_extract(value,'$.text'),json_extract(value,'$.start_offset'),json_extract(value,'$.end_offset'),?
      FROM json_each(?) WHERE EXISTS (SELECT 1 FROM tasks WHERE id=? AND owner_id=? AND claim_id=? AND status='processing') AND EXISTS (SELECT 1 FROM pages WHERE id=?) ON CONFLICT(document_id,sequence) DO NOTHING`)
      .bind(task.document_id,time,JSON.stringify(chunks),task.id,owner,claim,pageId),
  ]);
}
export async function taskAction(owner:string,id:string,action:string,publicDataAcknowledged=false):Promise<TaskView> {
  const task=await ownedTask(owner,id);const time=now();
  if(action==='stop') {
    if(task.status==='completed')throw new ApiError(409,'TASK_COMPLETED','Completed tasks cannot be stopped.');
    await db().batch([
      db().prepare("UPDATE tasks SET status='stopped',claim_id=NULL,lease_expires_at=NULL,error_message='Stopped by you.',updated_at=? WHERE id=? AND owner_id=? AND status<>'completed'").bind(time,id,owner),
      db().prepare("UPDATE documents SET status='failed',error_message='Stopped by you. Retry the task to resume the original source.',updated_at=? WHERE id=? AND owner_id=? AND status<>'ready'").bind(time,task.document_id,owner),
    ]);
  } else if(action==='queue'||action==='retry') {
    const allowed=action==='queue'?['idle']:['failed','stopped'];
    if(!allowed.includes(task.status))throw new ApiError(409,'INVALID_TASK_TRANSITION',`Only ${allowed.join(' or ')} tasks can be ${action==='queue'?'queued':'retried'}.`);
    const payload=parseJson<Record<string,unknown>>(task.request_json,{});
    if(publicDataAcknowledged)payload.public_data_acknowledged=true;
    await db().batch([
      db().prepare(`UPDATE tasks SET status='queued',request_json=?,error_message=NULL,claim_id=NULL,lease_expires_at=NULL,queue_position=(SELECT COALESCE(MAX(queue_position),0)+1 FROM tasks WHERE owner_id=? AND status IN ('queued','processing')),queued_at=?,updated_at=? WHERE id=? AND owner_id=? AND status=?`).bind(JSON.stringify(payload),owner,time,time,id,owner,task.status),
      db().prepare("UPDATE documents SET status='pending',error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND status<>'ready'").bind(time,task.document_id,owner),
    ]);
  } else throw new ApiError(400,'INVALID_TASK_ACTION','Choose queue, retry, or stop.');
  return taskView(owner,id);
}
export async function reorderTasks(owner:string,ids:unknown):Promise<TaskView[]> {
  if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new ApiError(400,'INVALID_TASK_ORDER','Send a unique ordered list of queued task IDs.');
  const order=JSON.stringify(ids);
  if(ids.length) {
    // Validate the complete current queue and reorder it in one atomic statement.
    const result=await db().prepare(`UPDATE tasks SET queue_position=(SELECT CAST(key AS INTEGER)+1 FROM json_each(?) WHERE value=tasks.id),updated_at=?
      WHERE owner_id=? AND status='queued' AND id IN (SELECT value FROM json_each(?))
      AND (SELECT COUNT(*) FROM tasks current WHERE current.owner_id=? AND current.status='queued')=?
      AND NOT EXISTS (SELECT 1 FROM tasks current WHERE current.owner_id=? AND current.status='queued' AND current.id NOT IN (SELECT value FROM json_each(?))) RETURNING id`)
      .bind(order,now(),owner,order,owner,ids.length,owner,order).all<{id:string}>();
    if(result.results.length!==ids.length)throw new ApiError(409,'QUEUE_CHANGED','The queue changed. Reload it before reordering.');
  } else {
    const current=await first<{count:number}>("SELECT COUNT(*) AS count FROM tasks WHERE owner_id=? AND status='queued'",owner);
    if(current?.count)throw new ApiError(409,'QUEUE_CHANGED','The queue changed. Reload it before reordering.');
  }
  return listTaskViews(owner,'active');
}
