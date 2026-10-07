# AITLAU Sites recovery and verification

## Scope and current checkpoint

This repository is the Sites/Vinext TypeScript implementation of AITLAU. It uses a Worker, D1 structured records, private R2 originals/page images, and server-only provider calls. It does not start the original Docker, Supabase, Flutter, or Python services. See `docs/PROVENANCE.md` for the exact inspected source pins and the distinction between contract adaptation and executable code reuse.

Checkpoint: **2026-10-07 03:35 UTC**. The implementation is being integrated. This checkpoint is not a release certification.

| Required feature | Observed status at this checkpoint |
|---|---|
| Document library, PDF/text/image upload, metadata and OCR | In implementation; runtime acceptance not yet run. Synthetic OCR fixture prepared. |
| Keyword/natural retrieval, source-backed answers and follow-ups | Evidence validation and model guards pass focused deterministic/mock tests; actual retrieval/reasoning not yet run. |
| Proposal/reason/dissent/decision/later-change timeline | In implementation; live model acceptance not yet run. |
| Cited editable/exportable brief | In implementation; actual edit/export/model acceptance not yet run. |
| Conflicts/gaps with human confirm/ignore | In implementation; actual persisted review/model acceptance not yet run. |
| New-document impact, version comparison and old/new rule/case replay | In implementation; actual acceptance not yet run. |
| Interactive, source-linked relationship graph | In implementation; actual graph/navigation acceptance not yet run. |
| Actual fresh-upload/unknown/contradiction/cancel/restore demonstration | Original static corpus prepared; runtime fresh input and restore acceptance not yet run. |
| Persistent project-scoped documents/chats/notes/artifacts | D1 schema and owner-scoped contracts available; actual persistence/access tests not yet run. |
| Free Gemini primary/Groq backup | Server-only disabled/no-key/model-policy guards pass deterministic tests; provider fallback test is mock-only. No live model/OCR quality pass. |
| Responsive xushi-inspired GUI | In implementation; browser acceptance not yet run. |
| Private main-only source backup | Local package inventory started; clean unpack/install/build check and remote readback not yet run. |

## Restore application source in a clean directory

Prerequisites: Node.js >=22.13.0, npm, and access to the declared dependency registry or its exact seeded cache. Do not assume installed dependencies or environment secrets are included in the source archive.

1. Extract the source package into a fresh writable directory. Confirm that `package.json`, `package-lock.json`, `app/`, `lib/`, `db/`, `drizzle/`, and the bundled license notices exist.
2. Run `npm run install:ci`. Do not overlap package installers. This installs the lockfile's declared runtime/build dependencies without creating a global environment.
3. Run `npx tsc --noEmit`.
4. Run `node --loader ./tests/typescript-loader.mjs --test tests/*.test.mjs`. The API suite is skipped unless `QA_BASE_URL` is set; this default command establishes deterministic/mock results only.
5. Run `npm run build`. This creates the local built Worker configuration at `dist/server/wrangler.json`; the build does not publish.
6. For an empty local D1 database only, apply the initial migration with:

   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_remarkable_makkari.sql`

   Apply later migrations in sequence when present. Never replay the initial migration into an existing database. Production migrations are a separately authorized Sites operation.
7. Start a built local Worker with `npm start -- --port 5174`. It listens on loopback and uses `.wrangler/state` for D1/R2. This is local preview, not deployment.
8. For isolated synthetic integration testing, run:

   `QA_BASE_URL=http://127.0.0.1:5174 QA_AUTH_MODE=headers node --test tests/api-integration.test.mjs`

   These local header identities must never be used to impersonate users on a hosted Site. The suite only accepts loopback origins. It creates clearly synthetic records and does not delete user data.

Optional development preview: `npm run dev -- --hostname 127.0.0.1 --port 5173`. The portable preview simulates ChatGPT sign-in at `/signin-with-chatgpt?return_to=/`; supplied identity headers are stripped by the mock. For that preview use `QA_AUTH_MODE=cookie`; cross-owner tests are explicitly skipped because the mock has a single stable development user.

## Restore configuration and data separately

The source archive intentionally excludes `.env*`, credentials, `.wrangler/`, database contents, uploaded files, model outputs, dependencies, caches, and full original company repositories. Source backup is not a user-data backup.

- The Site declares D1 `DB` and R2 `BUCKET` in `.openai/hosting.json`.
- A source restore must attach/create the authorized Site's bindings through Sites, apply its migrations, and restore a separately obtained D1/R2 backup if existing user data is needed.
- D1 alone is insufficient: source originals/page images are in private R2. Preserve source hashes and storage keys as a pair. No full cloud-data restore has been verified at this checkpoint.
- Configure provider secrets only through the authorized server-side environment. Never paste keys into browser inputs, source files, commits, or test reports.
- `AI_ENABLED` defaults false. Approved settings include `GEMINI_API_KEY`/`GEMINI_MODEL`, optional `GEMINI_EMBEDDING_MODEL`, and `GROQ_API_KEY`/`GROQ_MODEL` backup. The runtime allowlist is the source of truth; availability and free-quota entitlement still require actual provider verification.
- The free-provider flow accepts only public or synthetic documents/prompts after the data-use acknowledgement. Keep real sensitive government/company material out of this test workflow.

## Resume interrupted work

Persisted tasks, chat jobs, and analysis jobs expose their real canonical status and error. Resume/retry only the existing job, preserving its source snapshot. Polling and reload must not duplicate messages or artifacts. The Worker is not an always-running scheduler; bounded job slices are resumed through the documented process/polling APIs.

Task source files survive stop/failure so the owning user can retry. An absent key must remain a visible failure; it must never turn into a canned answer or fabricated OCR transcription. An incomplete evidence result should identify what still requires human verification.

## Recorded checks

- Fixture integrity: 3/3 deterministic tests passed.
- AI-boundary/evidence validation: 11/11 deterministic/mock tests passed.
- Initial read-only packaging inventory: no high-specificity credential indicator found in inspected source inputs; this is not a comprehensive secret-safety certification.
- Full final build, real local HTTP integration, responsive browser flows, clean source restore, hosted authentication, live model/OCR, and private remote backup readback: pending at this checkpoint.
