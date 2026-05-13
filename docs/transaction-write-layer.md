# Transaction Write Layer

The transaction write layer is the only path the agent should use to mutate a
transaction file after it has interpreted an inbound email or document.

The LLM proposes structured `transactionWrites`. TypeScript validates those
writes, applies safe changes through repository functions, and records every
result in both `transaction_change_events` and `agent_activity_events`.

## Write Tools

- `updateTransactionCore`: updates core transaction fields such as status,
  phase, risk, side, address, Effective Date, and Closing Date.
- `upsertTransactionFact`: updates canonical living facts in
  `transaction_facts`.
- `upsertParties`: inserts or updates buyers, sellers, agents, title, lender,
  and other known parties.
- `upsertMilestones`: creates, updates, reschedules, or completes milestones.
- `updateTasks`: creates or updates task status, owner, and due date.
- `updateDocuments`: updates tracked document status and type.
- `upsertBlocker`: creates, updates, or resolves blockers.
- `appendTransactionMemory`: appends deal notes, open questions, and known
  context without deleting prior memory.

## Safety Rules

Routine factual updates can auto-apply when they are schema-valid, tied to a
confident transaction, sourced from email/contract/system context, and do not
conflict with stronger existing facts.

High-impact changes require approval or confirmation instead of immediate
mutation. Examples include terminating or closing a file, conflicting with a
higher-confidence canonical fact, or implying legal advice or changed contract
terms.

Blocked writes include invalid schemas, unsupported tools, missing transaction
identity, unknown targets, and raw SQL-like attempts.

## Source And Audit

Every write includes:

- `sourceType`
- `sourceReference`
- `confidence`
- optional `rationale`

Every attempted write returns a structured result and creates a change event
with old value, new value, approval status, source, confidence, and the agent
decision id when available.

`extracted_contract_facts` remains an immutable extraction snapshot. The living
transaction file is represented by `transactions`, `parties`, `milestones`,
`tasks`, `documents`, `blockers`, `transaction_memory`, and canonical
`transaction_facts`.
