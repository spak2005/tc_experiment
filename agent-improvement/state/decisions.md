# Decisions

## 2026-06-09: Improvement state lives in the repo

Decision: Persistent Stephanie-improvement state lives under
`agent-improvement/state`.

Reason: Codex sessions are disposable. Repo files are versioned, reviewable,
and portable across sessions.

Consequence: Every improvement loop must read and update these state files.

## 2026-06-09: Passing cases do not require code changes

Decision: A successful Stephanie case should be recorded as a pass, not used as
an excuse to add code.

Reason: The goal is to close quality gaps, not create bloat.

Consequence: Codex must judge first, then patch only when evidence shows a gap.

## 2026-06-09: Live autonomous loops run only in staging

Decision: Codex-owned live email loops target staging only.

Reason: The harness should use real services without polluting production users
or real transaction operations.

Consequence: Live harness commands should refuse unsafe environments.
