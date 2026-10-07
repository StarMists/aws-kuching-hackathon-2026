# Taotern source release

This ZIP is the authoritative LATEST SOURCE handoff, with a clean package.json/package-lock.json and Windows/Docker installer. It deliberately contains no stale dist. The older native repository tree is historical; do not mix versions.

1. Keep the existing Docker-Deployment/Supabase/OCR/WeKnora/model-proxy stack running.
2. Run the root Start.ps1. It verifies the SHA256, extracts into an isolated directory and asks for the existing checkout/project/network. Docker builds ONLY the new Taotern GUI/adapter from the lockfile; original services and volumes are not rebuilt or migrated.
3. Open http://127.0.0.1:8788. Check.ps1 runs redacted verification without model calls; use -LiveAI explicitly for actual model/OCR/retrieval acceptance. Missing original owner UUID/WeKnora tenant/KB configuration remains an explicit blocker/NOTRUN.

The teammate needs Docker Compose/build access and registry connectivity. No host Node installation is required. No model is downloaded or launched, and no global ExecutionPolicy/security change or destructive down -v/reset is requested. Existing backend env files stay on the teammate's computer; optional values belong in untracked local.env. Never upload secrets to GitHub or reports.

The GUI is Taotern with original-PDF page/zoom/fit reader. Existing model proxy, original Supabase queue/Python OCR engine and WeKnora index/search are accessed through bounded adapters. Chat/analysis currently select frozen native evidence; that is not claimed to be the original WeKnora chat engine. Configuration or cloud tests do not certify the teammate's host. Follow docs/LOCAL-VERIFICATION.md and retain PASS/FAIL/NOTRUN receipts.

Participants: Daniel Ong Zhi En, You Zheng
