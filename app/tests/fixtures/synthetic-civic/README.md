# Original synthetic civic document corpus

These are original QA fixtures, not government records or real company/user documents. All agencies, people, identifiers, monetary ceilings, locations, decisions, and events are fictional. Every rendered source is visibly labelled synthetic. The corpus may be included in the private project backup and used for testing this project.

## Upload corpus

| File | Type | Source date | Version | Family / previous version | Pages |
|---|---|---|---|---|---|
| `circular-v1.pdf` or `.txt` | circular | 2026-09-14 | 1 | SERAI-ACCESS-2026 / none | 3 |
| `meeting-minutes.pdf` or `.txt` | meeting minutes | 2026-10-02 | 1 | SERAI-MINUTES-20261002 / none | 2 |
| `circular-v2.pdf` or `.txt` | circular | 2026-10-05 | 2 | SERAI-ACCESS-2026 / uploaded v1 ID | 3 |
| `operations-note.pdf` or `.txt` | operational note | 2026-10-06 | 1 | SERAI-OPS-11 / none | 1 |
| `field-slip-photo.jpg` | field slip | 2026-10-07 | 1 | SERAI-FIELD-23 / none | 1 |
| `field-slip-scanned.pdf` | field slip | 2026-10-07 | 1 | SERAI-FIELD-23-SCAN / none | 1 |

Choose PDF or equivalent text for each text document rather than uploading duplicates. The `.txt` files use form-feed page boundaries. PDF files have an actual text layer. The scanned PDF deliberately has no text layer. The JPEG is a mildly tilted photo-style rendering of an original field slip. Its `.txt` counterpart is a transcription oracle, not evidence of a successful OCR run.

`truth.json` and `field-slip-photo.txt` are QA answer references. Never upload them into the project under test. Do not treat a model response matching a prewritten reference as a real pass unless the actual uploaded source, provider execution, saved response, and valid citations were checked.

## Adversarial facts

- Version 1 proposes 12 November / RM 240,000 / three counters.
- Version 2 supersedes these values with 19 November / RM 210,000 / two counters.
- Meeting decision D-02 used the older plan and recorded dissent.
- A later operational note repeats the older date/layout and claims operational readiness without signed clearance.
- A-17 remains unresolved and has a due date before the revised inspection date.
- Supplier, procurement approval reference, served-resident count, measured queue reduction, and total meeting attendance are absent. An answer must not invent them or assert the events never occurred.
- The OCR-only field-slip image records 112 cm and explicitly says NOT signed off.

## Novel-input test

The API integration runner creates an additional document at runtime with a fresh UUID-derived keyword and randomly selected, clearly synthetic factual value. That document is not part of this static corpus. Correct answering must come from the saved new source, not a canned corpus response.

## Regeneration and validation

Python requirements for the optional generator: Pillow, reportlab, pypdf. These are test-fixture tooling, not application runtime dependencies.

Run `python3 tests/fixtures/generate-fixtures.py` from the app root. PDF rendering can be reviewed with `pdftoppm -png tests/fixtures/synthetic-civic/circular-v2.pdf /tmp/circular-v2`. Static fixture integrity is checked by `node --test tests/fixture-integrity.test.mjs`.

Regeneration changes PDF metadata/digests, so the generator rewrites the SHA256 oracle. The checked-in files are the intended QA inputs; byte-identical regeneration is not claimed.
