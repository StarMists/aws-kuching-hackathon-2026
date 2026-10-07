import { assertSameOrigin,requireOwner } from '@/lib/auth';
import { apiData,apiError,readJson,requiredString } from '@/lib/http';
import { stopIntelligenceTask } from '@/lib/intelligence/tasks';
import { ownedTask,taskAction,taskView } from '@/lib/ingest/tasks';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  try {const owner=await requireOwner(request),{id}=await params;return apiData(await taskView(owner,id));}catch(error){return apiError(error);}
}
export async function PATCH(request:Request,{params}:Context) {
  try {assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;const input=await readJson<Record<string,unknown>>(request);const action=requiredString(input.action,'Action',30);if(action==='stop'&&(await ownedTask(owner,id)).kind!=='ingestion')await stopIntelligenceTask(owner,id);return apiData(await taskAction(owner,id,action,input.public_data_acknowledged===true));}catch(error){return apiError(error);}
}
export const POST=PATCH;
