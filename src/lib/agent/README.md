# `src/lib/agent` — the agent brain

This folder owns the per-email decision pipeline (what to do with one
inbound email) and the activity-event observability layer. They live
together for historical reasons; mentally keep them separate.

If you are debugging or changing **behavior**, you almost certainly want
one of the pipeline files. If you are changing what shows up on the
observability page, you want one of the activity files.

## The 8-step decision pipeline

The pipeline runs once per inbound email, orchestrated by
[../workflow/intake.ts](../workflow/intake.ts). See
[../../../docs/pipelines/intake.md](../../../docs/pipelines/intake.md)
for line-level detail. Realtor replies to pending approval requests are
handled first by `src/lib/approvals` and do not enter the generic
decision pipeline.

| Step | File | What it does |
| --- | --- | --- |
| 1. Build context | [context.ts](context.ts) | Gathers everything the agent needs for one email: normalized inbound, match candidates, current transaction context (milestones, tasks, documents, messages, blockers, memory), and a temporal context line. |
| 2. Match | [matching.ts](matching.ts) | Scores each candidate transaction against the email (thread id, party email, property tokens, recent subjects, etc.) and returns a `DealMatchResult` with confidence + ambiguity flag. |
| 3. Assess document | [document-assessment.ts](document-assessment.ts) | If the email carries a PDF, classifies it (contract vs other), extracts facts (Anthropic PDF mode with regex fallback), and decides `usable / unusable / needs_info`. |
| 4. Decide | [decision.ts](decision.ts) | Asks Anthropic to pick an `AgentIntent` and `AgentAction` from a closed enum, with confidence, rationale, and an optional drafted response. Falls back to a deterministic decision if the LLM call fails. |
| 5. Policy | [policy.ts](policy.ts) | Enforces V1 send policy: noop allowed, "legal advice" blocked, external recipients require approval, etc. Output is `allowed / approval_required / blocked`. |
| 6. Execute | [executor.ts](executor.ts) | Acts on the decision: writes outbound email, creates an approval request, records tool results, updates the `agent_decisions` row, emits an audit event. |
| 7. Compose response | [response-writer.ts](response-writer.ts) | Used inside the executor when the decision did not supply a `response.body` itself. Calls Anthropic with the response-writer system prompt and returns `{ subject, body, to, cc, labels }`. |
| 8. Log | [activity.ts](activity.ts), [activity-timeline.ts](activity-timeline.ts) | Records every step of the pipeline in `agent_activity_events`. Powers the observability and transaction-detail pages. Not part of behavior. |

## Shared types

All cross-file types for the pipeline live in [types.ts](types.ts):
`AgentIntent`, `AgentAction`, `TransactionMatchCandidate`,
`DealMatchResult`, `TransactionContext`, `AgentContextPack`,
`AgentToolCall`, `AgentDecision`, `PolicyResult`. When you add a new
intent or action enum value, this is the file to start in; the schema
in `decision.ts` mirrors the enums.

## Observability files (not part of the pipeline)

- [activity.ts](activity.ts) — defines `AgentActivityEvent`, the source
  and status enums, and small helpers (`safeBodyPreview`,
  `activityStatusForPolicyResult`, `activityStatusForExecutionStatus`).
- [activity-timeline.ts](activity-timeline.ts) — adapts legacy records
  (messages, documents, agent_decisions, approvals, audit events) into
  synthetic `AgentActivityEvent`s so older transactions still render a
  timeline. Pure mapping; no IO.

See [../../../docs/activity-debugger.md](../../../docs/activity-debugger.md)
for the broader observability contract (statuses, source types,
logging rules).

## Common changes

| Change | File |
| --- | --- |
| Add a new intent or action | [types.ts](types.ts) + [decision.ts](decision.ts) (schema + system prompt) + maybe [executor.ts](executor.ts) (handling) |
| Tweak the decision rules / system prompt | [decision.ts](decision.ts) |
| Tweak how outbound emails are written | [response-writer.ts](response-writer.ts) |
| Tighten or loosen the send policy | [policy.ts](policy.ts) |
| Change matching scoring or thresholds | [matching.ts](matching.ts) |
| Change what document assessment considers usable | [document-assessment.ts](document-assessment.ts) |
| Add a new activity event status or source | [activity.ts](activity.ts) (and update `agent_activity_events.status` consumers) |
| Map a new legacy record into the timeline | [activity-timeline.ts](activity-timeline.ts) |

## What lives elsewhere

- The orchestration (the order in which these files are called) lives
  in [../workflow/intake.ts](../workflow/intake.ts), not here.
- Approval-by-reply classification and execution lives in
  [../approvals](../approvals). It interprets realtor replies such as
  "send", "hold off", "make this edit then send", and "make this edit
  and let me see it".
- The Anthropic client and JSON parsing helpers live in
  [../llm](../llm).
- SQL reads / writes live in [../db/repositories.ts](../db/repositories.ts).
