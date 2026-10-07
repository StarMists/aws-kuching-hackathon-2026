# AITLAU Evidence Workspace

Private organizational knowledge workspace migrated from the actual Taotern AITLAU product for the Kuching hackathon on 7 October 2026.

The working surface is document-first: Spotlight retrieval, saved Projects, grounded investigation chats, evidence notes and cited briefs, timelines, rule/version comparisons, case replay, conflict/gap checks, and a meaningful source-linked relationship graph. OCR is an auxiliary intake path for photographed or scanned material.

## Product and source boundaries

- Baseline: Taotern/Docker-Deployment at `4118358a2239c7feb74de9b9a7931113cb92a7da`.
- Flutter application pin: `edafa77efea3ece16e43be63d59f4f47a9a56e70`.
- TaoTernOCR pin: `80336b06ff8d04e6497d80cd148950faaa67be35`.
- Original snapshots remain unchanged outside this application checkout.
- Domain/contracts are ported to TypeScript; this is not a runnable Docker/Supabase/Python/Flutter deployment. See `docs/` for exact reuse provenance and acceptance evidence.
- Deployment, database, file storage, and backend use GPT Sites only: Cloudflare Workers-compatible Vinext, platform D1 `DB`, platform-private R2 `BUCKET`, and dispatch-owned ChatGPT authentication. No AWS resources or self-hosted services are required.

## Run and verify

Requires Node >=22.13.0. Restore dependencies with the committed lockfile:

1. `npm ci --prefer-offline --no-audit --no-fund`
2. `npm run db:generate` only after a schema change, inspect generated SQL and keep applied migrations immutable.
3. `npm run build`
4. Apply each not-yet-applied local migration using `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/<migration>.sql`.
5. `npm run dev` uses loopback port 5173. Local ChatGPT mock sign-in is `/signin-with-chatgpt?return_to=/`; it is never included in production. `npm start -- --port 5174` serves the built Worker locally without deploying.
6. `npx tsc --noEmit` and the focused acceptance tests in `tests/`.

If the environment's default npm cache is unwritable, choose a writable project-local cache for installation: `npm_config_cache="$PWD/.sites-runtime/npm-cache" npm ci`. Local caches, node_modules, build outputs, execution state, and local environment files are ignored. The limited-disk authoring environment may reuse exact-version installed packages through read-only symlinks; those symlinks are not committed, packaged, or required to restore this source.

## Runtime model setup

The latest authorized runtime plan uses free-tier Gemini primary and Groq fallback. Paid OpenAI calls are disabled. Configure secrets through the supported Sites production environment configuration, never in source, browser code, chat, or a committed `.env` file:

- `GEMINI_API_KEY` as a secret; `GEMINI_MODEL=gemini-3.8-flash`.
- Optional `GROQ_API_KEY` as a secret; `GROQ_MODEL=openai/gpt-oss-120b`.
- `AI_ENABLED=true` only after the owner has completed the key/terms and data-sharing authorization steps.
- Optional supported `GEMINI_EMBEDDING_MODEL`, subject to actual free-tier availability.

`/api/config` reports only readiness and model names, never secret values. Real model calls enforce deadlines and configured free-model allowlists. Free providers have account-level limits and data policies; Gemini free-tier processing is restricted to owner-acknowledged public or synthetic input. Missing key, rate limit, unsupported model, unavailable semantic embeddings, incomplete OCR, failed grounding, and provider errors remain visible rather than being replaced with fabricated model output.

## Persistence and privacy

D1 is authoritative for Projects, document/page/chunk metadata, notes, chat envelopes/ordered citation parts, immutable selected chat sources, jobs, analysis artifacts, and usage receipts. R2 holds original files and auxiliary page images. Every API resolves the trusted platform user and verifies ownership and Project membership server-side. The Site is owner-private by default; wider sharing requires explicit owner approval.

Model work is stored before execution and uses durable leases and guarded terminal writes. The Sites Worker request execution context provides `waitUntil` for acknowledged background slices. Workers limit work after an HTTP response to 30 seconds, so provider attempts are bounded and remaining work resumes via authorized task/job polling; this replaces the original always-running Docker scheduler without pretending an equivalent daemon exists.

`CONTRACTS.md` records module ownership, API payloads, schema field names, and integration invariants. This repository contains no production private documents, API keys, credentials, or generated private outputs. Demo fixtures are clearly labelled synthetic.
