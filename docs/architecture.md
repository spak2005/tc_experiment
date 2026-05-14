# Architecture

A practical map of this codebase, written so an agent can pick the right
files to read before changing anything.

If you are starting fresh, read [../AGENTS.md](../AGENTS.md) first; this
file fills in the next layer of detail.

## Active vs stable modules

"Active" means the file has changed often in `git log` and is the most
likely place to make further changes. "Stable" means the file rarely
changes and you usually do not need to read it to make a change
elsewhere.

| Status | File | Why it matters |
| --- | --- | --- |
| Active | [src/lib/workflow/intake.ts](../src/lib/workflow/intake.ts) | Main inbound-email pipeline; read pipeline doc before the file |
| Active | [src/lib/db/repositories.ts](../src/lib/db/repositories.ts) | Single large Postgres repository file; use DB README/function search |
| Active | [src/lib/agent/decision.ts](../src/lib/agent/decision.ts) | LLM-driven intent and action picker |
| Active | [src/lib/agent/executor.ts](../src/lib/agent/executor.ts) | Sends emails, creates approvals, records execution |
| Active | [src/lib/transaction-writes/executor.ts](../src/lib/transaction-writes/executor.ts) | Applies structured transaction mutations from intake and agent decisions |
| Active | [src/lib/transaction-writes/schemas.ts](../src/lib/transaction-writes/schemas.ts) | Zod schemas for allowed transaction write tools |
| Active | [src/lib/approvals/executor.ts](../src/lib/approvals/executor.ts) | Approve-by-reply execution for send/reject/revise realtor replies |
| Active | [src/lib/agent/activity.ts](../src/lib/agent/activity.ts) | Activity event types, status helpers, body preview |
| Active | [src/lib/agent/activity-timeline.ts](../src/lib/agent/activity-timeline.ts) | Maps legacy records into the same activity stream |
| Active | [src/lib/documents/attachments.ts](../src/lib/documents/attachments.ts) | Fetch / store inbound attachments and write document records |
| Stable | [src/lib/agent/types.ts](../src/lib/agent/types.ts) | Shared types: intents, actions, context pack, decision, policy |
| Stable | [src/lib/agent/context.ts](../src/lib/agent/context.ts) | Builds the agent context pack for one inbound email |
| Stable | [src/lib/agent/matching.ts](../src/lib/agent/matching.ts) | Scores inbound vs candidate transactions |
| Stable | [src/lib/agent/policy.ts](../src/lib/agent/policy.ts) | V1 send policy (allow, approval_required, blocked) |
| Stable | [src/lib/agent/response-writer.ts](../src/lib/agent/response-writer.ts) | LLM email-body composer |
| Stable | [src/lib/agent/document-assessment.ts](../src/lib/agent/document-assessment.ts) | Anthropic PDF assessment + fallback heuristics |
| Stable | [src/lib/workflow/contract-routing.ts](../src/lib/workflow/contract-routing.ts) | Pick: create_transaction / update_transaction / ask_which |
| Stable | [src/lib/workflow/deadline-monitor.ts](../src/lib/workflow/deadline-monitor.ts) | Cron worker that escalates at-risk milestones and stale response tasks |
| Stable | [src/lib/workflow/status-responder.ts](../src/lib/workflow/status-responder.ts) | Builds "what is the status of my deal?" reply text |
| Stable | [src/lib/workflow/tasks.ts](../src/lib/workflow/tasks.ts) | Opening tasks + operational per-milestone task generation |
| Stable | [src/lib/contracts/anthropic-extract.ts](../src/lib/contracts/anthropic-extract.ts) | Anthropic PDF extraction prompt + call |
| Stable | [src/lib/contracts/extract.ts](../src/lib/contracts/extract.ts) | Regex fallback for TREC contract facts |
| Stable | [src/lib/contracts/facts.ts](../src/lib/contracts/facts.ts) | Zod schema for `ContractFacts` + small accessors |
| Stable | [src/lib/contracts/checklist.ts](../src/lib/contracts/checklist.ts) | Builds expected document checklist from extracted facts/addenda |
| Stable | [src/lib/contracts/validate.ts](../src/lib/contracts/validate.ts) | Decides ready_for_review / needs_info / blocked |
| Stable | [src/lib/milestones/engine.ts](../src/lib/milestones/engine.ts) | Texas milestone generator from extracted facts |
| Stable | [src/lib/milestones/date-rules.ts](../src/lib/milestones/date-rules.ts) | Business-day, weekend, and holiday math |
| Stable | [src/lib/agentmail/client.ts](../src/lib/agentmail/client.ts) | Thin wrapper around the AgentMail SDK |
| Stable | [src/lib/agentmail/service.ts](../src/lib/agentmail/service.ts) | Provision inboxes, send, reply, fetch attachment |
| Stable | [src/lib/agentmail/inbound.ts](../src/lib/agentmail/inbound.ts) | Normalizes inbound webhook payloads |
| Stable | [src/lib/email/templates.ts](../src/lib/email/templates.ts) | Plain-text outbound email templates |
| Stable | [src/lib/storage/blob.ts](../src/lib/storage/blob.ts) | Vercel Blob wrapper for private documents |
| Stable | [src/lib/llm/anthropic.ts](../src/lib/llm/anthropic.ts) | Anthropic client + model selection |
| Stable | [src/lib/llm/json.ts](../src/lib/llm/json.ts) | Helpers to pull JSON out of LLM responses |
| Stable | [src/lib/inngest/client.ts](../src/lib/inngest/client.ts) | Inngest singleton |
| Stable | [src/lib/inngest/events.ts](../src/lib/inngest/events.ts) | Event name constants |
| Stable | [src/lib/inngest/functions.ts](../src/lib/inngest/functions.ts) | Function registry + cron schedule |
| Stable | [src/lib/onboarding/service.ts](../src/lib/onboarding/service.ts) | Signup orchestration (team, user, AgentMail inbox, TC profile) |
| Stable | [src/lib/time/clock.ts](../src/lib/time/clock.ts) | Central Time clock + temporal-context helpers |
| Stable | [src/lib/config/env.ts](../src/lib/config/env.ts) | `requireEnv` / `getEnv` |
| Stable | [src/lib/domain/types.ts](../src/lib/domain/types.ts) | Shared domain types (Milestone, TransactionPhase, etc.) |
| Stable | [src/lib/db/client.ts](../src/lib/db/client.ts) | `pg` pool, `query`, `withTransaction` |

## Subsystem one-liners

- `src/lib/agent` — the agent "brain": context pack, matching, decision, policy, executor, response writer, document assessment, and observability helpers. See [src/lib/agent/README.md](../src/lib/agent/README.md).
- `src/lib/workflow` — orchestrators (intake, deadline/stale monitor, contract routing, status responder, tasks). See [src/lib/workflow/README.md](../src/lib/workflow/README.md).
- `src/lib/db` — Postgres connection pool + a single very large repositories file. See [src/lib/db/README.md](../src/lib/db/README.md).
- `src/lib/agentmail` — inbound normalization + outbound send/reply + inbox provisioning. See [src/lib/agentmail/README.md](../src/lib/agentmail/README.md).
- `src/lib/contracts` — extract + validate Texas residential contract facts, contacts, operational terms, and expected documents.
- `src/lib/milestones` — date math and Texas-specific operational milestone generator.
- `src/lib/documents` — fetch attachments from AgentMail, store in Vercel Blob, write a `documents` row.
- `src/lib/transaction-writes` — schema-validated mutation tools for facts, parties, milestones, tasks, documents, blockers, memory, and core transaction fields.
- `src/lib/approvals` — approve-by-reply classification/execution for realtor replies to pending external-email drafts.
- `src/lib/email` — plain-text outbound templates (escalation, approval request).
- `src/lib/storage` — Vercel Blob wrapper for private files.
- `src/lib/llm` — Anthropic client + JSON-from-LLM helpers.
- `src/lib/inngest` — Inngest client, event names, function registry, cron schedule.
- `src/lib/onboarding` — signup pipeline that provisions a TC inbox.
- `src/lib/time` — Central Time clock, temporal-context strings used in LLM prompts.
- `src/lib/config` — env-variable access.
- `src/lib/domain` — shared domain types (no behavior).
- `src/app` — Next.js routes (signup form, dashboard, observability, transaction detail) and API routes (webhook, signup, inngest, approvals). See [src/app/README.md](../src/app/README.md).

## Where do I change X?

| Change | File |
| --- | --- |
| Decision prompt or schema (what the agent can do) | [src/lib/agent/decision.ts](../src/lib/agent/decision.ts) |
| Inbound event categories (`confirmation`, `document_received`, etc.) | [src/lib/agent/types.ts](../src/lib/agent/types.ts) + [src/lib/agent/decision.ts](../src/lib/agent/decision.ts) |
| Outbound email-writer prompt or rules | [src/lib/agent/response-writer.ts](../src/lib/agent/response-writer.ts) |
| Allow / require-approval / block rules | [src/lib/agent/policy.ts](../src/lib/agent/policy.ts) |
| Structured transaction write tools | [src/lib/transaction-writes/schemas.ts](../src/lib/transaction-writes/schemas.ts) + [src/lib/transaction-writes/executor.ts](../src/lib/transaction-writes/executor.ts) |
| Approve-by-reply wording / behavior | [src/lib/approvals](../src/lib/approvals) |
| Transaction-matching scoring | [src/lib/agent/matching.ts](../src/lib/agent/matching.ts) |
| Whether contract opens a new transaction or updates one | [src/lib/workflow/contract-routing.ts](../src/lib/workflow/contract-routing.ts) |
| Steps inside the inbound pipeline | [src/lib/workflow/intake.ts](../src/lib/workflow/intake.ts) (read [docs/pipelines/intake.md](pipelines/intake.md) first) |
| Cron cadence for deadline monitoring | [src/lib/inngest/functions.ts](../src/lib/inngest/functions.ts) |
| What "at risk" / stale response means or escalation copy | [src/lib/workflow/deadline-monitor.ts](../src/lib/workflow/deadline-monitor.ts) + [src/lib/email/templates.ts](../src/lib/email/templates.ts) |
| Texas milestone definitions or due-date offsets | [src/lib/milestones/engine.ts](../src/lib/milestones/engine.ts) |
| Operational milestone/task metadata | [src/lib/milestones/engine.ts](../src/lib/milestones/engine.ts) + [src/lib/workflow/tasks.ts](../src/lib/workflow/tasks.ts) |
| Business-day / weekend / holiday math | [src/lib/milestones/date-rules.ts](../src/lib/milestones/date-rules.ts) |
| Contract facts schema (`ContractFacts`) | [src/lib/contracts/facts.ts](../src/lib/contracts/facts.ts) |
| Anthropic PDF extraction prompt | [src/lib/contracts/anthropic-extract.ts](../src/lib/contracts/anthropic-extract.ts) |
| Expected document checklist | [src/lib/contracts/checklist.ts](../src/lib/contracts/checklist.ts) |
| Validation thresholds for facts | [src/lib/contracts/validate.ts](../src/lib/contracts/validate.ts) |
| Document classification (`usable` / `unusable`) | [src/lib/agent/document-assessment.ts](../src/lib/agent/document-assessment.ts) |
| What gets stored on inbound attachments | [src/lib/documents/attachments.ts](../src/lib/documents/attachments.ts) |
| Signup flow (team, user, TC profile, AgentMail inbox) | [src/lib/onboarding/service.ts](../src/lib/onboarding/service.ts) |
| Add a new SQL repository function | [src/lib/db/repositories.ts](../src/lib/db/repositories.ts) (read [src/lib/db/README.md](../src/lib/db/README.md) for the aggregate map) |
| Add a new database table | New migration in `migrations/` + a function in `repositories.ts` |
| Activity event types / statuses / sources | [src/lib/agent/activity.ts](../src/lib/agent/activity.ts) |
| Dashboard panels | [src/app/dashboard/[teamId]/page.tsx](../src/app/dashboard/%5BteamId%5D/page.tsx) |
| Observability stream UI | [src/app/observability/[teamId]/page.tsx](../src/app/observability/%5BteamId%5D/page.tsx) + [src/app/components/activity-debugger.tsx](../src/app/components/activity-debugger.tsx) |
| Transaction detail page | [src/app/transactions/[transactionId]/page.tsx](../src/app/transactions/%5BtransactionId%5D/page.tsx) |
| Webhook signature verification | [src/app/api/webhooks/agentmail/route.ts](../src/app/api/webhooks/agentmail/route.ts) |
| Anthropic model choice | [src/lib/llm/anthropic.ts](../src/lib/llm/anthropic.ts) |
| Add an environment variable | [src/lib/config/env.ts](../src/lib/config/env.ts) + [README.md](../README.md) |

## Things that look like duplicates but are not

- **`src/lib/contracts/extract.ts` vs `src/lib/contracts/anthropic-extract.ts`** — the first is a regex-only fallback used when the LLM path is not available; the second is the live Anthropic PDF path. Both produce a `ContractFacts`.
- **`src/lib/agent/activity.ts` vs `src/lib/agent/activity-timeline.ts`** — the first defines real activity events; the second synthesizes legacy events (from messages, documents, decisions, approvals, audit) so older transactions still render a timeline.
- **`src/lib/agent/decision.ts` (LLM call) vs `src/lib/agent/executor.ts` (acts on the decision)** — they always run as a pair but own different concerns: pick the action vs perform it.
- **`src/lib/agent/executor.ts` vs `src/lib/transaction-writes/executor.ts`** — the first handles email/approval execution; the second applies structured state changes.
