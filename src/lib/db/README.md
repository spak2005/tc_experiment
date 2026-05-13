# `src/lib/db` — Postgres data layer

Two files only:

| File | Purpose |
| --- | --- |
| [client.ts](client.ts) | `pg.Pool` singleton, `query<T>`, and `withTransaction(callback)`. Reads `DATABASE_URL` via [../config/env.ts](../config/env.ts). |
| [repositories.ts](repositories.ts) | All SQL the app runs. ~1336 lines, ~31 exported functions. Grouped by aggregate below. |

This README exists because `repositories.ts` is too big to load
end-to-end. Use the line ranges to jump.

## Aggregate map for `repositories.ts`

> Line numbers are accurate at the time of writing. If they have
> shifted, treat the function names as authoritative and re-grep.

| Aggregate | Functions | Lines |
| --- | --- | --- |
| Activity events | `createAgentActivityEvent`, `getTransactionActivityEvents`, `getTeamActivityTimeline` | 77–211 |
| Teams, users, TC profiles | `createTeam`, `createUser`, `createTcProfile`, `findTcProfileByInbox` | 213–264, 312–329 |
| Webhook events | `recordWebhookEvent`, `markWebhookEventProcessed` | 266–290 |
| Audit events | `createAuditEvent` | 292–310 |
| Transactions (writes) | `createTransaction`, `updateTransactionFromFacts`, `saveExtractedContractFacts` | 331–419 |
| Milestones + tasks | `insertMilestones`, `insertTasks` | 420–490 |
| Messages + documents | `createMessage`, `createDocumentRecord`, `updateDocumentStatus` | 491–564, 863–874 |
| Matching + transaction context | `findTransactionMatchCandidates`, `getTransactionContextData` | 565–762 |
| Transaction memory | `upsertTransactionMemory` | 764–794 |
| Agent decisions | `createAgentDecision`, `updateAgentDecisionExecution` | 796–862 |
| Deadlines + blockers | `findAtRiskMilestones`, `createBlocker` | 875–937 |
| Approvals | `createApproval`, `updateApprovalStatus` | 939–1002 |
| Dashboard view | `getDashboardSnapshot` | 1004–1057 |
| Status view | `findLatestOpenTransaction`, `getTransactionStatusSummary` | 1059–1126 |
| Transaction detail view | `getTransactionDetail` | 1127–end |

## Conventions

- Every function uses parameterized queries through `query<T>` or
  through a passed-in `PoolClientLike` (used when the call is part of a
  larger `withTransaction`).
- `jsonb` columns are written with `JSON.stringify(value ?? null)` via
  the `toJsonb` helper at the top of the file.
- Reads that hydrate higher-level views (dashboard, transaction
  context, transaction detail) live alongside the writes for the same
  aggregate. Activity-timeline assembly for views uses
  `mapLegacyRecordsToActivity` + `sortActivityTimeline` from
  [../agent/activity-timeline.ts](../agent/activity-timeline.ts).
- Activity row rows returned to callers are mapped through the local
  `toActivityEvent` helper so callers receive the camelCase
  `AgentActivityEvent` shape defined in
  [../agent/activity.ts](../agent/activity.ts).

## Common changes

| Change | Where |
| --- | --- |
| Add a new column to an existing table | New migration in `migrations/` + update the matching function(s) above |
| Add a new aggregate | New migration in `migrations/` + a new section in this file with its functions |
| New query that crosses aggregates (e.g. dashboard) | Put it next to the existing view functions (1004–end) |
| Performance index | Migration only; no code change |

## Related docs

- The schema itself: [../../../migrations/001_initial_schema.sql](../../../migrations/001_initial_schema.sql), [../../../migrations/002_agent_memory_and_decisions.sql](../../../migrations/002_agent_memory_and_decisions.sql), [../../../migrations/003_agent_activity_events.sql](../../../migrations/003_agent_activity_events.sql).
- The observability event contract: [../../../docs/activity-debugger.md](../../../docs/activity-debugger.md).
