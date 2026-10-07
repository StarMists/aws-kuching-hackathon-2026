import { INGEST_LIMITS, type ChunkSlice } from './limits';

/** Offsets are exact UTF-16 slices of the durable page.text used by citation validation. */
export function chunkPageText(text: string, maxChars: number = INGEST_LIMITS.chunk_chars, overlap: number = INGEST_LIMITS.chunk_overlap): ChunkSlice[] {
  if (!Number.isInteger(maxChars) || maxChars < 32 || !Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars) throw new Error('Invalid chunk size or overlap.');
  const slices: ChunkSlice[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // Prefer a genuine paragraph/word boundary without losing or rewriting source characters.
    if (end < text.length) {
      const lower = start + Math.floor(maxChars * 0.65);
      let candidate = text.lastIndexOf('\n', end - 1);
      if (candidate < lower) candidate = text.lastIndexOf(' ', end - 1);
      if (candidate >= lower) end = candidate + 1;
      if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    const slice = text.slice(start, end);
    if (slice.trim()) slices.push({ text: slice, start_offset: start, end_offset: end });
    if (end === text.length) break;
    const next = Math.max(start + 1, end - overlap);
    start = next > 0 && /[\uDC00-\uDFFF]/.test(text[next]) ? next + 1 : next;
  }
  return slices;
}

export function needsVisionOcr(text: string): boolean {
  return text.replace(/\s/g, '').length < INGEST_LIMITS.ocr_text_threshold;
}

/** TXT/MD have logical pages at explicit form feeds; never fabricate PDF-like page breaks. */
export function splitTextPages(text: string): string[] {
  return text.replace(/^\uFEFF/, '').split('\f');
}
