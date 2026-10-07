import { assertSameOrigin,requireOwner } from '@/lib/auth';
import { apiData,apiError,readJson } from '@/lib/http';
import { reorderTasks } from '@/lib/ingest/tasks';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {assertSameOrigin(request);const owner=await requireOwner(request),input=await readJson<Record<string,unknown>>(request);return apiData(await reorderTasks(owner,input.task_ids));}catch(error){return apiError(error);}
}
