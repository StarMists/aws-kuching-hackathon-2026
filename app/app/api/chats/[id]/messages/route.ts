import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { background } from '@/lib/background';
import { apiData,apiError,readJson,ApiError } from '@/lib/http';
import { submitChatJob,processChatJob,type ChatRequest } from '@/lib/chat/service';
import { AIError } from '@/lib/ai';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params,result=await submitChatJob(owner,id,await readJson<ChatRequest>(request));if(result.job.status==='queued')background(processChatJob(owner,result.job.id));return apiData(result,202);}catch(error){return apiError(error instanceof AIError?new ApiError(error.status,error.code,error.message):error);}}
