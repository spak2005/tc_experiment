---
name: agent-improvement-harness
description: Diagnose and improve production agent behavior from real-world traces. Use when an AI engineering agent is asked to inspect an activity run, debug why Stephanie or another operational agent behaved incorrectly, compare actual behavior against expected human/expert behavior, design a fix, add targeted and regression tests, or turn reality-derived failures into durable improvement work.
---

# Agent Improvement Harness

## Operating Model

Treat the production agent as the system under observation, not as the component that improves itself. Use traces, human corrections, and tests to improve the codebase through reviewed changes.

Start from reality. When the user wants autonomous improvement, start from a
case instead of waiting for a human-provided activity id:

1. Read `agent-improvement/state/`.
2. Create or select a case.
3. Prepare/send the staged QA Gmail stimulus when needed.
4. Resolve the run from `caseRunId`, not by asking the user for logs.
5. Fetch compact diagnostics first.
6. Judge actual behavior against the rubric.
7. If the case passes, record `no_gap` and stop.
8. If the case fails, diagnose the gap before changing code.
9. Add or update a targeted test/eval before or alongside the fix.
10. Verify relevant regression tests still pass.

## Diagnostics Workflow

Read `references/stephanie-diagnostics.md` when working in the Stephanie repository or when diagnostics commands, bundle depths, or expected trace fields matter.

Default to layered context:

- Use `summary` first for run identity, timeline, key errors, extraction summaries, and decision summaries.
- Use `debug:timeline` for high-level steps when a `caseRunId` is available.
- Use `debug:event` for a single suspicious step.
- Use `standard` when related transaction records are needed.
- Use `raw` only when stored payloads, tool results, email/action bodies, or webhook payloads are needed.

Do not request or load raw logs by default. Preserve context by starting small and escalating depth deliberately.

## Diagnosis Checklist

Classify the issue before fixing it:

- **Instrumentation gap**: the trace does not show enough to explain behavior.
- **Ingestion/extraction failure**: documents, attachments, OCR/vision/PDF handling, schema parsing, or validation failed.
- **Matching/routing failure**: the agent matched the wrong file, failed to create/update a file, or lost stable identity.
- **Decision/policy failure**: intent/action, approval gating, rationale, or safety policy was wrong.
- **Execution/write failure**: transaction writes, emails, approvals, tasks, milestones, wakeups, or blockers did not reflect the decision.
- **Product behavior gap**: the code worked as designed, but the design is not how a strong human operator should work.
- **No gap**: Stephanie met the rubric. Record the pass; do not make a change.

## Improvement Rules

Prefer durable improvements over one-off fixes:

- Convert real failures into targeted tests or eval fixtures whenever feasible.
- Do not patch when the case meets the quality bar.
- Keep fixes narrow and explain the failure mode in the commit or final summary.
- Use atomic commits for each logical unit: instrumentation, fixture, failing test, fix, docs.
- Never treat passing one trace as sufficient if the change touches shared behavior; run relevant regression tests too.
- Do not store duplicated observability blobs unless creating an explicit eval snapshot. Live diagnostics should be generated from source-of-truth tables.

## Commands

- `npm run improve:check`
- `npm run improve:new -- --title "..." --failure-type product_behavior`
- `npm run improve:prepare-email -- --case-id <case-id>`
- `npm run debug:find -- --case-run-id <case-run-id>`
- `npm run debug:timeline -- --case-run-id <case-run-id>`
- `npm run debug:event -- --event-id <event-id> --depth standard`
- `npm run improve:judge -- --case-id <case-id> --case-run-id <case-run-id>`
- `npm run improve:record -- --status no_gap --result "..." --tests "..." --next "..."`
