# AGENTS.md

Start here when you need to understand or change this codebase. Read this
file first, then the README of the subsystem you are touching, then the
specific code file. Do not try to scan the whole codebase to "understand
everything" before you change anything.

## What this is

`tc-experiment` is an autonomous AI Transaction Coordinator (TC) prototype
for Texas residential resale real estate. A realtor signs up, the app
provisions a named AgentMail inbox for their TC, the realtor forwards an
executed contract PDF to that inbox, and the system opens a transaction
file, extracts a coordination payload (facts, contacts, checklist),
generates operational milestones/tasks, drafts and sends or approval-gates
emails, and escalates deadline or stale-response risk back to the realtor.

## System spine

The inbound-email pipeline is the spine of the system. Almost every change
either touches this pipeline directly or one of the modules that feeds it.

```mermaid
flowchart TD
  Realtor[Realtor forwards executed contract] --> AgentMail[AgentMail inbox]
  AgentMail -->|webhook| WebhookRoute["POST /api/webhooks/agentmail"]
  WebhookRoute -->|enqueue| InngestEvent["Inngest event<br/>agentmail/inbound.received"]
  InngestEvent --> Intake["processAgentMailInbound<br/>src/lib/workflow/intake.ts"]
  Intake --> Match["Match inbound to transaction<br/>src/lib/agent/matching.ts"]
  Intake --> Assess["Assess contract PDF<br/>src/lib/agent/document-assessment.ts"]
  Intake --> Persist["Save facts, contacts, checklist,<br/>milestones, tasks<br/>src/lib/db/repositories.ts"]
  Intake --> Decide["Decide next action<br/>src/lib/agent/decision.ts"]
  Decide --> Policy["Evaluate policy<br/>src/lib/agent/policy.ts"]
  Policy --> Execute["Execute decision<br/>src/lib/agent/executor.ts"]
  Execute --> Writes["Apply transaction writes<br/>src/lib/transaction-writes/executor.ts"]
  Execute --> Outbound["Send email / approval / blocker<br/>src/lib/agentmail/service.ts"]
  RealtorReply["Realtor replies send/edit/hold"] --> Approval["src/lib/approvals"]
  Cron["Inngest cron */30 * * * *"] --> Deadline["checkDeadlineRisk<br/>deadline + stale response<br/>src/lib/workflow/deadline-monitor.ts"]
  Deadline --> Outbound
```

## Entry points

| Trigger | Route or schedule | First code file to read |
| --- | --- | --- |
| Inbound email from AgentMail | `POST /api/webhooks/agentmail` | [src/app/api/webhooks/agentmail/route.ts](src/app/api/webhooks/agentmail/route.ts) |
| Inngest worker that processes that email | event `agentmail/inbound.received` | [src/lib/inngest/functions.ts](src/lib/inngest/functions.ts), then [src/lib/workflow/intake.ts](src/lib/workflow/intake.ts) |
| Deadline/stale-response cron | `*/30 * * * *` | [src/lib/inngest/functions.ts](src/lib/inngest/functions.ts), then [src/lib/workflow/deadline-monitor.ts](src/lib/workflow/deadline-monitor.ts) |
| Realtor signup | `POST /api/signup` | [src/app/api/signup/route.ts](src/app/api/signup/route.ts), then [src/lib/onboarding/service.ts](src/lib/onboarding/service.ts) |
| Realtor approves or rejects a draft | `POST /api/approvals/[approvalId]` | [src/app/api/approvals/[approvalId]/route.ts](src/app/api/approvals/[approvalId]/route.ts) |
| Realtor dashboard | `GET /dashboard/[teamId]` | [src/app/dashboard/[teamId]/page.tsx](src/app/dashboard/[teamId]/page.tsx) |
| Internal observability stream | `GET /observability/[teamId]` | [src/app/observability/[teamId]/page.tsx](src/app/observability/[teamId]/page.tsx) |
| Per-transaction debug view | `GET /transactions/[transactionId]` | [src/app/transactions/[transactionId]/page.tsx](src/app/transactions/[transactionId]/page.tsx) |

## Navigation rule

When you start a task, do this in order:

1. Read this file.
2. Read the README of the subsystem you are touching:
   - [src/lib/agent/README.md](src/lib/agent/README.md) for the decision pipeline.
   - [src/lib/workflow/README.md](src/lib/workflow/README.md) for orchestrators (intake, deadline/stale monitor, contract routing, status responder, tasks).
   - [src/lib/db/README.md](src/lib/db/README.md) for the Postgres data layer.
   - [src/lib/agentmail/README.md](src/lib/agentmail/README.md) for AgentMail inbound / outbound.
   - [src/app/README.md](src/app/README.md) for routes and pages.
3. If your change is inside one of the two long pipeline files, read its
   step-by-step doc first instead of the whole file:
   - [docs/pipelines/intake.md](docs/pipelines/intake.md) for [src/lib/workflow/intake.ts](src/lib/workflow/intake.ts).
   - [docs/pipelines/deadline-monitor.md](docs/pipelines/deadline-monitor.md) for [src/lib/workflow/deadline-monitor.ts](src/lib/workflow/deadline-monitor.ts).
4. For higher-level questions, see [docs/architecture.md](docs/architecture.md). It tags every module as "active" or "stable" and has a "where do I change X?" cheat sheet.

Do not grep-scan the whole repository to "understand everything." The
codebase is still small, but `repositories.ts` and `intake.ts` account
for a large fraction of total length and will burn your context budget if
you read them end-to-end. Jump to the relevant section using the README /
pipeline doc instead.

## Other docs worth knowing

- [docs/activity-debugger.md](docs/activity-debugger.md) explains the
  agent observability surfaces and how activity events are written. The
  `lib/agent/activity*.ts` files are observability only and are
  separate from the decision pipeline.
- [docs/transaction-write-layer.md](docs/transaction-write-layer.md)
  explains the structured write layer the agent uses to mutate the
  transaction file.
- [docs/v1-coordination-plan.md](docs/v1-coordination-plan.md) captures
  the current V1 product loop: operational intake, event updates, and
  stale-response monitoring.
- [README.md](README.md) explains how to install and run locally and the
  required environment variables.
