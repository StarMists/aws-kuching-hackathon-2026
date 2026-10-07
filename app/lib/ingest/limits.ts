/** Shared browser/server limits. Model keys and raw source bytes never go to a third-party parser. */
export const INGEST_LIMITS = {
  max_upload_bytes: 20 * 1024 * 1024,
  max_request_bytes: 48 * 1024 * 1024,
  max_pages: 80,
  max_ocr_pages: 20,
  max_page_image_bytes: 4 * 1024 * 1024,
  max_image_pixels: 12_000_000,
  max_page_chars: 120_000,
  max_document_chars: 1_000_000,
  max_text_chars: 1_000_000,
  chunk_chars: 1200,
  chunk_overlap: 180,
  ocr_text_threshold: 24,
} as const;
export const SUPPORTED_CONTENT_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type SupportedContentType = typeof SUPPORTED_CONTENT_TYPES[number];
export interface UploadMetadata {
  title?: string;
  project_id?: string;
  document_type?: string;
  department?: string;
  public_data_acknowledged?: boolean;
  source_date?: string;
  version?: string;
  family_id?: string;
  previous_document_id?: string;
}
export interface IngestionPage {
  page_number: number;
  text: string;
  markdown: string;
  extraction_method: 'pdf_text' | 'plain_text' | 'markdown' | 'vision_ocr';
  image_r2_key?: string;
  image_content_type?: 'image/png' | 'image/jpeg' | 'image/webp';
  extraction_metadata?: Record<string, unknown>;
}
export interface IngestionManifest {
  schema_version: 1;
  source_sha256: string;
  source_content_type: SupportedContentType;
  total_pages: number;
  pages: IngestionPage[];
}
export interface IngestionRequest {
  manifest_r2_key: string;
  source_sha256: string;
  auto_queue: boolean;
  public_data_acknowledged: boolean;
}
export interface ChunkSlice { text: string; start_offset: number; end_offset: number; }
