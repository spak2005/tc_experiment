# `src/lib/workflow` — orchestrators

This folder is where the actual sequencing lives. The `agent/` folder
owns the brain (one step at a time); this folder runs the brain in
order for a particular trigger.

## Files

| File | Triggered by | What it does |
| --- | --- | --- |
| [intake.ts](intake.ts) | Inngest event `agentmail/inbound.received` (registered in [../inngest/functions.ts](../inngest/functions.ts)) | Main inbound-email pipeline. See [../../../docs/pipelines/intake.md](../../../docs/pipelines/intake.md). |
| [deadline-monitor.ts](deadline-monitor.ts) | Inngest cron `*/30 * * * *` | Finds at-risk milestones, creates blockers, sends escalation emails. See [../../../docs/pipelines/deadline-monitor.md](../../../docs/pipelines/deadline-monitor.md). |
| [contract-routing.ts](contract-routing.ts) | Called from `intake.ts` after document assessment | Picks `create_transaction`, `update_transaction`, `ask_which_transaction`, `ask_for_identity`, or `no_transaction_action` for a new contract PDF. Computes a "stable identity" from the property address + buyer/seller names. |
| [status-responder.ts](status-responder.ts) | Called from [../agent/executor.ts](../agent/executor.ts) when the decision is `answer_status` | Builds the plain-text status answer for a transaction (current file, status, next deadline, open blockers). Also exports `isStatusQuestion(text)` as a heuristic. |
| [tasks.ts](tasks.ts) | Called from `intake.ts` after milestones are generated | `createOpeningTasks()` returns three opening tasks; `createTasksForMilestone(m)` returns the per-milestone task with the right owner role. |

## Tests

Each non-trivial workflow has a Vitest spec in this folder:

- [contract-routing.test.ts](contract-routing.test.ts)
- [deadline-monitor.test.ts](deadline-monitor.test.ts)
- [status-responder.test.ts](status-responder.test.ts)

These are the easiest way to learn the expected behavior. `intake.ts`
does not have a unit test today — it is exercised end-to-end through
the Inngest function.

## Common changes

| Change | File |
| --- | --- |
| Add or reorder a step in inbound processing | [intake.ts](intake.ts) (read [../../../docs/pipelines/intake.md](../../../docs/pipelines/intake.md) first) |
| Change how contracts route to a new vs existing transaction | [contract-routing.ts](contract-routing.ts) |
| Change what counts as a status question | [status-responder.ts](status-responder.ts) (`statusQuestionPatterns`) |
| Change owner-role mapping for milestone tasks | [tasks.ts](tasks.ts) (`ownerByMilestone`) |
| Change deadline lead time / risk math | [deadline-monitor.ts](deadline-monitor.ts) |
| Change the cron schedule | [../inngest/functions.ts](../inngest/functions.ts) |

## What lives elsewhere

- The agent decision pipeline itself: [../agent/README.md](../agent/README.md).
- All SQL: [../db/repositories.ts](../db/repositories.ts).
- AgentMail send / reply / fetch: [../agentmail/service.ts](../agentmail/service.ts).
- Milestone date math and milestone definitions: [../milestones](../milestones).
