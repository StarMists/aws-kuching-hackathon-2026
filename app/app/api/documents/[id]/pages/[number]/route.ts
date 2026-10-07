import { requireOwner } from '@/lib/auth';
import { all,first,ownedDocument } from '@/lib/db';
import { ApiError,apiData,apiError } from '@/lib/http';
import type { Chunk,Page } from '@/lib/contracts';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;number:string}>}) {
  try {
    const owner=await requireOwner(request),{id,number}=await params;const document=await ownedDocument(owner,id);const pageNumber=Number(number);
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>document.page_count)throw new ApiError(404,'PAGE_NOT_FOUND','This page was not found in the document.');
    const page=await first<Page>('SELECT * FROM pages WHERE document_id=? AND page_number=?',id,pageNumber);
    if(!page)throw new ApiError(409,'PAGE_NOT_READY','This source page is still being extracted.');
    return apiData({document,page,chunks:await all<Chunk>('SELECT * FROM chunks WHERE document_id=? AND page_number=? ORDER BY sequence',id,pageNumber),source_url:`/api/documents/${encodeURIComponent(id)}/file#page=${pageNumber}`,image_url:`/api/documents/${encodeURIComponent(id)}/pages/${pageNumber}/image`});
  } catch(error){return apiError(error);}
}
