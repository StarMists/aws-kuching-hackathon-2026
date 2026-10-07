import { requireOwner } from '@/lib/auth';
import { buildRelationshipGraph } from '@/lib/graph/build';
import { apiData, apiError } from '@/lib/http';
import { loadOverviewCorpus, validateFilters } from '@/lib/retrieval/corpus';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const owner = await requireOwner(request);
    const params = new URL(request.url).searchParams;
    const projectId = params.get('project_id');
    const filters = validateFilters(Object.fromEntries(['source_date_from', 'source_date_to', 'document_type', 'department', 'version', 'version_status'].map(key => [key, params.get(key)]).filter(([, value]) => value !== null)));
    const corpus = await loadOverviewCorpus(owner, projectId, filters);
    // Pairwise relationship work is bounded; all other sources remain searchable.
    const documents = corpus.documents.slice(0, 200);
    const ids = new Set(documents.map(document => document.id));
    const graph = buildRelationshipGraph(documents, corpus.chunks.filter(chunk => ids.has(chunk.document_id)));
    const warnings = [graph.warning, ...corpus.warnings];
    if (corpus.documents.length > 200) warnings.push(`The interactive graph shows the 200 most recently updated documents of ${corpus.documents.length}; search and project collections remain available for the full library.`);
    return apiData({ ...graph, warning: warnings.join(' '), coverage: { document_count: documents.length, total_document_count: corpus.documents.length, chunk_count: corpus.chunks.length, total_chunk_count: corpus.total_chunk_count, truncated: corpus.truncated || documents.length < corpus.documents.length } });
  } catch (error) { return apiError(error); }
}
