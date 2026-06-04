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
```

Escalate only when needed:

```bash
npm run debug:run -- --activity-run-id <run-id> --depth standard
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

- `activityRunId` if not provided.
- What the agent did wrong.
- What a strong human operator should have done instead.
- Whether raw logs are acceptable if `summary` and `standard` do not explain the issue.

Do not ask for copied observability logs when the activity run id is available.

## Improvement Loop

Use this sequence:

1. Fetch `summary`.
2. Identify the first suspicious stage in the timeline.
3. Fetch `standard` or `raw` only if needed.
4. State the behavior gap: actual vs expected.
5. Identify the code path from the trace.
6. Add a targeted test/eval using the real failure shape when possible.
7. Implement the smallest safe fix.
8. Run targeted tests, then relevant regression tests.
9. Report the activity run, diagnosis, fix, tests, and residual risks.

## Current Harness Locations

- Diagnostics harness: `agent-improvement/diagnostics/`
- Diagnostics API route: `src/app/api/internal/diagnostics/activity-runs/[runId]/route.ts`
- Diagnostics source loader: `src/lib/db/repositories.ts` via `getDiagnosticsSourceRecords`
- Human observability docs: `docs/activity-debugger.md`

