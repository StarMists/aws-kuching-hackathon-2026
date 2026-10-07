import { ApiError,requiredString } from '../http';
import { all,db,first,newId,now,ownedProject,parseJson } from '../db';
import { AIError,generateText,getAIConfig } from '../ai';
import { ensureAIReady,estimateTokens } from '../ai/providers';
import type { Artifact,ArtifactKind,JobStatus } from '../contracts';
import { ANALYSIS_SCHEMA,analysisInstruction,runAnalysis,type AnalysisInput,type AnalysisContent } from './workflows';
import { GROUNDING_SYSTEM } from './evidence';
import { snapshotSources,loadFrozenEvidence,type SourceSnapshot } from './sources';
import { reserveAIUsage,completeAIUsage } from './usage';

export interface AnalysisJob {id:string;owner_id:string;project_id:string;kind:ArtifactKind;request_json:string;source_snapshot_json:string;status:JobStatus;attempt:number;lease_id:string|null;lease_expires_at:string|null;artifact_id:string|null;error_message:string|null;created_at:string;updated_at:string}
const active=new Map<string,AbortController>();
export async function ownedAnalysisJob(owner:string,id:string) {const job=await first<AnalysisJob>('SELECT * FROM analysis_jobs WHERE id=? AND owner_id=?',id,owner);if(!job)throw new ApiError(404,'ANALYSIS_NOT_FOUND','This analysis job was not found in your workspace.');await ownedProject(owner,job.project_id);return job;}
export async function ownedArtifact(owner:string,id:string):Promise<Artifact> {const row=await first<Artifact>('SELECT * FROM artifacts WHERE id=? AND owner_id=?',id,owner);if(!row)throw new ApiError(404,'ARTIFACT_NOT_FOUND','This artifact was not found in your workspace.');await ownedProject(owner,row.project_id);return {...row,content:parseJson<unknown>(row.content_json,{}),document_ids:parseJson<string[]>(row.document_ids_json,[])};}
export async function analysisJobDetail(owner:string,id:string) {const job=await ownedAnalysisJob(owner,id);return {job,artifact:job.artifact_id?await ownedArtifact(owner,job.artifact_id):undefined,lease_expired:job.status==='processing'&&!!job.lease_expires_at&&job.lease_expires_at<now()};}
export function parseAnalysisInput(raw:Record<string,unknown>):AnalysisInput {
  const project=requiredString(raw.project_id,'Project',100),kind=requiredString(raw.kind,'Analysis type',30);
  if(!['brief','timeline','conflict','gap','impact','replay','graph'].includes(kind))throw new ApiError(400,'INVALID_ANALYSIS_KIND','Choose a supported analysis type.');
  if(raw.document_ids!==undefined&&(!Array.isArray(raw.document_ids)||raw.document_ids.length>100||!raw.document_ids.every(id=>typeof id==='string')))throw new ApiError(400,'INVALID_SOURCE_SELECTION','Select up to 100 source documents.');
  const input:AnalysisInput={project_id:project,kind:kind as ArtifactKind,document_ids:raw.document_ids as string[]|undefined,public_data_acknowledged:raw.public_data_acknowledged===true};
  for(const field of ['prompt','case_text','previous_document_id','new_document_id','idempotency_key'] as const){if(raw[field]!==undefined)input[field]=requiredString(raw[field],field,field==='prompt'||field==='case_text'?6000:100);}
  if(input.kind==='impact'&&(!input.previous_document_id||!input.new_document_id))throw new ApiError(400,'COMPARISON_SOURCES_REQUIRED','Select both the previous and new source document.');
  if(input.kind==='replay'&&!input.case_text)throw new ApiError(400,'CASE_REQUIRED','Describe the hypothetical case to compare against the selected evidence.');
  if(input.previous_document_id&&input.previous_document_id===input.new_document_id)throw new ApiError(400,'SAME_COMPARISON_SOURCE','Select two different source versions.');
  return input;
}
export async function createAnalysisJob(owner:string,input:AnalysisInput,options:{id?:string;snapshot?:SourceSnapshot[]}={}) {
  await ownedProject(owner,input.project_id);ensureAIReady(getAIConfig(),input.public_data_acknowledged);
  const id=options.id||input.idempotency_key||newId();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new ApiError(400,'INVALID_IDEMPOTENCY_KEY','Use a UUID idempotency key.');
  const frozen=options.snapshot||await snapshotSources(owner,input.project_id,input.document_ids);
  for(const documentId of [input.previous_document_id,input.new_document_id].filter(Boolean))if(!frozen.some(s=>s.document_id===documentId))throw new ApiError(400,'COMPARISON_OUTSIDE_SCOPE','Both comparison documents must be in the selected project evidence.');
  const normalized={...input,document_ids:frozen.map(s=>s.document_id),idempotency_key:undefined};
  const existing=await first<AnalysisJob>('SELECT * FROM analysis_jobs WHERE id=? AND owner_id=?',id,owner);
  if(existing){if(existing.project_id!==input.project_id||existing.kind!==input.kind||existing.request_json!==JSON.stringify(normalized))throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This idempotency key was already used for another analysis.');return analysisJobDetail(owner,id);}
  const time=now();
  try {await db().prepare("INSERT INTO analysis_jobs (id,owner_id,project_id,kind,request_json,source_snapshot_json,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,?,'queued',0,?,?)").bind(id,owner,input.project_id,input.kind,JSON.stringify(normalized),JSON.stringify(frozen),time,time).run();}
  catch {const duplicate=await first<AnalysisJob>('SELECT * FROM analysis_jobs WHERE id=? AND owner_id=?',id,owner);if(!duplicate||duplicate.request_json!==JSON.stringify(normalized))throw new ApiError(409,'ANALYSIS_SUBMISSION_CONFLICT','The analysis could not be saved. Retry with the same idempotency key.');}
  return analysisJobDetail(owner,id);
}
async function fingerprint(input:AnalysisInput,snapshot:SourceSnapshot[]) {const text=JSON.stringify({schema_version:1,input:{...input,idempotency_key:undefined,public_data_acknowledged:undefined},snapshot});const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');}
function failureText(error:unknown) {return error instanceof AIError||error instanceof ApiError?`${error.code}: ${error.message}`:'ANALYSIS_FAILED: The source-backed analysis could not be completed. Retry this durable job.';}
export async function processAnalysisJob(owner:string,id:string,options:{parent_task_id?:string;parent_claim_id?:string}={}) {
  const initial=await ownedAnalysisJob(owner,id);if(['completed','failed','stopped'].includes(initial.status))return analysisJobDetail(owner,id);
  const leaseId=newId(),time=now(),expiry=new Date(Date.now()+45000).toISOString();
  const claimed=await db().prepare("UPDATE analysis_jobs SET status='processing',lease_id=?,lease_expires_at=?,attempt=attempt+1,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND attempt<3 AND (status='queued' OR (status='processing' AND lease_expires_at<?)) AND NOT EXISTS (SELECT 1 FROM analysis_jobs other WHERE other.owner_id=? AND other.id<>? AND other.status='processing' AND other.lease_expires_at>=?)").bind(leaseId,expiry,time,id,owner,time,owner,id,time).run();
  if(!claimed.meta.changes)return analysisJobDetail(owner,id);
  const controller=new AbortController();active.set(id,controller);let usageId:string|null=null;
  try {
    const input=parseJson<AnalysisInput>(initial.request_json,{project_id:initial.project_id,kind:initial.kind}),snapshot=parseJson<SourceSnapshot[]>(initial.source_snapshot_json,[]);
    ensureAIReady(getAIConfig(),input.public_data_acknowledged);
    const config=getAIConfig(),overhead=estimateTokens(GROUNDING_SYSTEM+analysisInstruction(input)+JSON.stringify(ANALYSIS_SCHEMA))+300;
    const evidence=await loadFrozenEvidence(owner,snapshot,input.prompt||`${input.kind} proposal rationale dissent decision revision date launch approval action rule obligation`,Math.max(400,config.max_input_tokens-overhead));
    const key=await fingerprint(input,snapshot);
    // Only reuse immutable, validated generated artifacts with the exact same inputs and source hashes.
    const cached=await first<Artifact>("SELECT * FROM artifacts WHERE owner_id=? AND project_id=? AND kind=? AND json_extract(content_json,'$.input_fingerprint')=? AND COALESCE(json_extract(content_json,'$.user_edited'),0)=0 ORDER BY created_at DESC LIMIT 1",owner,input.project_id,input.kind,key);
    let generated:{content:AnalysisContent;markdown:string;title:string};
    if(cached){const content=parseJson<AnalysisContent|null>(cached.content_json,null);if(!content||content.schema_version!==1||content.receipt.provider==='openai')throw new ApiError(409,'INVALID_CACHED_ARTIFACT','A saved artifact does not match the current approved generation contract.');generated={content:{...content,receipt:{...content.receipt,cached:true}},markdown:cached.markdown,title:cached.title};}
    else {
      usageId=await reserveAIUsage(owner,id,config.primary?.provider||config.fallback!.provider,config.primary?.model||config.fallback!.model,config.max_input_tokens,config.max_output_tokens);
      generated=await runAnalysis(input,evidence.sources,evidence.coverage,generateText,controller.signal);
      await completeAIUsage(usageId,generated.content.receipt);usageId=null;
      generated.content.input_fingerprint=key;
    }
    const artifactId=id,timestamp=now();
    const parentGuard=options.parent_task_id?' AND EXISTS (SELECT 1 FROM tasks WHERE id=? AND owner_id=? AND claim_id=? AND status=\'processing\')':'';
    const parentValues=options.parent_task_id?[options.parent_task_id,owner,options.parent_claim_id||null]:[];
    await db().batch([
      db().prepare(`INSERT INTO artifacts (id,owner_id,project_id,kind,title,markdown,content_json,document_ids_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM analysis_jobs WHERE id=? AND owner_id=? AND lease_id=? AND status='processing')${parentGuard} ON CONFLICT(id) DO NOTHING`).bind(artifactId,owner,initial.project_id,initial.kind,generated.title,generated.markdown,JSON.stringify(generated.content),JSON.stringify(snapshot.map(s=>s.document_id)),timestamp,timestamp,id,owner,leaseId,...parentValues),
      db().prepare(`UPDATE analysis_jobs SET status='completed',artifact_id=?,lease_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND lease_id=? AND status='processing' AND EXISTS (SELECT 1 FROM artifacts WHERE id=? AND owner_id=?)${parentGuard}`).bind(artifactId,timestamp,id,owner,leaseId,artifactId,owner,...parentValues),
    ]);
  } catch(error) {if(usageId)await completeAIUsage(usageId,null,true);await db().prepare("UPDATE analysis_jobs SET status='failed',error_message=?,lease_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND lease_id=? AND status='processing'").bind(failureText(error),now(),id,owner,leaseId).run();}
  finally {if(active.get(id)===controller)active.delete(id);}
  return analysisJobDetail(owner,id);
}
export async function stopAnalysisJob(owner:string,id:string) {await ownedAnalysisJob(owner,id);await db().prepare("UPDATE analysis_jobs SET status='stopped',lease_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','processing')").bind(now(),id,owner).run();active.get(id)?.abort();return analysisJobDetail(owner,id);}
export async function retryAnalysisJob(owner:string,id:string) {const job=await ownedAnalysisJob(owner,id);if(job.attempt>=3)throw new ApiError(409,'RETRY_LIMIT_REACHED','This analysis reached its three-attempt limit. Start a new analysis.');if(!['failed','stopped'].includes(job.status))throw new ApiError(409,'JOB_NOT_RETRYABLE','Only failed or stopped analyses can be retried.');const input=parseJson<AnalysisInput>(job.request_json,{project_id:job.project_id,kind:job.kind});ensureAIReady(getAIConfig(),input.public_data_acknowledged);await db().prepare("UPDATE analysis_jobs SET status='queued',lease_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND status IN ('failed','stopped')").bind(now(),id,owner).run();return analysisJobDetail(owner,id);}
export async function listArtifacts(owner:string,projectId:string) {await ownedProject(owner,projectId);const rows=await all<Artifact>('SELECT * FROM artifacts WHERE owner_id=? AND project_id=? ORDER BY updated_at DESC',owner,projectId);return rows.map(row=>({...row,content:parseJson<unknown>(row.content_json,{}),document_ids:parseJson<string[]>(row.document_ids_json,[])}));}
