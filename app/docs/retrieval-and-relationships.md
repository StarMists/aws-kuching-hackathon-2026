# Retrieval and relationship behavior

## Spotlight

Search uses actual stored document chunks in D1. Every corpus query starts with the trusted authenticated owner. A project search additionally requires membership in that project. Explicit selected document IDs are verified before retrieval and before any model request. Searching outside a supplied project requires `allow_outside_project: true`; the response records this scope change.

Lexical relevance combines a BM25-style passage score, document-title matches, exact phrase boosts, and coverage of the original query terms. English tokenization and overlapping Chinese bigrams support bilingual material. A small published-in-code terminology bridge is deterministic lexical expansion. It does not represent an embedding model.

Document-balanced ranking returns one relevant passage per document before filling additional passages, with a default limit of three passages per document. The response includes both the compatible flat `results` array and ranked document groups with page passages, source dates, types, departments, versions, hashes, and preview/file links.

Filters cover source-date ranges, document type, department, exact version, and known successor status. Latest means that no owned successor document points to that document through explicit predecessor metadata. It is not a claim that every possible revision has been uploaded.

## Model-assisted search

The shared server-only AI provider is the only model boundary. With an enabled model and explicit public/synthetic-data acknowledgement, search can expand a natural-language query into bounded retrieval terms. The actual returned mode is `query-expanded`, and vector availability stays false when no vector index is present.

Vector retrieval requires a configured embedding model and stored finite chunk vectors with the same model provenance. Only then is a query embedding requested. Mismatched-model, malformed, or missing vectors never receive a fabricated semantic score. Partial vector coverage falls back to hybrid lexical ranking and is disclosed. Search never silently embeds the entire corpus or claims that configuration alone is a working index.

If keys, consent, vectors, or a provider request are unavailable, deterministic lexical search remains usable and the response explains the actual mode. No model key is accepted in a browser request.

## Capacity and coverage

Each request ranks at most 6,000 stored candidate passages. Above that size, lexical search uses parameterized SQL candidate filtering; vector/overview retrieval retains a bounded recent slice. Coverage counts and a truncation warning tell the caller when the request did not cover all candidates. Source selections use `json_each` rather than an unbounded SQL parameter list.

The relationship graph displays at most 200 recently updated documents, with the full document library still available through search and project collections. Its text processing is cached per chunk, and relationship evidence is extracted only for retained edges.

## Overview and graph

All graph nodes are derived from verified corpus documents, their metadata, or actual chunk terms. Topic groups and shared-term document links are explicitly `inferred`; they are discovery suggestions rather than official relationships. Recorded department metadata is marked explicit metadata.

An explicit `references` link requires an exact target title or filename with nearby reference language in a real source chunk. A `supersedes` link requires a recorded predecessor ID. Each text-derived relationship carries page/chunk quotes and source hashes. The graph reports `method: deterministic` and does not fabricate model findings when AI is unavailable.

## Saved notes

Notes are persisted under an owned project in D1. Structured citations are checked against an actual ready document chunk in that project. Document identity, page number, title, and source hash are canonicalized; fabricated quotes or foreign/out-of-project chunks are rejected. Quotes must occur verbatim after whitespace normalization.

Note edits retain existing citations unless explicitly replaced. Optional `expected_updated_at` protects edits opened against an older version, and the update itself uses a compare-and-swap timestamp to prevent overlapping saves from silently overwriting one another.

## Verification

`tests/retrieval-ranking.test.mjs` covers actual relevance, English/Chinese matching, document balancing, model-expanded lexical behavior, vector provenance, explicit versus inferred graph links, ambiguous titles, scope-filtered graph input, and empty collections. `tests/retrieval-sql.test.mjs` executes candidate SQL against an actual SQLite database, checking title/body retrieval, owner predicates, escaped wildcards, SQL-looking text, bounded parameters, and JSON source selections. HTTP/D1/R2 integration is verified separately by the delivery test harness.
