import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { background } from '@/lib/background';
import { AIError } from '@/lib/ai';
import { ApiError,apiData,apiError } from '@/lib/http';
import { retryAnalysisJob,processAnalysisJob } from '@/lib/intelligence/jobs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params,result=await retryAnalysisJob(owner,id);background(processAnalysisJob(owner,id));return apiData(result,202);}catch(error){return apiError(error instanceof AIError?new ApiError(error.status,error.code,error.message):error);}}
