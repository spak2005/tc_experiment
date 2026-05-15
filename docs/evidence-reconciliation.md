# Evidence Reconciliation

Evidence reconciliation closes the loop between inbound evidence and the
transaction file. It runs before agent decisioning so routine confirmations and
documents update tasks, milestones, documents, blockers, memory, and phase
before the agent decides what to do next.

## Inputs

The reconciler accepts a transaction context and one trigger:

- `inbound_email` — email text, sender, thread, and stored attachments.
- `document_stored` — stored document details plus email context.
- `heartbeat` — no new evidence; recompute phase from current state.

The trigger is normalized into evidence items such as:

- `party_confirmation`
- `document_received`
- `contact_update`
- `negative_or_blocker`

## Document Classification

Stored attachments are first checked with deterministic filename, MIME type,
expected-document names, and email context. Ambiguous documents can use an LLM
classifier. Classifications are stored in `documents.metadata.classification`.
High-confidence matches update the expected document row to `received` while
keeping the raw stored attachment row linked by metadata.

## Completion Resolver

The resolver reads task and milestone metadata such as `completionSignals` and
`expectedEvidence`. Routine high-confidence evidence can:

- mark tasks `complete` or `received`,
- set milestone `completedAt`,
- mark expected documents `received`,
- resolve linked blockers,
- append a transaction-memory note,
- advance transaction phase to the earliest open milestone phase.

It does not auto-close/terminate files, accept amendments, waive deadlines, or
change contract terms.

## Observability

The reconciler emits activity events for start, document classification,
matched evidence, skipped evidence, applied writes, and phase advancement.
