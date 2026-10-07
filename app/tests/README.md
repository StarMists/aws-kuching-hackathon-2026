# Test boundaries

## Deterministic checks

- `node --test tests/fixture-integrity.test.mjs`: original fixture content and byte integrity.
- `node tests/package-audit.mjs .`: read-only source packaging inventory, exclusions, high-specificity credential indicators, and required recovery/provenance documentation. An indicator scan is not a certification that no secrets exist.
- Additional owner-supplied pure ranking, extraction, lifecycle, diff, graph and citation tests belong in this directory. A pure/mock test does not count as a live AI/OCR pass.

## Actual API integration

The QA runner will exercise the real Vinext Worker with D1/R2 through its local HTTP origin. It creates only clearly synthetic QA records and verifies owner/project boundaries, persistence, exact original bytes, lifecycle, source quote correspondence, and absent-provider behavior.

Run against an isolated local preview database. Test identity headers are local-preview inputs only; they must never be treated as production access credentials. The published private Site is independently gated by platform authentication.

Live AI acceptance is opt-in after approved free provider keys are configured. Neither a no-key error nor a mocked response establishes reasoning/OCR correctness. The test report must state which checks were actually run, failed, blocked, or not run.
