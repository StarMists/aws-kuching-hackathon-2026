# Source reuse and migration provenance

## Pinned inputs

The implementation team inspected the authorized, read-only project source snapshots. The source owner supplied the following pins; source archives were obtained and their archive commit identifiers were checked by the parent task.

| Source | Inspected revision | Role in this project |
|---|---|---|
| Taotern/Docker-Deployment | `4118358a2239c7feb74de9b9a7931113cb92a7da` | Product architecture, ownership boundaries, durable task/chat contracts, database migration behavior |
| Taotern/AITLAU | `edafa77efea3ece16e43be63d59f4f47a9a56e70` | Existing Flutter product models, document/page navigation, canonical task states, durable chat message and citation models |
| Taotern/TaoternOCR | `80336b06ff8d04e6497d80cd148950faaa67be35` | Provider-neutral OCR page request/results, exact page ordering and provenance principles, bounded execution and recovery design |

These repositories remain untouched. This backup contains the Sites implementation and its documentation, not the complete original company repositories, their runtime data, or their sample/private documents. No claim is made that the private original repositories are public or that a general third-party redistribution license was granted.

## What was concretely preserved or adapted

| Existing source evidence | Sites implementation | Reuse classification |
|---|---|---|
| Docker root `AGENTS.md`; AITLAU `lib/models/tasks/tasks_model.dart`; Docker `aitlau_supabase/volumes/db/migrations/0002_task_queue_baseline.sql` | `lib/contracts.ts`, `db/schema.ts`, ingestion/task and AI job routes | Ported lifecycle contract: `idle`, `queued`, `processing`, `completed`, `failed`, `stopped`; durable records and observable failures, not client-only queue aliases |
| AITLAU `lib/models/documents/document_model.dart`, `document_page_model.dart` | `documents`/`pages` tables, document detail/file APIs, source-page UI | Ported source/document/page relationship, exact page number and source-file access; adapted owner ID/private R2 storage rather than Supabase file models |
| AITLAU `lib/models/chat/chat_message_model.dart`, `chat_message_part_model.dart`, `chat_citation_model.dart`; Docker migrations `0016_create_durable_chat_schema.sql`, `0027_chat_text_citations.sql` | `chats`, `chat_messages`, `chat_message_parts`, `lib/chat/**`, `lib/intelligence/evidence.ts` | Ported durable message envelopes and ordered typed text/citation parts, actual document/chunk/page/quote citations |
| Docker migrations `0018_chat_submission_commands.sql`, `0021_chat_worker_contract.sql`, `0026_fix_submit_chat_turn_conflict.sql`, `0028_restrict_internal_worker_tables.sql` | `chat_jobs`, `chat_job_sources`, owner-scoped database helpers and job routes | Ported accepted-job persistence, source snapshot and restricted server-side access principles; implemented with D1 transactions/claims for Workers |
| TaoternOCR `src/taotern_ocr/models.py`, `domain.py`, `outputs.py` (`assemble_markdown` source-order/unique-page rule); `tests/test_pipeline_execution_control_20260808.py` | `lib/ai/vision.ts`, `lib/ingest/**`, page extraction metadata, task slice/retry/stop APIs | Adapted provider-neutral page transcriptions, original language/reading order, exact page identity, honest illegibility/failure and provenance. The Python verification pipeline is not running in this Site |
| Existing product responsibilities and private-service boundaries in Docker root/AITLAU `AGENTS.md` | Server-only Gemini/Groq adapters, platform authentication, D1/R2, same-origin API | Adapted backend-only inference and ownership requirements, with the user's explicit Sites-only target replacing Docker/Supabase/FastAPI runtime |

This is a new TypeScript/React implementation of the inspected product contracts and interaction responsibilities. It is not a byte-for-byte Flutter frontend reuse, a deployed Python LangGraph service, or a direct migration of a live company database. Existing source snapshots were used as development references; no user data was migrated.

## New project work

Projects/collections, project-scoped notes and conversations, metadata/version lineage, grounded retrieval, timelines, cited editable briefs, conflict/gap review, version impact/rule replay, and interactive relationship visualization are authored for this Sites build. Their actual observed feature status is recorded in `ACCEPTANCE.md` and `RECOVERY.md`. Source reuse does not itself establish a feature acceptance pass.

The original synthetic fixtures under `tests/fixtures/synthetic-civic/` were written for QA. They contain no real government, company, or personal records. The fixtures and answer oracle must not be confused with model output or a measured quality benchmark.

## Third-party framework notices

The package includes Sites/Vinext starter integration files and the following bundled notices:

- `build/sites-vite-plugin.LICENSE`
- `vendor/shadcn-tailwind-4.13.0.LICENSE.md`

Runtime/build dependencies are declared in `package.json` with exact resolution in `package-lock.json`. Their installed packages retain their own licenses/notices. Dependency declarations and package review do not certify commercial rights or regulatory suitability. Do not remove notices when repackaging.
