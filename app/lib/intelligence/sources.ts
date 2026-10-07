import { listCorpusChunks,listCorpusPages,scopedDocuments } from '../db';
import type { Document } from '../contracts';
import { ApiError } from '../http';
import { rankPassages } from '../retrieval/ranking';
import type { CorpusChunk } from '../retrieval/types';
import { selectEvidence,type EvidenceSource,type EvidenceCoverage } from './evidence';

export interface SourceSnapshot {document_id:string;source_sha256:string|null;version:string;title:string}
export async function snapshotSources(owner:string,projectId:string|null,ids?:string[]):Promise<SourceSnapshot[]> {
  const docs=await scopedDocuments(owner,projectId,ids);
  if(!docs.length)throw new ApiError(422,'NO_SOURCE_DOCUMENTS','Select at least one ready source document.');
  return docs.map(d=>({document_id:d.id,source_sha256:d.source_sha256,version:d.version,title:d.title}));
}
export async function loadFrozenEvidence(owner:string,snapshot:SourceSnapshot[],query:string,budget=2600):Promise<{sources:EvidenceSource[];coverage:EvidenceCoverage;documents:Document[]}> {
  if(!snapshot.length)throw new ApiError(422,'NO_SOURCE_DOCUMENTS','This job has no selected source documents.');
  const ids=snapshot.map(s=>s.document_id);
  // Ownership is rechecked, while membership stays the immutable selection accepted for the job.
  const documents=await scopedDocuments(owner,null,ids);
  for(const doc of documents){const frozen=snapshot.find(s=>s.document_id===doc.id);if(!frozen||doc.source_sha256!==frozen.source_sha256||doc.version!==frozen.version)throw new ApiError(409,'SOURCE_CHANGED','A selected source changed after the job was created. Start a new job for its new version.');}
  const [chunks,pages]=await Promise.all([listCorpusChunks(owner,null,ids),listCorpusPages(owner,null,ids)]);
  const mapped=chunks.map(c=>({...c,filename:documents.find(d=>d.id===c.document_id)?.filename||'',department:documents.find(d=>d.id===c.document_id)?.department||'',family_id:documents.find(d=>d.id===c.document_id)?.family_id||c.document_id,previous_document_id:documents.find(d=>d.id===c.document_id)?.previous_document_id||null})) as CorpusChunk[];
  const ranked=rankPassages(mapped,query,{limit:100,max_passages_per_document:12,balanced:true});
  const hits:EvidenceSource[]=ranked.map(hit=>({...hit,page_id:chunks.find(c=>c.id===hit.chunk_id)?.page_id,page_text:pages.find(p=>p.document_id===hit.document_id&&p.page_number===hit.page_number)?.text}));
  // Analyses may require chronology or unknown fields. Low lexical overlap is not a license to manufacture evidence.
  for(const chunk of chunks){if(!hits.some(h=>h.chunk_id===chunk.id))hits.push({chunk_id:chunk.id,document_id:chunk.document_id,document_title:chunk.document_title,page_number:chunk.page_number,text:chunk.text,score:0,version:chunk.version,source_date:chunk.source_date,source_sha256:chunk.source_sha256,document_type:chunk.document_type,page_id:chunk.page_id,page_text:pages.find(p=>p.id===chunk.page_id)?.text});}
  const selected=selectEvidence(hits,ids,budget,16);
  const total=documents.reduce((sum,d)=>sum+d.chunk_count,0);
  selected.coverage.total_chunk_count=Math.max(total,chunks.length);
  selected.coverage.truncated=selected.sources.length<selected.coverage.total_chunk_count;
  return {...selected,documents};
}
