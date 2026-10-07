import { assertSameOrigin,requireOwner } from '@/lib/auth';
import { first } from '@/lib/db';
import { apiData,apiError } from '@/lib/http';
import { ownedTask,processIngestionTask,taskView } from '@/lib/ingest/tasks';
import { processIntelligenceTask } from '@/lib/intelligence/tasks';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;const requested=await ownedTask(owner,id);
    if(!['queued','processing'].includes(requested.status))return apiData(await taskView(owner,id));
    // Pump the authoritative queue head, including abandoned leases, before a later requested task.
    const head=await first<{id:string;kind:string}>("SELECT id,kind FROM tasks WHERE owner_id=? AND status IN ('queued','processing') ORDER BY CASE WHEN status='processing' THEN 0 ELSE 1 END,COALESCE(queue_position,2147483647),created_at LIMIT 1",owner);
    if(head?.kind==='ingestion')await processIngestionTask(owner,head.id);else if(head)await processIntelligenceTask(owner,head.id);
    return apiData(await taskView(owner,id));}
  catch(error){return apiError(error);}
}
