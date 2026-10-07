import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { background } from '@/lib/background';
import { ApiError,apiData,apiError } from '@/lib/http';
import { retryChatJob,processChatJob,jobDetail } from '@/lib/chat/service';
import { AIError } from '@/lib/ai';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;await retryChatJob(owner,id);background(processChatJob(owner,id));return apiData(await jobDetail(owner,id),202);}catch(error){return apiError(error instanceof AIError?new ApiError(error.status,error.code,error.message):error);}}
