import { requireOwner } from '@/lib/auth';
import { ApiError,apiError } from '@/lib/http';
import { ownedArtifact } from '@/lib/intelligence/jobs';
import { artifactExport } from '@/lib/intelligence/artifacts';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const owner=await requireOwner(request),{id}=await params,artifact=await ownedArtifact(owner,id),format=new URL(request.url).searchParams.get('format')||'md';if(format!=='md'&&format!=='txt')throw new ApiError(400,'EXPORT_FORMAT_UNSUPPORTED','Choose Markdown or plain text export.');const name=artifact.title.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)||'aitlau-brief';return new Response(artifactExport(artifact),{headers:{'Content-Type':format==='md'?'text/markdown; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${name}.${format}"`,'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
