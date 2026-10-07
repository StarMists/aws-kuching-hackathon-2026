import type { Chunk, Document, SearchHit } from '../contracts';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';
export type EffectiveSearchMode = SearchMode | 'query-expanded';
export interface SearchFilters {
  source_date_from?: string;
  source_date_to?: string;
  document_type?: string;
  department?: string;
  version?: string;
  version_status?: 'latest' | 'superseded';
}
export interface RetrievalOptions {
  query: string;
  project_id?: string | null;
  document_ids?: string[];
  allow_outside_project?: boolean;
  mode?: SearchMode;
  filters?: SearchFilters;
  limit?: number;
  max_passages_per_document?: number;
  /** Return at least one relevant passage per document before filling more. */
  balanced?: boolean;
  public_data_acknowledged?: boolean;
  signal?: AbortSignal;
}
export interface CorpusChunk extends Chunk {
  document_title: string;
  filename: string;
  document_type: string;
  department: string;
  source_date: string | null;
  version: string;
  family_id: string;
  previous_document_id: string | null;
  source_sha256: string | null;
}
export interface RankedSearchHit extends SearchHit {
  department: string;
  filename: string;
  lexical_score: number;
  semantic_score?: number;
  matched_terms: string[];
  source_url: string;
  file_url: string;
  citation_url: string;
}
export interface SearchDocumentGroup {
  document_id: string;
  document_title: string;
  filename: string;
  document_type: string;
  department: string;
  source_date: string | null;
  version: string;
  score: number;
  passage_count: number;
  passages: RankedSearchHit[];
  source_url: string;
  file_url: string;
}
export interface RetrievalResult {
  results: RankedSearchHit[];
  documents: SearchDocumentGroup[];
  mode: EffectiveSearchMode;
  requested_mode: SearchMode;
  semantic_available: boolean;
  query_expansion_available: boolean;
  semantic_indexed_chunk_count: number;
  expanded_terms: string[];
  scope: { type: 'project' | 'library' | 'selection'; project_id: string | null; outside_project: boolean };
  coverage: {
    selected_document_count: number;
    eligible_document_count: number;
    candidate_chunk_count: number;
    total_chunk_count: number;
    truncated: boolean;
  };
  warning?: string;
  warnings: string[];
  provider?: string;
  model?: string;
}
export interface ScopedCorpus {
  documents: Document[];
  chunks: CorpusChunk[];
  total_chunk_count: number;
  candidate_chunk_count: number;
  truncated: boolean;
  warnings: string[];
}
