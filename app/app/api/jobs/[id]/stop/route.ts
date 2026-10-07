import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { apiData,apiError } from '@/lib/http';
import { stopChatJob,jobDetail } from '@/lib/chat/service';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;await stopChatJob(owner,id);return apiData(await jobDetail(owner,id));}catch(error){return apiError(error);}}
