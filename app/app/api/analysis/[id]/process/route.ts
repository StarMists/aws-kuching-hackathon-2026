import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { apiData,apiError } from '@/lib/http';
import { processAnalysisJob } from '@/lib/intelligence/jobs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;return apiData(await processAnalysisJob(owner,id));}catch(error){return apiError(error);}}
