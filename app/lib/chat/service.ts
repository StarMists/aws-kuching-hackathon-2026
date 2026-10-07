import { all,db,first,newId,now,ownedProject,parseJson } from '../db';
import { ApiError,requiredString } from '../http';
import { generateText,getAIConfig,AIError } from '../ai';
import { ensureAIReady,estimateTokens } from '../ai/providers';
import type { Chat,ChatJob,MessagePart,MessageView } from '../contracts';
import { CLAIM_SCHEMA,GROUNDING_SYSTEM,evidencePrompt,safeReceipt,validateClaims,type GroundedClaim } from '../intelligence/evidence';
import { loadFrozenEvidence,snapshotSources,type SourceSnapshot } from '../intelligence/sources';
import { completeAIUsage,reserveAIUsage } from '../intelligence/usage';

export interface StoredChatJob extends ChatJob {request_json:string;claim_id:string|null;lease_expires_at:string|null}
export interface ChatRequest {text:string;document_ids:string[];public_data_acknowledged?:boolean;idempotency_key?:string}
const active=new Map<string,AbortController>();
const CHAT_SCHEMA={type:'object',additionalProperties:false,properties:{claims:{type:'array',items:CLAIM_SCHEMA},missing_evidence:{type:'array',items:{type:'string'}},follow_up_questions:{type:'array',items:{type:'string'}}},required:['claims','missing_evidence','follow_up_questions']};
function modelError(error:unknown) {return error instanceof AIError||error instanceof ApiError?{code:error.code,message:error.message}:{code:'CHAT_GENERATION_FAILED',message:'The source-backed answer could not be completed. Retry the durable job.'};}
export async function ownedChat(owner:string,id:string):Promise<Chat> {const chat=await first<Chat>('SELECT * FROM chats WHERE id=? AND owner_id=?',id,owner);if(!chat)throw new ApiError(404,'CHAT_NOT_FOUND','This conversation was not found in your workspace.');if(chat.project_id)await ownedProject(owner,chat.project_id);return chat;}
export async function ownedChatJob(owner:string,id:string):Promise<StoredChatJob> {const job=await first<StoredChatJob>('SELECT * FROM chat_jobs WHERE id=? AND owner_id=?',id,owner);if(!job)throw new ApiError(404,'JOB_NOT_FOUND','This generation job was not found in your workspace.');await ownedChat(owner,job.chat_id);return job;}
export async function messagesForChat(owner:string,id:string):Promise<MessageView[]> {
  await ownedChat(owner,id);
  const messages=await all<MessageView>('SELECT * FROM chat_messages WHERE chat_id=? ORDER BY sequence',id);
  if(!messages.length)return [];
  const parts=await all<MessagePart>('SELECT * FROM chat_message_parts WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id=?) ORDER BY sequence',id);
  return messages.map(message=>{const attached=parts.filter(p=>p.message_id===message.id);return {...message,parts:attached,text:attached.filter(p=>p.type==='text').map(p=>p.text).join(''),citations:attached.filter(p=>p.citation_document_id&&p.citation_chunk_id&&p.citation_page_number&&p.citation_quote).map(p=>({document_id:p.citation_document_id!,page_number:p.citation_page_number!,chunk_id:p.citation_chunk_id!,quote:p.citation_quote!,...parseJson<Record<string,unknown>>(p.metadata_json,{})}))};});
}
export async function chatDetail(owner:string,id:string) {const chat=await ownedChat(owner,id);return {chat,messages:await messagesForChat(owner,id),jobs:await all<StoredChatJob>('SELECT * FROM chat_jobs WHERE chat_id=? AND owner_id=? ORDER BY created_at',id,owner)};}
export async function createChat(owner:string,input:{title?:unknown;project_id?:unknown}) {
  const projectId=typeof input.project_id==='string'?input.project_id:null;if(projectId)await ownedProject(owner,projectId);
  const chat:Chat={id:newId(),owner_id:owner,project_id:projectId,title:typeof input.title==='string'&&input.title.trim()?requiredString(input.title,'Title',160):'Source-backed conversation',status:'active',created_at:now(),updated_at:now()};
  await db().prepare('INSERT INTO chats (id,owner_id,project_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(chat.id,owner,projectId,chat.title,chat.status,chat.created_at,chat.updated_at).run();return chat;
}
function idempotentId(value:unknown) {if(value===undefined)return newId();if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,'INVALID_IDEMPOTENCY_KEY','Use a UUID idempotency key.');return value;}
export async function submitChatJob(owner:string,chatId:string,input:ChatRequest) {
  const chat=await ownedChat(owner,chatId);if(chat.status!=='active')throw new ApiError(409,'CHAT_ARCHIVED','Restore this conversation before asking another question.');
  const text=requiredString(input.text,'Question',6000);
  if(!Array.isArray(input.document_ids)||input.document_ids.length>100||!input.document_ids.every(v=>typeof v==='string'))throw new ApiError(400,'INVALID_SOURCE_SELECTION','Select the document IDs for this question.');
  ensureAIReady(getAIConfig(),input.public_data_acknowledged);
  const id=idempotentId(input.idempotency_key),existing=await first<StoredChatJob>('SELECT * FROM chat_jobs WHERE id=? AND owner_id=?',id,owner);
  if(existing){if(existing.chat_id!==chatId||existing.request_text!==text||JSON.stringify([...input.document_ids].sort())!==JSON.stringify(parseJson<{document_ids:string[]}>(existing.request_json,{document_ids:[]}).document_ids.sort()))throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This idempotency key was already used for another request.');return {job:existing,chat,messages:await messagesForChat(owner,chatId)};}
  const sources=await snapshotSources(owner,chat.project_id,input.document_ids);
  const userId=newId(),assistantId=newId(),timestamp=now();
  const request=JSON.stringify({public_data_acknowledged:input.public_data_acknowledged,document_ids:input.document_ids,source_snapshot:sources});
  const queries=[db().prepare("INSERT INTO chat_messages (id,chat_id,role,sequence,status,created_at) SELECT ?,?,'user',COALESCE(MAX(sequence),0)+1,'completed',? FROM chat_messages WHERE chat_id=?").bind(userId,chatId,timestamp,chatId),db().prepare("INSERT INTO chat_messages (id,chat_id,role,sequence,status,created_at) SELECT ?,?,'assistant',COALESCE(MAX(sequence),0)+1,'queued',? FROM chat_messages WHERE chat_id=?").bind(assistantId,chatId,timestamp,chatId),db().prepare("INSERT INTO chat_message_parts (id,message_id,sequence,type,text,metadata_json) VALUES (?,?,1,'text',?,?)").bind(newId(),userId,text,JSON.stringify({public_data_acknowledged:true})),db().prepare("INSERT INTO chat_jobs (id,owner_id,chat_id,request_message_id,response_message_id,request_text,request_json,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'queued',0,?,?)").bind(id,owner,chatId,userId,assistantId,text,request,timestamp,timestamp),...sources.map(source=>db().prepare('INSERT INTO chat_job_sources (job_id,document_id,source_sha256) VALUES (?,?,?)').bind(id,source.document_id,source.source_sha256)),db().prepare('UPDATE chats SET updated_at=? WHERE id=? AND owner_id=?').bind(timestamp,chatId,owner)];
  try {await db().batch(queries);} catch {const duplicate=await first<StoredChatJob>('SELECT * FROM chat_jobs WHERE id=? AND owner_id=?',id,owner);if(!duplicate)throw new ApiError(409,'CHAT_SUBMISSION_CONFLICT','Another question was saved at the same time. Retry this request with the same idempotency key.');}
  return {job:await ownedChatJob(owner,id),chat:await ownedChat(owner,chatId),messages:await messagesForChat(owner,chatId)};
}
function textLists(value:unknown,max=8):string[]{if(!Array.isArray(value)||value.length>max||!value.every(v=>typeof v==='string'&&v.length<=1000))throw new AIError('INVALID_CHAT_RESPONSE','AI returned an invalid evidence question list.',502);return value as string[];}
function answerParts(claims:GroundedClaim[],missing:string[],questions:string[],receipt:unknown,coverage:unknown):Array<Omit<MessagePart,'id'|'message_id'|'sequence'>> {
  const parts:Array<Omit<MessagePart,'id'|'message_id'|'sequence'>>=[];
  const plain=(text:string,metadata:Record<string,unknown>={})=>({type:'text' as const,text,citation_document_id:null,citation_page_number:null,citation_chunk_id:null,citation_quote:null,metadata_json:JSON.stringify(metadata)});
  for(const claim of claims){parts.push(plain(`${claim.text}\n\n`,{claim_id:claim.id,support:claim.support}));for(const citation of claim.evidence)parts.push({type:'citation',text:citation.document_title||'Source',citation_document_id:citation.document_id,citation_page_number:citation.page_number,citation_chunk_id:citation.chunk_id,citation_quote:citation.quote,metadata_json:JSON.stringify({quote_id:citation.quote_id,document_title:citation.document_title,version:citation.version,source_date:citation.source_date,source_sha256:citation.source_sha256,claim_id:claim.id})});}
  if(!claims.length)parts.push(plain('Insufficient evidence: the selected source excerpts do not support an answer to this question.\n\n',{insufficient_evidence:true}));
  if(missing.length)parts.push(plain(`Evidence needed:\n${missing.map(question=>`- ${question}`).join('\n')}\n\n`,{missing_evidence:missing}));
  if(questions.length)parts.push(plain(`Follow-up questions:\n${questions.map(question=>`- ${question}`).join('\n')}`,{follow_up_questions:questions}));
  parts.push(plain('',{receipt,coverage}));return parts;
}
export async function processChatJob(owner:string,id:string) {
  const job=await ownedChatJob(owner,id);
  if(['completed','failed','stopped'].includes(job.status))return job;
  const claimId=newId(),timestamp=now(),lease=new Date(Date.now()+45000).toISOString();
  const claimed=await db().prepare("UPDATE chat_jobs SET status='processing',claim_id=?,lease_expires_at=?,attempt=attempt+1,updated_at=?,error_message=NULL WHERE id=? AND owner_id=? AND attempt<3 AND (status='queued' OR (status='processing' AND lease_expires_at<?))").bind(claimId,lease,timestamp,id,owner,timestamp).run();
  if(!claimed.meta.changes)return ownedChatJob(owner,id);
  await db().prepare("UPDATE chat_messages SET status='processing' WHERE id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND claim_id=? AND status='processing')").bind(job.response_message_id,id,claimId).run();
  const controller=new AbortController();active.set(id,controller);let usageId:string|null=null;
  try {
    const request=parseJson<{public_data_acknowledged?:boolean;source_snapshot?:SourceSnapshot[]}>(job.request_json,{});ensureAIReady(getAIConfig(),request.public_data_acknowledged);
    const chat=await ownedChat(owner,job.chat_id);
    const history=await all<{text:string;sequence:number}>("SELECT p.text,m.sequence FROM chat_messages m JOIN chat_message_parts p ON p.message_id=m.id WHERE m.chat_id=? AND m.role='user' AND m.sequence<(SELECT sequence FROM chat_messages WHERE id=?) ORDER BY m.sequence DESC LIMIT 3",job.chat_id,job.request_message_id);
    const previous=history.reverse().map(h=>h.text.slice(0,1000));
    const sources=request.source_snapshot||[];
    const instruction=`Answer the latest question using the selected project documents. Prior questions are only conversational context for pronouns and follow-ups, never supporting evidence. Do not repeat an earlier assistant answer as evidence. Latest question: ${JSON.stringify(job.request_text)}. Previous user questions: ${JSON.stringify(previous)}. At most 8 concise claims. If evidence is missing, ask for it rather than guessing. Distinguish conditional proposed plans from completed actions, and preserve conflicting dates/versions.`;
    const config=getAIConfig(),overhead=estimateTokens(GROUNDING_SYSTEM+instruction+JSON.stringify(CHAT_SCHEMA))+350;
    const evidence=await loadFrozenEvidence(owner,sources,[...previous,job.request_text].join(' '),Math.max(400,config.max_input_tokens-overhead));
    if(!evidence.sources.length)throw new ApiError(422,'NO_SOURCE_EVIDENCE','No usable source excerpts are available for this question.');
    usageId=await reserveAIUsage(owner,id,config.primary?.provider||config.fallback!.provider,config.primary?.model||config.fallback!.model,config.max_input_tokens,config.max_output_tokens);
    const result=await generateText({system:GROUNDING_SYSTEM,prompt:`${instruction}\nCoverage: ${JSON.stringify(evidence.coverage)}\nSource excerpts: ${evidencePrompt(evidence.sources)}`,schema:CHAT_SCHEMA,schema_name:'source_backed_answer',max_output_tokens:1800,signal:controller.signal,public_data_acknowledged:request.public_data_acknowledged});
    await completeAIUsage(usageId,result);usageId=null;
    let raw:Record<string,unknown>;try {raw=JSON.parse(result.text) as Record<string,unknown>;}catch {throw new AIError('INVALID_CHAT_RESPONSE','AI returned an invalid structured answer.',502);}
    const claims=await validateClaims(raw.claims,evidence.sources,10),parts=answerParts(claims,textLists(raw.missing_evidence),textLists(raw.follow_up_questions),safeReceipt(result),{...evidence.coverage,project_id:chat.project_id});
    const save=parts.map((part,index)=>db().prepare("INSERT INTO chat_message_parts (id,message_id,sequence,type,text,citation_document_id,citation_page_number,citation_chunk_id,citation_quote,metadata_json) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND owner_id=? AND claim_id=? AND status='processing')").bind(newId(),job.response_message_id,index+1,part.type,part.text,part.citation_document_id,part.citation_page_number,part.citation_chunk_id,part.citation_quote,part.metadata_json,id,owner,claimId));
    save.unshift(db().prepare("DELETE FROM chat_message_parts WHERE message_id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND claim_id=? AND status='processing')").bind(job.response_message_id,id,claimId));
    save.push(db().prepare("UPDATE chat_messages SET status='completed' WHERE id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND claim_id=? AND status='processing')").bind(job.response_message_id,id,claimId),db().prepare("UPDATE chat_jobs SET status='completed',model=?,claim_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status='processing'").bind(`${result.provider}:${result.model}`,now(),id,owner,claimId));
    await db().batch(save);
  } catch(error) {
    if(usageId)await completeAIUsage(usageId,null,true);
    const failure=modelError(error);
    await db().batch([db().prepare("UPDATE chat_messages SET status='failed' WHERE id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND claim_id=? AND status='processing')").bind(job.response_message_id,id,claimId),db().prepare("UPDATE chat_jobs SET status='failed',error_message=?,claim_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND claim_id=? AND status='processing'").bind(`${failure.code}: ${failure.message}`,now(),id,owner,claimId)]);
  } finally {if(active.get(id)===controller)active.delete(id);}
  return ownedChatJob(owner,id);
}
export async function stopChatJob(owner:string,id:string) {const job=await ownedChatJob(owner,id);await db().batch([db().prepare("UPDATE chat_messages SET status='stopped' WHERE id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND owner_id=? AND status IN ('queued','processing'))").bind(job.response_message_id,id,owner),db().prepare("UPDATE chat_jobs SET status='stopped',claim_id=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','processing')").bind(now(),id,owner)]);active.get(id)?.abort();return ownedChatJob(owner,id);}
export async function retryChatJob(owner:string,id:string) {const job=await ownedChatJob(owner,id);if(job.attempt>=3)throw new ApiError(409,'RETRY_LIMIT_REACHED','This job reached its three-attempt limit. Start a new question.');if(!['failed','stopped'].includes(job.status))throw new ApiError(409,'JOB_NOT_RETRYABLE','Only a failed or stopped job can be retried.');const config=getAIConfig(),request=parseJson<{public_data_acknowledged?:boolean}>(job.request_json,{});ensureAIReady(config,request.public_data_acknowledged);await db().batch([db().prepare("UPDATE chat_messages SET status='queued' WHERE id=? AND EXISTS (SELECT 1 FROM chat_jobs WHERE id=? AND owner_id=? AND status IN ('failed','stopped'))").bind(job.response_message_id,id,owner),db().prepare("UPDATE chat_jobs SET status='queued',error_message=NULL,claim_id=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND owner_id=? AND status IN ('failed','stopped')").bind(now(),id,owner)]);return ownedChatJob(owner,id);}
export async function jobDetail(owner:string,id:string) {const job=await ownedChatJob(owner,id);return {job,chat:await ownedChat(owner,job.chat_id),messages:await messagesForChat(owner,job.chat_id),lease_expired:job.status==='processing'&&!!job.lease_expires_at&&job.lease_expires_at<now()};}
