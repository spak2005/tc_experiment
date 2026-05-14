# `src/lib/db` — Postgres data layer

Two files only:

| File | Purpose |
| --- | --- |
| [client.ts](client.ts) | `pg.Pool` singleton, `query<T>`, and `withTransaction(callback)`. Reads `DATABASE_URL` via [../config/env.ts](../config/env.ts). |
| [repositories.ts](repositories.ts) | All SQL the app runs. Large file; grouped by aggregate below. |

This README exists because `repositories.ts` is too big to load
end-to-end. Use the function names below with `rg` to jump.

## Aggregate map for `repositories.ts`

> Line numbers are accurate at the time of writing. If they have
> shifted, treat the function names as authoritative and re-grep.

| Aggregate | Functions | Jump |
| --- | --- | --- |
| Activity events | `createAgentActivityEvent`, `getTransactionActivityEvents`, `getTeamActivityTimeline` | search by function |
| Teams, users, TC profiles | `createTeam`, `createUser`, `createTcProfile`, `findTcProfileByInbox` | search by function |
| Webhook events | `recordWebhookEvent`, `markWebhookEventProcessed` | search by function |
| Audit events | `createAuditEvent` | search by function |
| Transactions (writes) | `createTransaction`, `updateTransactionFromFacts`, `saveExtractedContractFacts` | search by function |
| Milestones + tasks | `insertMilestones`, `insertTasks`, `upsertMilestoneRecord`, `upsertTaskRecord`, `getTaskById`, `findOpenTasksByOwnerRole` | search by function |
| Parties | `upsertParty`, `findPartyRolesByEmails` | search by function |
| Messages + documents | `createMessage`, `createDocumentRecord`, `updateDocumentStatus`, `updateDocumentRecord` | search by function |
| Matching + transaction context | `findTransactionMatchCandidates`, `getTransactionContextData` | search by function |
| Transaction memory | `upsertTransactionMemory`, `appendTransactionMemory` | search by function |
| Agent decisions | `createAgentDecision`, `updateAgentDecisionExecution` | search by function |
| Agent wakeups | `createAgentWakeup`, `claimDueAgentWakeups`, `completeAgentWakeup`, `failAgentWakeup`, `cancelPendingAgentWakeups`, `listTransactionWakeups` | search by function |
| Deadlines + blockers | `findAtRiskMilestones`, `findStaleResponseTasks`, `createBlocker`, `upsertBlockerRecord` | search by function |
| Approvals | `createApproval` (carries `task_id` so an approved send can transition the linked task), `updateApprovalStatus`, `findPendingApprovalByReply`, approval metadata helpers | search by function |
| Dashboard view | `getDashboardSnapshot` | search by function |
| Status view | `findLatestOpenTransaction`, `getTransactionStatusSummary` | search by function |
| Transaction detail view | `getTransactionDetail` | search by function |

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
- Operational metadata lives on `documents.metadata`, `milestones.metadata`,
  and `tasks.metadata`; stale-response dedupe uses `blockers.task_id`.
- `tasks.follow_up_due_date` is not seeded at task creation. It is
  populated by [../workflow/task-transitions.ts](../workflow/task-transitions.ts)
  at the moment an outbound email actually goes out, alongside
  flipping `tasks.status` to `waiting_response`. `tasks.metadata.staleAfterDays`
  controls the offset; missing or invalid values fall back to
  `DEFAULT_STALE_AFTER_DAYS` (2).
- `approvals.task_id` links an approval-gated draft
  to the task the eventual send is meant to progress. The approvals
  executor uses it to flip the linked task to `waiting_response`
  after the realtor approves.
- `agent_wakeups` stores future proactive work. A static Inngest cron
  claims due rows with `claimDueAgentWakeups`; the app does not create
  per-task infrastructure cron jobs.
- Activity row rows returned to callers are mapped through the local
  `toActivityEvent` helper so callers receive the camelCase
  `AgentActivityEvent` shape defined in
  [../agent/activity.ts](../agent/activity.ts).

## Common changes

| Change | Where |
| --- | --- |
| Add a new column to an existing table | New migration in `migrations/` + update the matching repository function(s) |
| Add a new aggregate | New migration in `migrations/` + a new section in this file with its functions |
| New query that crosses aggregates (e.g. dashboard) | Put it next to the existing view functions |
| Change structured write behavior | Update [../transaction-writes](../transaction-writes) and the repository function it calls |
| Performance index | Migration only; no code change |

## Related docs

- The schema itself: migrations `001` through `007` in [../../../migrations](../../../migrations).
- The observability event contract: [../../../docs/activity-debugger.md](../../../docs/activity-debugger.md).
