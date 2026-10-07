# Document ingestion and OCR migration

## Pinned source evidence

- AITLAU frontend commit `edafa77efea3ece16e43be63d59f4f47a9a56e70`: `lib/models/documents/document_page_model.dart` identifies pages by document ID and positive page number and separates Markdown from OCR metadata. `lib/models/meta_data/document_page_meta_data_model.dart` defines `schema_version`, `verification_status`, and `processing_seconds`. These semantics are preserved in D1 pages and extraction metadata.
- TaoternOCR commit `80336b06ff8d04e6497d80cd148950faaa67be35`: `src/taotern_ocr/domain.py` models immutable source evidence with SHA-256 and page count, page images as separate artifacts, observations with page/provider/model/image-artifact hash, and `unverified` page results. The migration preserves these provenance identities and labels single-pass API OCR `unverified`; it does not claim TaoternOCR's multi-pass verification was run.
- Docker-Deployment commit `4118358a2239c7feb74de9b9a7931113cb92a7da`: canonical task states, private originals, ordered serial claims, durable processing state and idempotent effects are preserved. The runtime is Sites Workers, D1 and private R2 instead of Docker/FastAPI/Supabase.

## Actual runtime

`POST /api/documents` retains exact original bytes in owner-private R2, computes SHA-256 server-side, validates type/size/date/version ownership, and creates the document plus its durable task. Native PDFs are parsed server-side with unpdf's serverless PDF.js build and a lazy-decoded official Adobe CMap bundle for nonembedded Chinese/Japanese/Korean font mappings. Browser rendering uses same-origin packaged CMaps; no third-party asset fetch is required. Extracted pages retain their original page numbers. TXT/MD logical pages use explicit form-feed separators. Source text is never invented or accepted from an arbitrary client PDF extraction result.

Cloudflare Workers has no browser canvas. The upload helper renders only scanned/low-text PDF pages in the user's browser and sends bounded JPEG page images alongside the exact original PDF. It also prepares photos as bounded JPEG. Their page number, original source hash and image artifact hash are retained. The server verifies the parsed PDF's page count and enforces image-page bounds before using the server-only shared vision API. Images require a public/non-sensitive-data acknowledgement for the free provider. Native PDF/TXT/MD extraction does not transmit sources to a model.

`POST /api/tasks/:id/process` drives the durable queue head, including interrupted/expired leases, and returns the requested task's durable state. Native-text work processes up to eight pages per slice; OCR processes one page per slice with a 24-second caller deadline. Claim IDs fence every page/chunk insert and final state write. Intermediate pages remain durable across retry or tab reload. Stop invalidates the claim; retry resumes the original manifest and skips already retained pages. Queue reordering is a single conditionally validated D1 statement.

Page text and source bytes become immutable accepted evidence. Metadata updates require the loaded `expected_updated_at`; changing page text or source bytes requires a new document/version. Predecessor and family links must belong to the same owner. Ordinary repeated source uploads return the existing durable document/task; explicit new versions remain distinct and do not overwrite earlier originals.

Chunks are exact UTF-16 slices of each retained page, with positive original page numbers and start/end offsets. Source previews, original download/Range responses and per-page OCR image previews are owner-authorized. Per-page receipts include extraction method, source and image hashes, actual provider/model/usage/request ID/latency, illegible regions and unverified OCR status.

## Verification and limits

Focused tests use independently labelled synthetic civic source PDFs and photos. Native English and Mandarin (nonembedded CMap) PDF parsing, scanned PDFs having no text layer, UTF-8/magic/type/date validation, image dimension limits, form-feed pages and exact chunk coverage/offsets are tested. Real OCR acceptance requires a configured provider key and is distinct from mock transport tests.

Limits: 20 MB original, 48 MB complete multipart request, 80 total pages, 20 scanned pages, 4 MB OCR image, 12 megapixels, 120,000 characters per page, one million per document. Password-protected/damaged PDFs and missing scan renders have explicit errors. Native font/CJK/map behavior and OCR accuracy depend on the actual supplied PDF/provider and need source-specific acceptance checks. No local model, Docker service, public bucket, credential in the client or silent OCR fallback is used.
