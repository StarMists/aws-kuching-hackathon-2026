import type { Citation } from '../contracts';
import { first, ownedProject } from '../db';
import { ApiError } from '../http';

interface CitationSource { id: string; document_id: string; document_title: string; page_number: number; text: string; source_sha256: string | null }
const compact = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** A saved source is canonicalized against the actual project-owned page/chunk. */
export async function validateCitations(owner: string, projectId: string, value: unknown): Promise<Citation[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) throw new ApiError(400, 'INVALID_CITATIONS', 'Save up to 30 source citations.');
  await ownedProject(owner, projectId);
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new ApiError(400, 'INVALID_CITATIONS', 'Each citation must identify a source chunk.');
    const input = raw as Record<string, unknown>;
    if (typeof input.document_id !== 'string' || typeof input.chunk_id !== 'string' || input.document_id.length > 200 || input.chunk_id.length > 200) throw new ApiError(400, 'INVALID_CITATIONS', 'Each citation must identify a document and source chunk.');
    const source = await first<CitationSource>(
      "SELECT c.id,c.document_id,c.page_number,c.text,d.title AS document_title,d.source_sha256 FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.id=? AND c.document_id=? AND d.owner_id=? AND d.status='ready' AND EXISTS (SELECT 1 FROM project_documents pd WHERE pd.document_id=d.id AND pd.project_id=?)",
      input.chunk_id, input.document_id, owner, projectId,
    );
    if (!source) throw new ApiError(400, 'INVALID_CITATION_SCOPE', 'A cited passage is unavailable or outside this project.');
    if (input.page_number !== undefined && input.page_number !== source.page_number) throw new ApiError(400, 'INVALID_CITATIONS', 'A citation page does not match its source chunk.');
    const quote = input.quote === undefined || input.quote === '' ? source.text.slice(0, 700) : input.quote;
    if (typeof quote !== 'string' || quote.length > 1500 || !compact(quote) || !compact(source.text).includes(compact(quote))) throw new ApiError(400, 'INVALID_CITATION_QUOTE', 'Citation quotes must be verbatim passages from the selected source chunk.');
    const key = `${source.id}:${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ document_id: source.document_id, document_title: source.document_title, chunk_id: source.id, page_number: source.page_number, quote, source_sha256: source.source_sha256 });
  }
  return citations;
}
