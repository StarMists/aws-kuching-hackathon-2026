import { ApiError } from '../http';
import { INGEST_LIMITS, type SupportedContentType, type UploadMetadata } from './limits';

export function sanitizeFilename(filename: string): string {
  return filename.split(/[\\/]/).pop()?.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 255) || 'source.txt';
}
export function detectContentType(bytes: Uint8Array, filename: string, supplied = ''): SupportedContentType {
  if (bytes.length === 0) throw new ApiError(400, 'EMPTY_FILE', 'The source file is empty.');
  if (bytes.length > INGEST_LIMITS.max_upload_bytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Source files must be 20 MB or smaller.');
  const ascii = new TextDecoder().decode(bytes.slice(0, 1024));
  const extension = filename.toLowerCase().split('.').pop();
  if (/^\s*%PDF-[12]\.\d/.test(ascii) || ((extension === 'pdf' || supplied === 'application/pdf') && /%PDF-[12]\.\d/.test(ascii))) return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (extension === 'pdf' || supplied === 'application/pdf') throw new ApiError(400, 'INVALID_PDF', 'This file does not contain a valid PDF header.');
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '') || supplied.startsWith('image/')) throw new ApiError(400, 'INVALID_IMAGE', 'The file is not a supported PNG, JPEG, or WebP image.');
  if (extension === 'md' || extension === 'markdown' || supplied === 'text/markdown') { decodeSourceText(bytes); return 'text/markdown'; }
  if (extension === 'txt' || supplied === 'text/plain') { decodeSourceText(bytes); return 'text/plain'; }
  throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a PDF, TXT, Markdown, PNG, JPEG, or WebP file.');
}
export function decodeSourceText(bytes: Uint8Array): string {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ApiError(400, 'INVALID_TEXT_ENCODING', 'Text and Markdown sources must use UTF-8 encoding.'); }
  if (text.includes('\0')) throw new ApiError(400, 'BINARY_TEXT', 'This source contains binary data rather than readable text.');
  if (text.length > INGEST_LIMITS.max_text_chars) throw new ApiError(413, 'TEXT_TOO_LARGE', 'The source exceeds the one-million-character text limit.');
  if (!text.trim()) throw new ApiError(400, 'EMPTY_TEXT', 'The source has no readable text.');
  return text;
}
function optionalString(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new ApiError(400, 'INVALID_METADATA', `${label} is invalid or too long.`);
  return value.trim() || undefined;
}
export function validateUploadMetadata(input: Record<string, unknown>): UploadMetadata {
  const metadata: UploadMetadata = {
    title: optionalString(input.title, 'Title', 300),
    project_id: optionalString(input.project_id, 'Project', 100),
    document_type: optionalString(input.document_type, 'Document type', 80),
    department: optionalString(input.department, 'Department', 120),
    public_data_acknowledged: input.public_data_acknowledged === true || input.public_data_acknowledged === 'true',
    version: optionalString(input.version, 'Version', 80),
    family_id: optionalString(input.family_id, 'Version family', 100),
    previous_document_id: optionalString(input.previous_document_id, 'Previous document', 100),
    source_date: optionalString(input.source_date, 'Source date', 10),
  };
  if (metadata.source_date) {
    const timestamp = Date.parse(`${metadata.source_date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.source_date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== metadata.source_date) throw new ApiError(400, 'INVALID_SOURCE_DATE', 'Source date must be a real date in YYYY-MM-DD format.');
  }
  return metadata;
}
