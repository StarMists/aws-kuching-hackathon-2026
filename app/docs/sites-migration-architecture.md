# Sites migration architecture and invariants

## Actual AITLAU concepts retained

The original Docker-Deployment `AGENTS.md`, `aitlau_supabase/CHAT_ARCHITECTURE_PLAN.md`, migrations 0001/0016/0021, and `aitlau_chat/src/aitlau_chat/persistence.py` were inspected before authoring the Sites port.

1. Documents retain ordered page records and private original-file references; typed citations retain document/page/chunk/quote identity.
2. Original canonical task states remain idle, queued, processing, completed, failed, stopped, with backend-authoritative queue claims and attempts.
3. Chats remain independent durable entities. Each accepted turn creates a durable user/assistant message pair and one job. Content lives in ordered message parts. Citation columns are explicit, not hidden in arbitrary metadata.
4. Every chat job stores a complete immutable source-document list and the selected source hash. Historical citations retain the quoted supporting text.
5. The client observes persistent state and cannot carry provider credentials or become the durable job scheduler.

The broader Hackathon request extends this domain with saved Projects, document families/version predecessors, metadata dates/types/departments, derived evidence artifacts, notes with cited findings, and semantic retrieval adapters.

## Runtime replacement

- Flutter web views -> React/Vinext UI, because the provided Sites starter emits a supported Worker and responsive web shell.
- Self-hosted Supabase Postgres/Storage -> D1 SQLite tables and private R2 objects.
- Supabase RLS/service role -> trusted dispatch identity plus explicit owner and Project scope in every server operation. User input never chooses its owner ID.
- PGMQ and private FastAPI workers -> persisted jobs/leases, atomic conditional claims and completion writes, execution-context background slices, and polling-driven continuation.
- WeKnora/vector runtime -> scoped local lexical retrieval plus real configured Gemini embedding vectors and server-side similarity scoring. Unavailable embeddings are disclosed.
- llama.cpp/local OCR -> API-backed free-tier model adapters with explicit setup and data-policy acknowledgement. No fake model outputs.

No old Docker service is silently required. GPT Sites provides hosting/backend/storage. Only approved external model inference APIs remain outside that runtime boundary.

## Storage

The schema is defined in `db/schema.ts`; generated, inspected Drizzle migrations are versioned in `drizzle/`. `lib/db.ts` contains all binding access and shared ownership/corpus helpers. D1 statements are individually prepared; related writes use transaction batches. Corpus selection uses JSON array parameters to avoid D1's parameter-count ceiling. Runtime initialization never creates tables. An append-only custom Drizzle migration (0001) enforces canonical status values, immutable ownership, cross-record owner consistency, typed citation/page/chunk identity, and the per-owner serial task invariant through schema-only SQLite triggers.

D1 SQL/JSON and trigger compatibility was checked against the official Cloudflare D1 SQL API documentation: https://developers.cloudflare.com/d1/sql-api/sql-statements/

Original bytes and auxiliary OCR page images are private R2 objects. D1 contains bounded searchable text plus metadata and stable identities. Document version predecessor/family fields do not rewrite the original bytes or historical page evidence.

## Execution bounds

A Site is not an always-running local scheduler. Cloudflare Workers allow at most 30 seconds of `waitUntil` work after the response. Each provider attempt therefore has a bounded timeout, total operation budget, persisted attempt/lease state, and a visible retry/stop/failure outcome. Multi-page OCR resumes by slices. Remaining queued tasks may need the application's authorized polling endpoint to continue after a page refresh. This is an explicit migration limitation, not a simulated background process.

## Access and secret setup

Registration created an owner-private Site. Production does not use the local mock sign-in. Sharing is preserved and no public demo access is granted by this source. Model keys belong only in platform secret configuration, with paid adapters disabled. A missing key leaves non-AI workflows usable and reasoning/OCR/semantic operations visibly unavailable.
