import { db,now,parseJson } from '../db';
import { ApiError,requiredString } from '../http';
import type { Artifact } from '../contracts';
import { ownedArtifact } from './jobs';
import { citationMarkdown,type VerifiedCitation } from './evidence';
import type { AnalysisContent } from './workflows';
export async function updateArtifact(owner:string,id:string,input:Record<string,unknown>) {
  const artifact=await ownedArtifact(owner,id),content=parseJson<AnalysisContent>(artifact.content_json,{} as AnalysisContent);
  const title=input.title===undefined?artifact.title:requiredString(input.title,'Title',200);
  let markdown=artifact.markdown;
  if(input.markdown!==undefined){if(typeof input.markdown!=='string'||input.markdown.length>100000)throw new ApiError(400,'INVALID_ARTIFACT_TEXT','Brief text must be 100,000 characters or fewer.');markdown=input.markdown;content.user_edited=true;content.edit_history=[...(content.edit_history||[]).slice(-9),{edited_at:now(),previous_markdown:artifact.markdown}];}
  if(input.review!==undefined){const review=input.review as Record<string,unknown>;if(!review||typeof review.finding_id!=='string'||!['confirmed','ignored','unreviewed'].includes(String(review.status)))throw new ApiError(400,'INVALID_REVIEW','Select a finding and choose confirmed, ignored, or unreviewed.');const finding=content.findings?.find(f=>f.id===review.finding_id);if(!finding)throw new ApiError(404,'FINDING_NOT_FOUND','This finding does not exist in the artifact.');if(review.note!==undefined&&(typeof review.note!=='string'||review.note.length>4000))throw new ApiError(400,'INVALID_REVIEW_NOTE','Review notes must be 4,000 characters or fewer.');finding.review={status:review.status as 'confirmed'|'ignored'|'unreviewed',note:typeof review.note==='string'?review.note:'',updated_at:now()};}
  await db().prepare('UPDATE artifacts SET title=?,markdown=?,content_json=?,updated_at=? WHERE id=? AND owner_id=? AND updated_at=?').bind(title,markdown,JSON.stringify(content),now(),id,owner,artifact.updated_at).run();
  const updated=await ownedArtifact(owner,id);
  if(updated.markdown!==markdown||updated.title!==title)throw new ApiError(409,'ARTIFACT_CHANGED','This artifact changed while you were editing. Reload before saving.');
  return updated;
}
export function artifactExport(artifact:Artifact):string {
  const content=parseJson<Partial<AnalysisContent>>(artifact.content_json,{}),citations=new Map<string,VerifiedCitation>();
  for(const claim of content.claims||[])for(const citation of claim.evidence||[])citations.set(citation.quote_id||`${citation.chunk_id}:${citation.quote}`,citation);
  const lines=[artifact.markdown];
  if(content.user_edited)lines.push('\n## Editing status\nThis body contains user edits. The generated evidence and source references below are retained for review; new edited statements have not been revalidated by the AI.');
  if(citations.size){lines.push('\n## Preserved source references');for(const citation of citations.values())lines.push(`- ${citationMarkdown(citation)}\n  Document ID: ${citation.document_id}\n  Page: ${citation.page_number}\n  Chunk ID: ${citation.chunk_id}\n  Quote ID: ${citation.quote_id}\n  Source SHA-256: ${citation.source_sha256||'not recorded'}\n  Quote: ${JSON.stringify(citation.quote)}`);}
  const reviewed=(content.findings||[]).filter(f=>f.review?.status!=='unreviewed');
  if(reviewed.length){lines.push('\n## Human review');for(const finding of reviewed)lines.push(`- ${finding.title}: ${finding.review.status}${finding.review.note?` · ${finding.review.note}`:''} (${finding.review.updated_at||'date unavailable'})`);}
  lines.push(`\nArtifact ID: ${artifact.id}\nProject ID: ${artifact.project_id}\nCreated: ${artifact.created_at}\nUpdated: ${artifact.updated_at}`);
  return lines.join('\n\n');
}
