import { requireOwner,assertSameOrigin } from '@/lib/auth';
import { apiData,apiError,readJson } from '@/lib/http';
import { ownedArtifact } from '@/lib/intelligence/jobs';
import { updateArtifact } from '@/lib/intelligence/artifacts';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireOwner(request),{id}=await params;return apiData(await ownedArtifact(owner,id));}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const owner=await requireOwner(request),{id}=await params;return apiData(await updateArtifact(owner,id,await readJson(request)));}catch(error){return apiError(error);}}
