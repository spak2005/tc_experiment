# TC Experiment

Autonomous AI transaction coordinator prototype for Texas residential resale
transactions.

## Product Flow

1. A realtor signs up with name, email, phone, brokerage, and Texas market.
2. The app provisions a named AgentMail inbox for their TC.
3. The realtor forwards an executed contract to that TC email.
4. AgentMail posts the inbound email webhook to the app.
5. Inngest processes the email, stores attachments, extracts the coordination
   payload (facts, contacts, checklist), generates operational milestones and
   tasks, and asks/sends/approval-gates the next response.
6. Scheduled monitoring checks upcoming deadlines and stale response tasks,
   then escalates to the realtor when something is at risk.

## Services

- Vercel hosts the Next.js app, API routes, webhooks, and UI.
- Inngest runs durable background workers and scheduled monitoring.
- Neon Postgres stores structured transaction state.
- Vercel Blob stores private transaction documents.
- AgentMail provides the TC inbox, inbound email, outbound email, drafts,
  attachments, and threading.

## Environment

```bash
AGENTMAIL_API_KEY=
AGENTMAIL_WEBHOOK_SECRET=
AGENTMAIL_DOMAIN=tc.example.com
BLOB_READ_WRITE_TOKEN=
DATABASE_URL=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
LLM_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development

```bash
npm install
npm run dev
```

Apply migrations in numeric order before using signup or webhook flows.

## Where to make changes

If you (or a coding agent) need to change behavior, start with these docs
instead of scanning the whole codebase:

- [AGENTS.md](AGENTS.md) — system spine, entry points, mermaid of the
  inbound pipeline. Read this first.
- [docs/architecture.md](docs/architecture.md) — active vs stable
  module map and a "where do I change X?" cheat sheet.
- [docs/pipelines/intake.md](docs/pipelines/intake.md) — step-by-step of
  the main inbound-email worker [src/lib/workflow/intake.ts](src/lib/workflow/intake.ts)
  without loading the whole file.
- [docs/pipelines/deadline-monitor.md](docs/pipelines/deadline-monitor.md) —
  step-by-step of the 30-minute cron in
  [src/lib/workflow/deadline-monitor.ts](src/lib/workflow/deadline-monitor.ts).
- [docs/activity-debugger.md](docs/activity-debugger.md) — the
  observability contract (statuses, sources, logging rules) used by
  `/observability/[teamId]` and `/transactions/[transactionId]`.
- [docs/transaction-write-layer.md](docs/transaction-write-layer.md) —
  structured write tools for transaction state.
- [docs/v1-coordination-plan.md](docs/v1-coordination-plan.md) — concise
  product loop for operational intake and monitoring.

Per-subsystem READMEs:

- [src/lib/agent/README.md](src/lib/agent/README.md) — the 8-step
  decision pipeline (context, matching, document assessment, decision,
  policy, executor, response writer, activity).
- [src/lib/workflow/README.md](src/lib/workflow/README.md) —
  orchestrators (intake, deadline/stale monitor, contract routing, status
  responder, tasks).
- [src/lib/db/README.md](src/lib/db/README.md) — Postgres data layer
  with an aggregate map for [src/lib/db/repositories.ts](src/lib/db/repositories.ts).
- [src/lib/agentmail/README.md](src/lib/agentmail/README.md) —
  AgentMail inbound normalization, outbound send/reply, inbox
  provisioning.
- [src/app/README.md](src/app/README.md) — API routes, page routes,
  and the activity-debugger component.

Cursor users: two always-apply rules in `.cursor/rules/` surface this
map automatically in every chat:

- `.cursor/rules/codebase-map.mdc` — read AGENTS.md first, then the
  relevant README, then the file.
- `.cursor/rules/active-surfaces.mdc` — the short list of files most
  changes touch.
