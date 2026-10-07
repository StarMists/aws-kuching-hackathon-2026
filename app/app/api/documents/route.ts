import { assertSameOrigin, requireOwner } from '@/lib/auth';
import { background } from '@/lib/background';
import { apiData, apiError } from '@/lib/http';
import { listDocuments, uploadDocument } from '@/lib/ingest/upload';
import { processIngestionTask } from '@/lib/ingest/tasks';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {const owner=await requireOwner(request);return apiData(await listDocuments(owner,new URL(request.url).searchParams.get('project_id')));}
  catch(error){return apiError(error);}
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);const owner=await requireOwner(request);const result=await uploadDocument(owner,request);
    // Persisted queued/processing state is returned immediately. Polling safely resumes further page slices.
    if(result.task.status==='queued') {
      try {background(processIngestionTask(owner,result.task.id));}
      catch { /* Request-driven polling resumes the accepted durable task when background context is unavailable. */ }
    }
    return apiData(result,result.deduplicated?200:201);
  } catch(error){return apiError(error);}
}
