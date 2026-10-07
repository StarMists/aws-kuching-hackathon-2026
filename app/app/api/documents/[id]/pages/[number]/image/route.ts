import { requireOwner } from '@/lib/auth';
import { bucket,first,ownedDocument } from '@/lib/db';
import { ApiError,apiError } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;number:string}>}) {
  try {
    const owner=await requireOwner(request),{id,number}=await params;const document=await ownedDocument(owner,id);const pageNumber=Number(number);
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>document.page_count)throw new ApiError(404,'PAGE_NOT_FOUND','This page was not found in the document.');
    const page=await first<{image_r2_key:string|null}>('SELECT image_r2_key FROM pages WHERE document_id=? AND page_number=?',id,pageNumber);
    if(!page?.image_r2_key)throw new ApiError(404,'PAGE_IMAGE_UNAVAILABLE','This page uses native source text. Open the original PDF for its visual layout.');
    const object=await bucket().get(page.image_r2_key);
    if(!object||object.customMetadata?.owner_id!==owner||object.customMetadata?.document_id!==id||object.customMetadata?.page_number!==String(pageNumber))throw new ApiError(404,'PAGE_IMAGE_UNAVAILABLE','The scanned-page preview is unavailable.');
    return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error){return apiError(error);}
}
