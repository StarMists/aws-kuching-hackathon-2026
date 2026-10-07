import { requireOwner } from '@/lib/auth';
import { bucket,ownedDocument } from '@/lib/db';
import { ApiError,apiError } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const owner=await requireOwner(request),{id}=await params;const document=await ownedDocument(owner,id);
    if(!document.r2_key)throw new ApiError(404,'SOURCE_FILE_MISSING','The original source file is unavailable.');
    const range=request.headers.get('range');
    const object=await bucket().get(document.r2_key,range?{range:request.headers}:undefined);
    if(!object||object.customMetadata?.owner_id!==owner||object.customMetadata?.document_id!==id)throw new ApiError(404,'SOURCE_FILE_MISSING','The original source file is unavailable.');
    const headers=new Headers({'Content-Type':document.content_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':`${new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(document.filename)}`,'ETag':object.httpEtag,'Accept-Ranges':'bytes'});
    let status=200;
    if(object.range&&'offset'in object.range&&typeof object.range.offset==='number'&&'length'in object.range&&typeof object.range.length==='number') {
      headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);headers.set('Content-Length',String(object.range.length));status=206;
    } else headers.set('Content-Length',String(object.size));
    return new Response(object.body,{status,headers});
  } catch(error){return apiError(error);}
}
