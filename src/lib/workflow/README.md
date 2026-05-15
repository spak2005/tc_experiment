# `src/lib/workflow` — orchestrators

This folder is where the actual sequencing lives. The `agent/` folder
owns the brain (one step at a time); this folder runs the brain in
order for a particular trigger.

## Files

| File | Triggered by | What it does |
| --- | --- | --- |
| [intake.ts](intake.ts) | Inngest event `agentmail/inbound.received` (registered in [../inngest/functions.ts](../inngest/functions.ts)) | Main inbound-email pipeline. See [../../../docs/pipelines/intake.md](../../../docs/pipelines/intake.md). |
| [evidence-reconciliation.ts](evidence-reconciliation.ts) | Called from `intake.ts` before decisioning and from `proactive.ts` before planning | Reconciles routine evidence into document/task/milestone/phase writes, using document classification and completion signals. |
| [memory-refresh.ts](memory-refresh.ts) | Called after meaningful intake, approval, evidence, and proactive state changes | Rewrites the transaction deal brief and active questions/warnings from current transaction context. |
| [proactive.ts](proactive.ts) | Inngest cron `*/10 * * * *` via [../inngest/functions.ts](../inngest/functions.ts) | Claims due `agent_wakeups`, runs one proactive transaction decision, applies writes/sends/approvals, and marks the wakeup complete or retryable. |
| [proactive-scheduling.ts](proactive-scheduling.ts) | Called from intake and proactive execution | Schedules/cancels wakeups and computes adaptive heartbeat cadence. |
| [deadline-monitor.ts](deadline-monitor.ts) | Inngest cron `*/30 * * * *` | Finds at-risk milestones and stale response tasks, creates deduped blockers, sends escalation emails. See [../../../docs/pipelines/deadline-monitor.md](../../../docs/pipelines/deadline-monitor.md). |
| [contract-routing.ts](contract-routing.ts) | Called from `intake.ts` after document assessment | Picks `create_transaction`, `update_transaction`, `ask_which_transaction`, `ask_for_identity`, or `no_transaction_action` for a new contract PDF. Computes a "stable identity" from the property address + buyer/seller names. |
| [status-responder.ts](status-responder.ts) | Called from [../agent/executor.ts](../agent/executor.ts) when the decision is `answer_status` | Builds the plain-text status answer for a transaction (current file, status, next deadline, open blockers). Also exports `isStatusQuestion(text)` as a heuristic. |
| [tasks.ts](tasks.ts) | Called from `intake.ts` after milestones are generated | `createOpeningTasks()` returns opening tasks; `createTasksForMilestone(m)` turns operational milestone metadata into owner/follow-up task state. Tasks are created with `follow_up_due_date` unset; that field is populated later by `task-transitions.ts` at the moment an outbound email is sent. |
| [task-transitions.ts](task-transitions.ts) | Called from [../agent/executor.ts](../agent/executor.ts) on a direct send and from [../approvals/executor.ts](../approvals/executor.ts) on an approved send | Resolves which open task an outbound email is meant to progress (LLM-supplied `taskId` first, then party-email -> owner-role fallback) and flips it to `waiting_response` with `follow_up_due_date = today + staleAfterDays`. Closes the send -> waiting_response -> stale escalation loop the deadline monitor relies on. |

## Tests

Each non-trivial workflow has a Vitest spec in this folder:

- [contract-routing.test.ts](contract-routing.test.ts)
- [deadline-monitor.test.ts](deadline-monitor.test.ts)
- [status-responder.test.ts](status-responder.test.ts)
- [evidence-normalizer.test.ts](evidence-normalizer.test.ts)
- [evidence-resolver.test.ts](evidence-resolver.test.ts)
- [document-reconciliation.test.ts](document-reconciliation.test.ts)
- [phase-advancement.test.ts](phase-advancement.test.ts)
- [memory-refresh.test.ts](memory-refresh.test.ts)
- [proactive.test.ts](proactive.test.ts)
- [proactive-scheduling.test.ts](proactive-scheduling.test.ts)
- [tasks.test.ts](tasks.test.ts)
- [task-transitions.test.ts](task-transitions.test.ts)

These are the easiest way to learn the expected behavior. `intake.ts`
does not have a unit test today — it is exercised end-to-end through
the Inngest function.

## Common changes

| Change | File |
| --- | --- |
| Add or reorder a step in inbound processing | [intake.ts](intake.ts) (read [../../../docs/pipelines/intake.md](../../../docs/pipelines/intake.md) first) |
| Change how contracts route to a new vs existing transaction | [contract-routing.ts](contract-routing.ts) |
| Change what counts as a status question | [status-responder.ts](status-responder.ts) (`statusQuestionPatterns`) |
| Change evidence reconciliation behavior | [evidence-reconciliation.ts](evidence-reconciliation.ts), [evidence-resolver.ts](evidence-resolver.ts), [document-reconciliation.ts](document-reconciliation.ts), [phase-advancement.ts](phase-advancement.ts) |
| Change deal brief / active warning refresh behavior | [memory-refresh.ts](memory-refresh.ts) |
| Change owner-role mapping for milestone tasks | [tasks.ts](tasks.ts) (`ownerByMilestone`) |
| Change deadline or stale-response risk math | [deadline-monitor.ts](deadline-monitor.ts) |
| Change proactive wakeup execution | [proactive.ts](proactive.ts) |
| Change heartbeat cadence or wakeup dedupe | [proactive-scheduling.ts](proactive-scheduling.ts) |
| Change how outbound sends pick a task to flip to `waiting_response` | [task-transitions.ts](task-transitions.ts) (`resolveOutboundTask`, `transitionOutboundTaskToWaitingResponse`) |
| Change the default stale window when a task has no `staleAfterDays` | [task-transitions.ts](task-transitions.ts) (`DEFAULT_STALE_AFTER_DAYS`) |
| Change the cron schedule | [../inngest/functions.ts](../inngest/functions.ts) |

## What lives elsewhere

- The agent decision pipeline itself: [../agent/README.md](../agent/README.md).
- All SQL: [../db/repositories.ts](../db/repositories.ts).
- AgentMail send / reply / fetch: [../agentmail/service.ts](../agentmail/service.ts).
- Milestone date math and milestone definitions: [../milestones](../milestones).
