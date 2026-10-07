import { requireOwner } from '@/lib/auth';
import { all,ownedDocument } from '@/lib/db';
import { apiData,apiError } from '@/lib/http';
import type { Document } from '@/lib/contracts';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {const owner=await requireOwner(request),{id}=await params;const document=await ownedDocument(owner,id);return apiData(await all<Document>('SELECT * FROM documents WHERE owner_id=? AND family_id=? ORDER BY created_at,version',owner,document.family_id));}
  catch(error){return apiError(error);}
}
