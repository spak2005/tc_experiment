# Transaction Memory

Transaction memory is the agent's concise operating memory for one deal.
It does not replace the transaction file. The structured transaction file
remains the source of truth for facts, parties, milestones, tasks,
documents, blockers, messages, decisions, and change events.

## Memory contract

The V1 memory layer uses the existing `transaction_memory` row:

| Column | Meaning |
| --- | --- |
| `summary` | The always-included deal brief. Rewrite this as the current operating posture of the deal, not as an append-only diary. |
| `open_questions` | Active unresolved questions and warnings that affect the next action. Remove resolved items. |
| `known_context` | Machine metadata about memory maintenance, such as the last refresh time/source. Do not rely on this for primary LLM narrative. |
| `last_inbound_at` | Last inbound-related memory update time. |

The deal brief should be short enough to include in every decision,
response-writing, and proactive-planning prompt. It should explain what
matters now, what is blocked or uncertain, what has already happened
that affects behavior, and what the agent must not assume.

## What belongs where

Use structured state for anything the system acts on:

- `transactions` / `transaction_facts` for canonical facts and dates.
- `parties` for contacts.
- `milestones` for deadlines.
- `tasks` for work state.
- `documents` for expected and received files.
- `blockers` for active risk.
- `transaction_change_events` for the audit trail of what changed and why.

Use transaction memory for concise posture:

- "Appraisal is at risk because access details are still missing."
- "Do not treat the reported five-day appraisal slip as an official
  deadline change until the realtor confirms."
- "Title has opened escrow; current focus is lender/appraisal follow-up."

Do not store full email history in memory. If email content matters later,
distill it into structured state, the deal brief, or an active warning.

## Refresh behavior

Memory is refreshed after meaningful transaction changes. The refresh
step should rewrite `summary` and `open_questions` from the current
transaction context. It should not append generic status notes.

Refresh rules:

- Keep the brief concise and operational.
- Preserve uncertainty explicitly.
- Remove resolved warnings and questions.
- Mention only context that should affect future behavior.
- Treat the structured transaction file as authoritative when memory and
  state disagree.

## Navigation

- Prompt-facing memory shape lives in `src/lib/agent/memory.ts`.
- Memory refresh orchestration lives in `src/lib/workflow/memory-refresh.ts`.
- SQL reads/writes live in `src/lib/db/repositories.ts`
  (`getTransactionContextData`, `upsertTransactionMemory`,
  `appendTransactionMemory`).
