import { requireOwner } from '@/lib/auth';
import { first,ownedDocument,parseJson } from '@/lib/db';
import { ApiError,apiData,apiError } from '@/lib/http';
import type { Chunk,Page } from '@/lib/contracts';
import { normalizeQuote,quoteId,type VerifiedCitation } from '@/lib/intelligence/evidence';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{quoteId:string}>}) {
  try {
    const owner=await requireOwner(request),{quoteId:identity}=await params;
    if(!/^q_[a-f0-9]{24}$/.test(identity))throw new ApiError(404,'REFERENCE_NOT_FOUND','This source reference was not found.');
    const row=await first<{citation_json:string}>("SELECT evidence.value AS citation_json FROM artifacts a,json_each(a.content_json,'$.claims') claim,json_each(claim.value,'$.evidence') evidence WHERE a.owner_id=? AND json_extract(evidence.value,'$.quote_id')=? LIMIT 1",owner,identity);
    let citation=row?parseJson<VerifiedCitation|null>(row.citation_json,null):null;
    if(!citation){const part=await first<{citation_document_id:string;citation_chunk_id:string;citation_page_number:number;citation_quote:string;metadata_json:string}>('SELECT p.citation_document_id,p.citation_chunk_id,p.citation_page_number,p.citation_quote,p.metadata_json FROM chat_message_parts p JOIN chat_messages m ON m.id=p.message_id JOIN chats c ON c.id=m.chat_id WHERE c.owner_id=? AND json_extract(p.metadata_json,\'$.quote_id\')=? LIMIT 1',owner,identity);if(part)citation={...parseJson<Partial<VerifiedCitation>>(part.metadata_json,{}),document_id:part.citation_document_id,chunk_id:part.citation_chunk_id,page_number:part.citation_page_number,quote:part.citation_quote,quote_id:identity};}
    if(!citation)throw new ApiError(404,'REFERENCE_NOT_FOUND','This source reference was not found in your saved work.');
    const document=await ownedDocument(owner,citation.document_id),chunk=await first<Chunk>('SELECT * FROM chunks WHERE id=? AND document_id=? AND page_number=?',citation.chunk_id,citation.document_id,citation.page_number),page=await first<Page>('SELECT * FROM pages WHERE document_id=? AND page_number=?',citation.document_id,citation.page_number);
    if(!chunk||!page||document.source_sha256!==citation.source_sha256||!normalizeQuote(chunk.text).includes(normalizeQuote(citation.quote))||!normalizeQuote(page.text).includes(normalizeQuote(citation.quote)))throw new ApiError(409,'REFERENCE_SOURCE_CHANGED','The saved reference no longer matches the stored source.');
    const actual=await quoteId({chunk_id:chunk.id,document_id:document.id,document_title:document.title,page_number:page.page_number,text:chunk.text,source_sha256:document.source_sha256,score:1},citation.quote);
    if(actual!==identity)throw new ApiError(409,'REFERENCE_INVALID','This quote identity does not match the stored evidence.');
    return apiData({citation,document,page,chunk});
  } catch(error){return apiError(error);}
}
