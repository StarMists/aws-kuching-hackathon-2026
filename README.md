# AWS Community Day Kuching 2026 — working repository

Private development and recovery repository owned by StarMists.

## Current state — 2026-10-07, Malaysia time (UTC+08:00)

The owner is at the event. The challenge, final rules and implementation stack are not yet confirmed. No application is implemented or validated in this repository yet. This commit establishes the durable recovery destination, not a runnable product.

## Four-hour build checkpoint workflow

- Keep one integration branch: main. One integrator publishes; workers hand over reviewed changes rather than concurrently overwriting shared files.
- Commit and push each working vertical slice, and before environment changes or agent reallocations. Save an unfinished slice explicitly as WIP before a reset risk.
- Verify the remote commit SHA and changed files after each push. Local commits alone are not backups.
- At each checkpoint update RECOVERY.md with the exact current objective, implementation status, entry point, install/start/test commands, required environment-variable NAMES, known failures and next actionable steps.
- Commit source, dependency lockfiles, necessary configuration and small redistributable fixtures. Do not commit secrets, credentials, .env files, browser profiles, personal data, proprietary company code, dependency directories, caches or bulky generated artifacts.
- Keep an additional versioned source archive outside the disposable execution environment. Reference the corresponding commit and archive digest in the recovery record.
- Preserve failed test evidence and label tests as passed, failed or not run. Never describe a partial implementation as complete.
- Restore the first runnable checkpoint into a clean directory and actually run its documented checks and startup. Repeat after material packaging changes.
- Keep the repository private until the owner approves the exact public submission scope.

## Recovery from an environment reset

1. Sign in to the owner's GitHub using a supported flow; never retrieve or copy authentication secrets.
2. Obtain the latest main source and record its commit SHA. If command-line Git authentication is unavailable, use GitHub's authenticated Code > Download ZIP and verify its contents.
3. Read RECOVERY.md before editing, then install the pinned dependencies and run the documented verification commands.
4. Restore required secrets only through the owner's approved secure mechanism, not from the repository or chat.
5. Continue the recorded next step; do not recreate completed work or infer that an unfinished test passed.

Startup and test commands will be recorded with the first actual implementation. There is currently no application to start.
