import { ApiError } from '../http';
import { INGEST_LIMITS } from './limits';
import { BundledPdfBinaryDataFactory } from './pdf-cmaps';

/** Native PDF text is parsed on the server from the exact private original, not client-supplied text. */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    const options = {
      isEvalSupported: false,
      maxImageSize: INGEST_LIMITS.max_image_pixels,
      useSystemFonts: true,
      useWorkerFetch: false,
      cMapPacked: true,
      BinaryDataFactory: BundledPdfBinaryDataFactory,
      disableFontFace: true,
    };
    pdf = await getDocumentProxy(bytes.slice(), options);
    if (pdf.numPages < 1 || pdf.numPages > INGEST_LIMITS.max_pages) throw new ApiError(413, 'PDF_PAGE_LIMIT', `PDFs must contain 1–${INGEST_LIMITS.max_pages} pages.`);
    const pages: string[] = [];
    let totalChars = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const value = item.str;
        if (text && !text.endsWith('\n') && !text.endsWith(' ') && value && !value.startsWith(' ')) text += ' ';
        text += value;
        if (item.hasEOL) text += '\n';
      }
      if (text.length > INGEST_LIMITS.max_page_chars) throw new ApiError(413, 'PDF_TEXT_LIMIT', `PDF page ${number} exceeds the readable text limit.`);
      totalChars += text.length;
      if (totalChars > INGEST_LIMITS.max_document_chars) throw new ApiError(413, 'PDF_TEXT_LIMIT', 'The PDF exceeds the one-million-character extracted text limit.');
      pages.push(text);
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/password|encrypted/i.test(message)) throw new ApiError(400, 'ENCRYPTED_PDF', 'Unlock this password-protected PDF before uploading it.');
    throw new ApiError(400, 'INVALID_PDF', 'This PDF could not be read. Upload an unencrypted, undamaged PDF.');
  } finally { await (pdf as (typeof pdf & { destroy?: () => Promise<void> }))?.destroy?.(); }
}
