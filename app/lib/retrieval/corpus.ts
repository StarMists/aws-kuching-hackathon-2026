import type { Document } from '../contracts';
import { all, first, ownedProject, scopedDocuments } from '../db';
import { ApiError } from '../http';
import { queryTerms } from './ranking';
import { lexicalCandidateSql } from './sql';
import type { CorpusChunk, RetrievalOptions, ScopedCorpus, SearchFilters } from './types';

export const CORPUS_CHUNK_LIMIT = 6000;
export type SqlValue = string | number | null;
export interface CorpusScope { predicate: string; values: SqlValue[]; project_id: string | null; outside_project: boolean }

function validDate(value: string, label: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'INVALID_FILTER', `${label} must be a calendar date in YYYY-MM-DD format.`);
  }
  return value;
}

export function validateFilters(value: unknown): SearchFilters {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_FILTER', 'Search filters must be an object.');
  const input = value as Record<string, unknown>;
  const result: SearchFilters = {};
  for (const key of ['source_date_from', 'source_date_to', 'document_type', 'department', 'version'] as const) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw !== 'string' || raw.length > 120) throw new ApiError(400, 'INVALID_FILTER', `Invalid ${key} filter.`);
    result[key] = raw.trim();
  }
  if (result.source_date_from) validDate(result.source_date_from, 'Start date');
  if (result.source_date_to) validDate(result.source_date_to, 'End date');
  if (result.source_date_from && result.source_date_to && result.source_date_from > result.source_date_to) {
    throw new ApiError(400, 'INVALID_FILTER', 'Start date must be on or before end date.');
  }
  if (input.version_status !== undefined && input.version_status !== '') {
    if (input.version_status !== 'latest' && input.version_status !== 'superseded') throw new ApiError(400, 'INVALID_FILTER', 'Version status must be latest or superseded.');
    result.version_status = input.version_status;
  }
  return result;
}

/** SQL always starts with ownership; client owner fields never participate. */
export async function buildCorpusScope(owner: string, options: RetrievalOptions): Promise<CorpusScope> {
  if (options.project_id) await ownedProject(owner, options.project_id);
  if (options.allow_outside_project !== undefined && typeof options.allow_outside_project !== 'boolean') {
    throw new ApiError(400, 'INVALID_SCOPE', 'Outside-project scope must be explicitly true or false.');
  }
  const outside = Boolean(options.project_id && options.allow_outside_project === true);
  const project = outside ? null : options.project_id ?? null;
  if (options.document_ids !== undefined) {
    if (!Array.isArray(options.document_ids) || options.document_ids.length > 100 || options.document_ids.some(id => typeof id !== 'string' || !id || id.length > 200)) {
      throw new ApiError(400, 'INVALID_SCOPE', 'Select up to 100 valid document IDs.');
    }
    const ids = [...new Set(options.document_ids)];
    // Check every selected source before any model call or retrieval.
    for (let index = 0; index < ids.length; index += 80) await scopedDocuments(owner, project, ids.slice(index, index + 80));
  }
  const filters = validateFilters(options.filters);
  const values: SqlValue[] = [owner];
  let predicate = "d.owner_id=? AND d.status='ready'";
  if (project) { predicate += ' AND EXISTS (SELECT 1 FROM project_documents pd WHERE pd.document_id=d.id AND pd.project_id=?)'; values.push(project); }
  if (options.document_ids !== undefined) {
    // json_each avoids exceeding D1's bounded parameter count for a 100-source selection.
    predicate += ' AND d.id IN (SELECT value FROM json_each(?))'; values.push(JSON.stringify([...new Set(options.document_ids)]));
  }
  if (filters.source_date_from) { predicate += ' AND substr(d.source_date,1,10)>=?'; values.push(filters.source_date_from); }
  if (filters.source_date_to) { predicate += ' AND substr(d.source_date,1,10)<=?'; values.push(filters.source_date_to); }
  for (const [key, column] of [['document_type', 'd.document_type'], ['department', 'd.department'], ['version', 'd.version']] as const) {
    if (filters[key]) { predicate += ` AND lower(${column})=lower(?)`; values.push(filters[key]!); }
  }
  if (filters.version_status) {
    predicate += ` AND ${filters.version_status === 'latest' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM documents successor WHERE successor.owner_id=d.owner_id AND successor.previous_document_id=d.id)`;
  }
  return { predicate, values, project_id: project, outside_project: outside };
}

const SELECT_CHUNKS = 'SELECT c.*,d.title AS document_title,d.filename,d.document_type,d.department,d.source_date,d.version,d.family_id,d.previous_document_id,d.source_sha256 FROM chunks c JOIN documents d ON d.id=c.document_id';

export async function loadScopedCorpus(owner: string, options: RetrievalOptions, expandedTerms: string[] = [], includeVectors = false): Promise<ScopedCorpus> {
  const scope = await buildCorpusScope(owner, options);
  const documents = await all<Document>(`SELECT d.* FROM documents d WHERE ${scope.predicate} ORDER BY d.updated_at DESC`, ...scope.values);
  const count = await first<{ count: number }>(`SELECT count(*) AS count FROM chunks c JOIN documents d ON d.id=c.document_id WHERE ${scope.predicate}`, ...scope.values);
  const total = count?.count ?? 0;
  let candidatePredicate = scope.predicate;
  const values = [...scope.values];
  const terms = [...queryTerms(options.query, expandedTerms).keys()].slice(0, 40);
  // For a small corpus rank the whole scope; for a large one prefilter lexical candidates.
  if (total > CORPUS_CHUNK_LIMIT && terms.length && !includeVectors) {
    const lexical = lexicalCandidateSql(terms);
    candidatePredicate += ` AND ${lexical.predicate}`;
    values.push(...lexical.values);
  }
  const candidateCount = candidatePredicate === scope.predicate ? total : (await first<{ count: number }>(`SELECT count(*) AS count FROM chunks c JOIN documents d ON d.id=c.document_id WHERE ${candidatePredicate}`, ...values))?.count ?? 0;
  const chunks = await all<CorpusChunk>(`${SELECT_CHUNKS} WHERE ${candidatePredicate} ORDER BY d.updated_at DESC,c.sequence LIMIT ${CORPUS_CHUNK_LIMIT}`, ...values);
  const warnings: string[] = [];
  if (candidateCount > CORPUS_CHUNK_LIMIT) warnings.push(`This request ranked ${CORPUS_CHUNK_LIMIT} of ${candidateCount} candidate passages. Narrow the project, selected sources, or filters for complete coverage.`);
  if (options.filters?.version_status) warnings.push('Version status follows explicit successor metadata; documents without a known successor are treated as latest.');
  return { documents, chunks, total_chunk_count: total, candidate_chunk_count: candidateCount, truncated: candidateCount > chunks.length, warnings };
}

/** Overview needs real source chunks, even for documents with no query term. */
export async function loadOverviewCorpus(owner: string, projectId?: string | null, filters?: SearchFilters): Promise<ScopedCorpus> {
  return loadScopedCorpus(owner, { query: '', project_id: projectId, filters }, [], true);
}
