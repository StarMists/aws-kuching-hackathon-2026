# AITLAU Sites migration: shared implementation contracts

Baseline: Taotern/Docker-Deployment commit 4118358a2239c7feb74de9b9a7931113cb92a7da. Preserve its document/page ownership, canonical task statuses, durable chat envelope/ordered parts, immutable per-job document selection, typed citations, and backend-only model access. Source snapshots under ../input remain read-only.

## Stack and ownership
- Sites Vinext/React/TypeScript; Cloudflare Workers runtime; D1 `DB` structured records; private R2 `BUCKET` files. Platform dispatch authentication. All API calls same origin, all queries owner-scoped. No Supabase/Docker/AWS runtime.
- Core: db/schema.ts, drizzle/, lib/db.ts, lib/auth.ts, lib/http.ts, lib/contracts.ts, app/api/projects/**, app/api/health/**, app/api/config/**, hosting/build/package integration. Ask before schema/package changes.
- Ingestion: lib/ingest/**, app/api/documents/**, app/api/tasks/**. Browser PDF/image extraction helper may be shared with frontend after coordination.
- Search: lib/retrieval/**, app/api/search/**, lib/graph/**, app/api/graph/**, app/api/notes/**.
- AI workflows: lib/ai.ts, lib/ai/**, lib/chat/**, app/api/chats/**, app/api/jobs/**, lib/intelligence/**, app/api/analysis/**, app/api/artifacts/**.
- Frontend: app/page.tsx, app/globals.css, components/**, public/**. app/layout.tsx may be edited by frontend.
- QA/reuse: tests/**, docs/** (except core migration architecture).

## Conventions
JSON/database field names snake_case. Successful responses `{ data: ... }`; errors `{ error: { code, message, details? } }`. Use `ApiError` + `apiError()` from lib/http.ts. All routes `export const dynamic = 'force-dynamic'`. Route params in Vinext/Next are Promise<{ id: string }>. `owner = await requireOwner(request)`; throws if no trusted identity. Local preview uses the bundled dispatch-mock sign-in; there is no anonymous owner fallback. Never trust a client-supplied owner_id. Production never auto-creates schema. Prepared queries via `db()` and helpers from lib/db.ts, exactly one SQL statement/prepare. Multiwrite `batch` is transactional. IDs `newId()` UUID, times `now()` ISO UTC. Parse JSON columns using `parseJson()`.

## Durable tables
projects: id, owner_id, name, description, created_at, updated_at.
documents: id, owner_id, title, filename, content_type, document_type, department, source_date, version, family_id, previous_document_id, status, extraction_method, error_message, r2_key, source_sha256, page_count, chunk_count, created_at, updated_at. document status pending/processing/ready/failed; original task uses original canonical states.
project_documents: project_id, document_id, added_at (unique pair).
pages: extraction_method nullable, extraction_metadata_json, image_r2_key nullable, id, document_id, page_number, text, markdown, created_at (unique document/page).
chunks: id, document_id, page_id, page_number, sequence, text, start_offset, end_offset, embedding_json, embedding_model, created_at.
tasks: claim_id, lease_expires_at, id, owner_id, document_id nullable, project_id nullable, kind ingestion/analysis, request_json, result_artifact_id, model, status idle/queued/processing/completed/failed/stopped, attempt, error_message, created_at, updated_at.
chats: id, owner_id, project_id nullable, title, status active/archived, created_at, updated_at.
chat_messages: id, chat_id, role user/assistant, sequence, status queued/processing/completed/failed/stopped, created_at.
chat_message_parts: id, message_id, sequence, type text/citation, text, citation_document_id, citation_page_number, citation_chunk_id, citation_quote, metadata_json.
chat_jobs: claim_id, lease_expires_at, id, owner_id, chat_id, request_message_id, response_message_id, request_text, status queued/processing/completed/failed/stopped, attempt, model, error_message, created_at, updated_at.
chat_job_sources: job_id, document_id, source_sha256 (immutable selected list).
artifacts: id, owner_id, project_id, kind brief/timeline/conflict/gap/impact/replay/graph, title, markdown, content_json, document_ids_json, created_at, updated_at.
notes: id, owner_id, project_id, title, content, citations_json, created_at, updated_at.

## Endpoints and payloads
GET /api/health -> storage status + model configuration status, no secrets.
GET /api/config -> provider/model/readiness, upload limits and capabilities.
GET /api/projects -> Project[]; POST {name,description?} -> Project.
GET /api/projects/:id -> {project,documents,chats,notes,artifacts}; PATCH {name?,description?} -> Project.
POST /api/projects/:id/documents {document_ids:string[]} adds owned documents; DELETE same body detaches only.
GET /api/documents?project_id= -> Document[]; POST multipart file + project_id?, title?,document_type?,source_date?,version?,family_id?,previous_document_id? -> {document,task}; also JSON text ingestion {text,title,filename?,project_id?,document_type?,source_date?,version?,family_id?,previous_document_id?}. Store original bytes R2, page text D1, chunks derived. Scans must call actual OCR; report missing-model failure instead of invented extraction. GET /api/documents/:id -> {document,pages}; PATCH metadata/content through guarded implementation; GET /api/documents/:id/file -> original bytes.
POST /api/search {query,project_id?,document_ids?,mode:'keyword'|'semantic'|'hybrid',limit?} -> {results:SearchHit[],mode,semantic_available,warning?}. Never label keyword as semantic. Source scope must be enforced before retrieval.
GET /api/chats?project_id= -> Chat[]; POST {title?,project_id?} -> Chat; GET /api/chats/:id -> {chat,messages:MessageView[],jobs}; POST /api/chats/:id/messages {text,document_ids:string[]} -> {job,chat,messages?}. Persist user/assistant envelopes + immutable sources BEFORE actual generation. Job APIs must make queued/processing/completed/failed visible. No automatic retry creates duplicate messages. Client polls durable status; answers cite actual chunks and pages.
POST /api/analysis {project_id,kind,document_ids?,prompt?,previous_document_id?,new_document_id?,case_text?} -> Artifact. Use real provider for reasoning; missing key is explicit 503. Deterministic diff/graph may work without AI and must be labelled deterministic. GET /api/artifacts?project_id=; GET/PATCH /api/artifacts/:id; GET /api/artifacts/:id/export?format=md -> editable/exportable cited brief. POST /api/notes {project_id,title,content}; PATCH /api/notes/:id; DELETE optional recoverable semantics needs coordination.
GET /api/graph?project_id= -> {nodes,edges}; derive named entities/topics/relationships from actual chunks/metadata/citations, label rule-derived graph if no AI.

## Runtime AI configuration
Secrets only in Sites environment. `AI_ENABLED` defaults false; primary GEMINI_API_KEY + GEMINI_MODEL (latest user choice: free Gemini; Groq backup). No browser key entry, no `.env` commits. GROQ_API_KEY + GROQ_MODEL only for configured fallback. OpenAI adapter optional and disabled; no paid Luna calls. Model calls/embedding/OCR are server-only and bounded; caller sees real failure and provider/model receipt, never fabricated answers. Core config reads binding presence but does not expose values. Budget authorization handled by parent.

## Frontend integration
Use types from lib/contracts.ts; API wrapper can use fetch and `.data`. No hard-coded working/demo data in initial state. Empty database opens with create project and upload controls. Optional explicitly labelled fixture import must insert real records, never fake model output. Show version/date/type/page citations; interactive graph links document/chunk. Citations open source document/page. Preserve project scope for every tab/action.

## Tests / release
npm build, TypeScript, targeted pure tests + API/storage auth integration. Verify durable reload, project scoping, file retrieval, citations, no-key behavior, responsive UI. Core alone registers/publishes and provides verified private URL. Private backup main only; parent handles backup push. No public access without new approval.

analysis_jobs: id, owner_id, project_id, kind, request_json, source_snapshot_json, status queued/processing/completed/failed/stopped, attempt, lease_id, lease_expires_at, artifact_id, error_message, created_at, updated_at.
ai_usage: id, owner_id, job_id nullable, provider, model, input_tokens, output_tokens, status, created_at.
Background helper lib/background.ts uses request execution context waitUntil. This preserves acknowledged job work, but Workers limit post-response work to 30 seconds. Bound each API reasoning/OCR call <=25 seconds, persist progress/failure, and resume queued slices via authorized polling. Never imply an always-running Docker scheduler.
