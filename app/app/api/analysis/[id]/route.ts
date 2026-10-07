import { requireOwner } from '@/lib/auth';
import { apiData,apiError } from '@/lib/http';
import { analysisJobDetail } from '@/lib/intelligence/jobs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireOwner(request),{id}=await params;return apiData(await analysisJobDetail(owner,id));}catch(error){return apiError(error);}}
