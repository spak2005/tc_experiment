# Agent Observability

Agent Observability is internal developer tooling for understanding and testing
the TC agent workflow. It is not meant to be customer-facing product UI.

Use `/observability/[teamId]` as the main place to watch the agent work. It
shows team-wide activity whether or not a transaction has been created yet.

Use `/transactions/[transactionId]` when you want the same debugger filtered to
one transaction file.

## How to read it

Open the observability page from the dashboard. The team-wide timeline runs
newest to oldest, so the latest agent behavior is always at the top.

Transaction detail pages keep the same newest-first ordering, filtered to one
file, so the latest agent movement is always at the top:

- email received
- transaction matched or opened
- attachments fetched and stored
- contract extraction and validation
- milestones and tasks generated
- evidence reconciliation and document classification
- transaction memory refreshed
- agent intent/action selected
- policy evaluated
- email sent, approval requested, blocker created, or escalation sent

In observability, cards with a transaction show a link to the transaction page.
Cards without a transaction are still useful: they show inbox-level behavior,
matching attempts, ignored messages, status questions, and clarification replies
before a file exists.

Each card has a plain-language title and summary. Badges show source and status.
Metadata chips show useful debug facts such as confidence, filename, recipient,
policy result, or count.

Use the Debug metadata toggle when you need raw payloads, tool results, or
derived legacy data.

## Statuses

- `received`: an inbound item entered the system
- `started`: processing began
- `completed`: the step finished successfully
- `waiting`: the agent needs more information or human approval
- `blocked`: policy, missing data, or validation prevented progress
- `failed`: a step failed and the debugger should make that visible
- `sent`: an outbound email or escalation was sent
- `ignored`: the system intentionally skipped the event

## Where events are written

New events are stored in `agent_activity_events`.

Use `createAgentActivityEvent` for new instrumentation. Prefer small, concrete
events over vague batch events. A good event answers:

- What happened?
- Why does it matter for debugging?
- What transaction or decision is it tied to?
- What metadata will help confirm the workflow is correct?

The transaction page also renders synthetic history from existing messages,
documents, decisions, approvals, and audit events so older transactions still
show context.

The observability page reads real activity events by `team_id`, including rows
where `transaction_id` is null. That makes pre-file inbox behavior visible.

## Logging rules

- Log structured reasoning, not private chain-of-thought.
- Include decision rationale, confidence, policy result, evidence, and outcome.
- Do not store full document contents in activity metadata.
- For outbound emails, store recipients, subject, labels, and a short body
  preview only.
- Use clear event names such as `contract_extraction_started` or
  `approval_request_sent`.
- Link decision-related events with `agentDecisionId` whenever available.

Evidence reconciliation uses these event names:

- `evidence_reconciliation_started`
- `document_classified`
- `evidence_matched`
- `reconciliation_write_applied`
- `reconciliation_skipped`
- `phase_advanced`

Transaction memory refresh uses:

- `transaction_memory_refreshed`
