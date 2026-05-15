# Agent Reliability Invariants

The TC agent is allowed to retry inbound emails, proactive wakeups, and
deadline checks. Retrying must not duplicate real-world actions.

## Stable Keys

Every durable real-world action needs a stable idempotency key:

- Contract-created transaction: `transactions.intake_source_key`.
- Inbound attachment document: `documents.source_attachment_key`, built from
  inbox id, message id, and attachment id.
- Agent decision for one event: `agent_decisions.idempotency_key`.
- Approval draft for one decision/action: `approvals.idempotency_key`.
- Outbound email or reply: `outbound_email_actions.idempotency_key`.
- Deadline/stale blocker: one open blocker per `deadline_id` or `task_id`.

Activity and audit rows are debug history. They may remain append-only during
retries unless they cause an external action or corrupt transaction state.

## Email Sends

Use `sendTcEmailOnce` and `replyTcEmailOnce` for workflow sends. The raw
`sendTcEmail` and `replyTcEmail` helpers should only be used when a caller
has its own idempotency guard.

The email action ledger is inline, not a background outbox worker. If a send is
already recorded as `sent`, retrying reuses the recorded provider metadata
instead of calling AgentMail again.

## Blockers

Deadline and stale-response monitors send the escalation first, then create or
reuse the open blocker. If AgentMail fails, no blocker is created, so a later
monitor run can retry the escalation.
