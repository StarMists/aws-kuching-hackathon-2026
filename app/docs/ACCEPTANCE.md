# Hackathon acceptance matrix

Status vocabulary: **not run**, **pass**, **fail**, **blocked**. A mock/unit pass never establishes live model quality. Source documents are private, source citations must point to actual stored pages/chunks, and missing credentials must produce an actionable error rather than sample answers.

| ID | Requirement | Acceptance evidence | Initial status |
|---|---|---|---|
| F01 | Document library, metadata, PDF/text/image upload and OCR assistance | Upload original synthetic text PDF, text file, scanned PDF, and photo; store original bytes; real extraction/OCR; correct page numbers; durable ready/failed task state; view/download exact original | not run |
| A02 | Persistent Projects and scope | Create two projects; attach/detach owned documents; reload project/history/artifacts/notes; every tab stays in selected project; no records from another owner | not run |
| F02a | Keyword and natural-language retrieval | Exact novel phrase is found; natural paraphrase returns relevant stored passages through a real configured model/embedding; source/date/version visible; unavailable semantic mode honestly labelled | not run |
| F02b | Source-backed answers and follow-up questions | Ask novel factual question then pronoun follow-up; answers grounded in selected documents; quotes exist in stored chunks; click citations opens exact page; unknown answer explicitly unsupported | not run |
| F03 | Decision timeline reconstruction | Reconstruct proposal, rationale, dissent, decision, revision, action due dates, and launch dates in order; distinguish document date from event date; cite every substantive event | not run |
| F04 | Editable, exportable briefing | Generate an evidence-backed brief; edit/save; reload retains edits; export editable Markdown/text without losing cited source IDs; no invented approval or budget | not run |
| F05 | Conflicts and information gaps | Human confirm/ignore persists; missing evidence is not evidence that an event never happened; detect v1/v2 changed launch/budget/counters, dated meeting disagreement, unresolved accessibility sign-off and missing procurement reference; describe superseded evidence rather than flattening history | not run |
| F06a | New-document impact and version comparison | Add revision after earlier analysis; link family/previous version; highlight old/new values with citations; explain affected decisions/actions; immutable existing job scope remains unchanged | not run |
| F06b | Old/new rule and similar-case replay | Use submitted case text to retrieve relevant actual documents and build cited sequence/lessons; no historical cases invented; unrelated case produces an insufficient-evidence response | not run |
| F07 | Document relationship graph | Actual document/topic/entity/decision nodes and supported edges; interactive evidence/source navigation; no invented relationships; clearly label rule-derived mode | not run |
| A03 | Task/chat lifecycle and interruptions | Durable queued/processing/completed/failed/stopped states; one claim/output per job; duplicate poll and reload do not duplicate messages/artifacts; retry observable and bounded | not run |
| A04 | Responsive visual quality and errors | Desktop/tablet/mobile layouts; readable xushi entity/structure/whitespace treatment; empty/working/failure states; invalid uploads, absent model, cancelled/repeated actions, navigation and focus | not run |
| F08 | Reliable actual-new-upload/question/unknown/contradiction/cancel/restore demo | Fresh run-specific document and nonce/facts answered only from evidence; cancellation/restoration observable and persistent; unknown field not invented; contradictions retain distinct source/date/version citations | not run |
| A06 | Cross-owner/project authorization | Foreign document/chat/project/artifact/note/file IDs denied; mixed owned/foreign request denied atomically; project scoping applies to search, chat, analysis, graph, exports and background jobs | not run |
| A07 | Sites-only runtime and truthful provider status | Actual Sites Vinext/Worker + D1/R2; backend-only key use; Gemini primary/Groq backup on approved free keys; no paid/default model fallback or browser credential entry | not run |
| A08 | Existing-product reuse and provenance | Explain exact baseline/component snapshots and reused contracts/behavior; no claim of deployed Docker/Supabase services; preserve ownership, status names, immutable job sources and ordered chat parts | not run |
| A09 | Clean private backup and recovery | Deliberate source archive excludes secrets/runtime/cache/company originals; includes licenses and lockfile; unpack identical artifact out of tree, install/build/test with documented commands; remote main and private visibility read back by publisher | not run |

## Evidence rules

- Deterministic tests may validate storage, access, transformations, diff, graph, and UI wiring. They cannot certify OCR, natural-language reasoning, provider failover, or factual answer quality.
- Live AI acceptance requires an actual configured provider receipt, actual source documents, saved output, and checked citations. There is no preset demo answer.
- Provider failures, throttling, unsupported image type, missing configuration, and insufficient evidence are real outcomes and stay visible in the report.
- Synthetic fixture ground truth lives beside the upload corpus but is never itself uploaded to the project under test.
- Report only observed feature behavior. No latency, throughput, quality, platform, or government suitability claims are inferred from a small fixture run.

## Test corpus

See `tests/fixtures/synthetic-civic/README.md` and `truth.json`. All people, agencies, file numbers, project facts, and decisions are fictional. `truth.json` is an oracle for QA, not an ingestion source.
