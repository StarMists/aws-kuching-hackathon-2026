import { assertSameOrigin, requireOwner } from '@/lib/auth';
import { all,db,first,now,ownedDocument } from '@/lib/db';
import { ApiError,apiData,apiError,readJson } from '@/lib/http';
import type { Document,Page } from '@/lib/contracts';
import { validateUploadMetadata } from '@/lib/ingest/validation';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
  try {
    const owner=await requireOwner(request),{id}=await context.params;const document=await ownedDocument(owner,id);
    const pages=await all<Page>('SELECT * FROM pages WHERE document_id=? ORDER BY page_number',id);
    const task=await first("SELECT * FROM tasks WHERE document_id=? AND owner_id=? AND kind='ingestion' ORDER BY created_at DESC LIMIT 1",id,owner);
    return apiData({document,pages,task});
  } catch(error){return apiError(error);}
}
export async function PATCH(request:Request,context:Context) {
  try {
    assertSameOrigin(request);const owner=await requireOwner(request),{id}=await context.params;const document=await ownedDocument(owner,id);const input=await readJson<Record<string,unknown>>(request);
    if(typeof input.expected_updated_at!=='string'||input.expected_updated_at!==document.updated_at)throw new ApiError(409,'DOCUMENT_CHANGED','This document was updated. Reload it before saving metadata.');
    const permitted=new Set(['title','document_type','department','source_date','expected_updated_at']);
    if(Object.keys(input).some(key=>!permitted.has(key)))throw new ApiError(400,'IMMUTABLE_DOCUMENT_SOURCE','Source bytes, page content, version labels, and version links are immutable. Upload a new version to change them.');
    const fields=validateUploadMetadata(input);const title='title'in input?fields.title||document.title:document.title;
    const updated=await db().prepare('UPDATE documents SET title=?,document_type=?,department=?,source_date=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=? RETURNING *').bind(title,'document_type'in input?fields.document_type||'other':document.document_type,'department'in input?fields.department||'':document.department,'source_date'in input?fields.source_date||null:document.source_date,now(),id,owner,input.expected_updated_at).first<Document>();
    if(!updated)throw new ApiError(409,'DOCUMENT_CHANGED','This document was updated. Reload it before saving metadata.');
    return apiData(updated);
  } catch(error){return apiError(error);}
}
