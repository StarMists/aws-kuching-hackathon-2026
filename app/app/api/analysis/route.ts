import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { background } from '@/lib/background';
import { AIError } from '@/lib/ai';
import { ApiError,apiData,apiError,readJson } from '@/lib/http';
import { createAnalysisJob,parseAnalysisInput,processAnalysisJob } from '@/lib/intelligence/jobs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{assertSameOrigin(request);const owner=await requireOwner(request),input=parseAnalysisInput(await readJson(request)),result=await createAnalysisJob(owner,input);if(result.job.status==='queued')background(processAnalysisJob(owner,result.job.id));return apiData(result,202);}catch(error){return apiError(error instanceof AIError?new ApiError(error.status,error.code,error.message):error);}}
