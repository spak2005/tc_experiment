# Stephanie Diagnostics Reference

Use this reference when improving Stephanie inside the `tc_experiment` repository.

## Source Of Truth

Human observability and agent diagnostics share the same database records:

- `agent_activity_runs`
- `agent_activity_events`
- transactions, messages, documents, approvals, tasks, milestones, wakeups, blockers
- agent decisions, transaction facts/change events, extracted contract facts, audit events
- webhook payloads and outbound email actions when stored

Do not create a second observability store for normal debugging.

## Diagnostics Commands

Start compact:

```bash
npm run debug:run -- --activity-run-id <run-id>
npm run debug:find -- --case-run-id <case-run-id>
npm run debug:timeline -- --case-run-id <case-run-id>
```

Escalate only when needed:

```bash
npm run debug:run -- --activity-run-id <run-id> --depth standard
npm run debug:event -- --event-id <event-id> --depth standard
npm run debug:run -- --activity-run-id <run-id> --depth raw --out diagnostics/run.json
```

Depth meanings:

- `summary`: compact default; run identity, trigger, ordered events, key metadata, errors, extraction summaries, decision summaries.
- `standard`: adds related transaction records without raw bodies or raw payloads.
- `raw`: includes stored raw JSON fields and email/action bodies. It still does not include PDF/document binary bytes.

The authenticated API exposes the same bundle:

```text
GET /api/internal/diagnostics/activity-runs/<run-id>?depth=summary
```

## What To Ask The Human

Ask for only the missing details:

- `activityRunId` only when no `caseRunId` or searchable marker exists.
- What the agent did wrong.
- What a strong human operator should have done instead.
- Whether raw logs are acceptable if `summary` and `standard` do not explain the issue.

Do not ask for copied observability logs when the activity run id is available.

## Improvement Loop

Use this sequence:

1. Read `agent-improvement/state/`.
2. Create or select a case and staged stimulus.
3. Fetch the compact timeline.
4. Identify the first suspicious stage.
5. Fetch `standard` or `raw` only if needed.
6. Judge actual behavior against the rubric.
7. If the case passes, record `no_gap` and stop.
8. If human taste, outside logs, or repeated failed attempts block progress, create a human-review item and regenerate `status.html`.
9. If the case fails, state actual vs expected and identify the code path.
10. Add a targeted test/eval using the real failure shape when possible.
11. Implement the smallest safe fix.
12. Run targeted tests, then relevant regression tests.
13. Record the run, diagnosis, fix, tests, and residual risks.

## Current Harness Locations

- Diagnostics harness: `agent-improvement/diagnostics/`
- Diagnostics API route: `src/app/api/internal/diagnostics/activity-runs/[runId]/route.ts`
- Diagnostics source loader: `src/lib/db/repositories.ts` via `getDiagnosticsSourceRecords`
- Improvement state: `agent-improvement/state/`
- Human-readable status page: `agent-improvement/state/status.html`
- Human observability docs: `docs/activity-debugger.md`
