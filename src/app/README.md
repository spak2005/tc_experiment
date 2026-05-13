# `src/app` — Next.js routes

This folder is the Next.js App Router surface. Every backend caller and
every UI surface lives here.

## API routes

| Route | File | Calls |
| --- | --- | --- |
| `POST /api/signup` | [api/signup/route.ts](api/signup/route.ts) | `onboardAgent` in [../lib/onboarding/service.ts](../lib/onboarding/service.ts) |
| `POST /api/webhooks/agentmail` | [api/webhooks/agentmail/route.ts](api/webhooks/agentmail/route.ts) | Svix verify, `recordWebhookEvent`, then `inngest.send` to `agentmail/inbound.received` |
| `GET/POST/PUT /api/inngest` | [api/inngest/route.ts](api/inngest/route.ts) | Mounts the Inngest functions in [../lib/inngest/functions.ts](../lib/inngest/functions.ts) |
| `POST /api/approvals/[approvalId]` | [api/approvals/[approvalId]/route.ts](api/approvals/%5BapprovalId%5D/route.ts) | `updateApprovalStatus`, then on approve `sendTcEmail` and an `approved_email_sent` activity event |

## Page routes

| Route | File | Notes |
| --- | --- | --- |
| `GET /` | [page.tsx](page.tsx) + [signup-form.tsx](signup-form.tsx) | Marketing copy + signup form (client component) |
| `GET /dashboard/[teamId]` | [dashboard/[teamId]/page.tsx](dashboard/%5BteamId%5D/page.tsx) | Server component; calls `getDashboardSnapshot`. Shows Transactions, Blockers, Approvals. |
| `GET /observability/[teamId]` | [observability/[teamId]/page.tsx](observability/%5BteamId%5D/page.tsx) | Server component; calls `getTeamActivityTimeline`. Renders [components/activity-debugger.tsx](components/activity-debugger.tsx) team-wide. Internal/dev surface, not customer product. |
| `GET /transactions/[transactionId]` | [transactions/[transactionId]/page.tsx](transactions/%5BtransactionId%5D/page.tsx) | Server component; calls `getTransactionDetail`. Renders the activity debugger filtered to one transaction plus milestone, task, document, message, facts, and audit panels. |

## Shared bits

- [layout.tsx](layout.tsx) — root layout (loads `globals.css`).
- [globals.css](globals.css) — all styles. Contains the dashboard,
  signup, and activity-debugger CSS in one file (~445 lines).
- [components/activity-debugger.tsx](components/activity-debugger.tsx) —
  shared renderer used by both the observability page and the
  transaction detail page. The observability contract is documented in
  [../../docs/activity-debugger.md](../../docs/activity-debugger.md).

## Common changes

| Change | File |
| --- | --- |
| Add a new API route | New folder under `api/` with a `route.ts` |
| Add a new page | New folder under `src/app` with a `page.tsx` |
| Change dashboard panels | [dashboard/[teamId]/page.tsx](dashboard/%5BteamId%5D/page.tsx) + maybe `getDashboardSnapshot` in [../lib/db/repositories.ts](../lib/db/repositories.ts) |
| Change observability rendering | [components/activity-debugger.tsx](components/activity-debugger.tsx) |
| Change signup UI | [signup-form.tsx](signup-form.tsx) |
| Change styles | [globals.css](globals.css) |

## What lives elsewhere

- The Inngest worker behavior that the webhook triggers:
  [../lib/workflow/intake.ts](../lib/workflow/intake.ts).
- The Inngest function registry (cron, event bindings):
  [../lib/inngest/functions.ts](../lib/inngest/functions.ts).
- Approval execution detail (email sending, activity events) is
  handled inside the route file itself plus
  [../lib/agentmail/service.ts](../lib/agentmail/service.ts).
