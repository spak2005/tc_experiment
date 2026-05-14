# V1 Coordination Plan

The next product slice should make the transaction file operational, not
just descriptive. Contract intake should create a living deal file with
contacts, expected documents, milestones, tasks, missing items, and clear
next actions. Later emails and attachments should update that file instead
of becoming isolated messages.

## Product Loop

1. Open the transaction file as soon as a usable or partially usable
   contract arrives.
2. Extract the coordination payload: deal facts, contacts, operational
   terms, required documents, and missing items.
3. Generate milestones and tasks that know their owner, expected evidence,
   completion signals, stale window, and escalation path.
4. Classify later inbound emails as confirmations, documents, questions,
   blockers, contact updates, deadline changes, or noise.
5. Apply structured transaction writes from those events.
6. Escalate upcoming deadlines and stale responses to the agent.

## Boundaries

- The AI tracks, routes, drafts, and escalates. It does not fill legal
  documents.
- External-party emails remain approval-gated.
- Realtor-facing escalations can be sent automatically.
- Approve-by-reply is already the approval path and should be preserved
  with regression coverage rather than redesigned.
