# `src/app` — Next.js routes

This folder is the Next.js App Router surface. Every backend caller and
every UI surface lives here.

## API routes

| Route | File | Calls |
| --- | --- | --- |
| `POST /api/signup` | [api/signup/route.ts](api/signup/route.ts) | Supabase Auth signup, then `onboardAgent` in [../lib/onboarding/service.ts](../lib/onboarding/service.ts) |
| `POST /api/login` | [api/login/route.ts](api/login/route.ts) | Supabase Auth email/password sign-in |
| `POST /api/logout` | [api/logout/route.ts](api/logout/route.ts) | Supabase Auth sign-out |
| `POST /api/webhooks/agentmail` | [api/webhooks/agentmail/route.ts](api/webhooks/agentmail/route.ts) | Svix verify, `recordWebhookEvent`, then `inngest.send` to `agentmail/inbound.received` |
| `GET/POST/PUT /api/inngest` | [api/inngest/route.ts](api/inngest/route.ts) | Mounts the Inngest functions in [../lib/inngest/functions.ts](../lib/inngest/functions.ts) |
| `POST /api/approvals/[approvalId]` | [api/approvals/[approvalId]/route.ts](api/approvals/%5BapprovalId%5D/route.ts) | `updateApprovalStatus`, then on approve shared approval-send execution |

## Page routes

| Route | File | Notes |
| --- | --- | --- |
| `GET /` | [page.tsx](page.tsx) + [signup-form.tsx](signup-form.tsx) | Marketing copy + signup form (client component) |
| `GET /signup` | [signup/page.tsx](signup/page.tsx) + [signup-form.tsx](signup-form.tsx) | Public account creation and Stephanie onboarding. |
| `GET /login` | [login/page.tsx](login/page.tsx) + [login/login-form.tsx](login/login-form.tsx) | Public login page. |
| `GET /dashboard` | [dashboard/page.tsx](dashboard/page.tsx) | Protected server component; calls `getDashboardSnapshotForUser`. Shows Stephanie, Transactions, Blockers, Approvals. |
| `GET /observability` | [observability/page.tsx](observability/page.tsx) | Protected server component; calls `getUserActivityTimeline`. Internal/dev surface, not customer product. |
| `GET /transactions/[transactionId]` | [transactions/[transactionId]/page.tsx](transactions/%5BtransactionId%5D/page.tsx) | Protected server component; calls `getTransactionDetailForUser`. |

## Shared bits

- [layout.tsx](layout.tsx) — root layout (loads `globals.css`).
- [globals.css](globals.css) — all styles. Contains the dashboard,
  signup, and activity-debugger CSS in one file (~445 lines).
- [components/activity-debugger.tsx](components/activity-debugger.tsx) —
  shared renderer used by both the observability page and the
  transaction detail page. The observability contract is documented in
  [../../docs/activity-debugger.md](../../docs/activity-debugger.md).
- [../lib/auth/current-user.ts](../lib/auth/current-user.ts) — maps the
  Supabase Auth session to the local realtor row.
- [../lib/supabase](../lib/supabase) — Supabase SSR client helpers and
  session refresh proxy support.

## Common changes

| Change | File |
| --- | --- |
| Add a new API route | New folder under `api/` with a `route.ts` |
| Add a new page | New folder under `src/app` with a `page.tsx` |
| Change dashboard panels | [dashboard/page.tsx](dashboard/page.tsx) + maybe `getDashboardSnapshotForUser` in [../lib/db/repositories.ts](../lib/db/repositories.ts) |
| Change observability rendering | [components/activity-debugger.tsx](components/activity-debugger.tsx) |
| Change signup UI | [signup-form.tsx](signup-form.tsx) |
| Change styles | [globals.css](globals.css) |

## What lives elsewhere

- The Inngest worker behavior that the webhook triggers:
  [../lib/workflow/intake.ts](../lib/workflow/intake.ts).
- The Inngest function registry (cron, event bindings):
  [../lib/inngest/functions.ts](../lib/inngest/functions.ts).
- Approval execution detail (email sending, reply interpretation,
  activity events) lives in [../lib/approvals](../lib/approvals) and
  [../lib/agentmail/service.ts](../lib/agentmail/service.ts).
