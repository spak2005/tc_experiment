# TC Experiment

Autonomous AI transaction coordinator prototype for Texas residential resale
transactions.

## Product Flow

1. A realtor signs up with name, email, phone, brokerage, and Texas market.
2. The app provisions a named AgentMail inbox for their TC.
3. The realtor forwards an executed contract to that TC email.
4. AgentMail posts the inbound email webhook to the app.
5. Inngest processes the email, stores attachments, extracts contract facts,
   validates the file, generates milestones, creates tasks, and sends the
   realtor an intake confirmation.
6. Scheduled deadline monitoring checks open milestones and escalates to the
   realtor when a deadline is approaching.

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
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development

```bash
npm install
npm run dev
```

Apply `migrations/001_initial_schema.sql` to Postgres before using signup or
webhook flows.
