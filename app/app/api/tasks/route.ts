import { assertSameOrigin,requireOwner } from '@/lib/auth';
import { db,newId,now,ownedProject,scopedDocuments } from '@/lib/db';
import { ApiError,apiData,apiError,readJson,requiredString } from '@/lib/http';
import { listTaskViews,taskView } from '@/lib/ingest/tasks';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {const owner=await requireOwner(request),query=new URL(request.url).searchParams;if(query.get('project_id'))await ownedProject(owner,query.get('project_id')!);return apiData(await listTaskViews(owner,query.get('status'),query.get('project_id')));}
  catch(error){return apiError(error);}
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);const owner=await requireOwner(request),input=await readJson<Record<string,unknown>>(request);const kind=requiredString(input.kind,'Task type',30);
    if(!['brief','timeline','conflict','gap','impact','replay','graph'].includes(kind))throw new ApiError(400,'INVALID_TASK_KIND','Choose brief, timeline, conflict, gap, impact, replay, or graph. Upload a source file to create an ingestion task.');
    const project=await ownedProject(owner,requiredString(input.project_id,'Project',100));
    if(input.document_ids!==undefined&&(!Array.isArray(input.document_ids)||input.document_ids.some(id=>typeof id!=='string')))throw new ApiError(400,'INVALID_DOCUMENT_SCOPE','Select document IDs from this project.');
    const documents=await scopedDocuments(owner,project.id,input.document_ids as string[]|undefined);
    if(!documents.length)throw new ApiError(400,'NO_SOURCES','Add ready source documents to this project before creating an intelligence task.');
    const prompt=input.prompt===undefined?'':requiredString(input.prompt,'Task instructions',8000);
    const caseText=input.case_text===undefined?undefined:requiredString(input.case_text,'Case description',8000);
    for(const field of ['previous_document_id','new_document_id'])if(input[field]!==undefined&&(typeof input[field]!=='string'||!documents.some(document=>document.id===input[field])))throw new ApiError(400,'INVALID_DOCUMENT_SCOPE','Comparison documents must belong to the selected project sources.');
    const payload={project_id:project.id,document_ids:documents.map(document=>document.id),source_hashes:Object.fromEntries(documents.map(document=>[document.id,document.source_sha256])),prompt,case_text:caseText,previous_document_id:input.previous_document_id,new_document_id:input.new_document_id,public_data_acknowledged:input.public_data_acknowledged===true};
    const id=newId(),time=now();const autoQueue=input.auto_queue!==false;
    const statements=[db().prepare("INSERT INTO tasks (id,owner_id,project_id,kind,request_json,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,'idle',0,?,?)").bind(id,owner,project.id,kind,JSON.stringify(payload),time,time)];
    if(autoQueue)statements.push(db().prepare("UPDATE tasks SET status='queued',queue_position=(SELECT COALESCE(MAX(queue_position),0)+1 FROM tasks WHERE owner_id=? AND status IN ('queued','processing')),queued_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='idle'").bind(owner,time,time,id,owner));
    await db().batch(statements);return apiData(await taskView(owner,id),201);
  } catch(error){return apiError(error);}
}
