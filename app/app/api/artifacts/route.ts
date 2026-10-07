import { requireOwner } from '@/lib/auth';
import { ApiError,apiData,apiError } from '@/lib/http';
import { listArtifacts } from '@/lib/intelligence/jobs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const owner=await requireOwner(request),project=new URL(request.url).searchParams.get('project_id');if(!project)throw new ApiError(400,'PROJECT_REQUIRED','Select the project for this artifact list.');return apiData(await listArtifacts(owner,project));}catch(error){return apiError(error);}}
