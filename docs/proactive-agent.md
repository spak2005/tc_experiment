# Proactive Agent Loop

The proactive loop turns the TC agent from an inbound-only responder into a
transaction coordinator that can start work, wait for responses, and review
active files on a schedule.

## Model

Future work is stored as rows in `agent_wakeups`. A single static Inngest cron
runs every 10 minutes, claims due wakeups, and executes them. The agent never
creates infrastructure cron jobs for individual tasks.

Wakeups are used for three kinds of work:

- `transaction_dispatch` starts newly-created opening or milestone tasks.
- `transaction_heartbeat` reviews an active transaction and chooses the next
  useful action.
- `task_follow_up` resumes a specific task after a response window.

## Safety

Realtor-only emails may be sent automatically when policy allows. Emails to
title, lender, HOA, the opposite agent, or any other external party remain
approval-gated. Approved external sends reuse the existing approval executor so
the linked task can transition to `waiting_response`.

The proactive planner should choose one primary action per wakeup. This keeps
auditing readable and prevents bursts of outbound email.

## Heartbeats

The heartbeat cadence is adaptive:

- Default active transaction: 24 hours.
- Opening file phase: 12 hours.
- Milestone due within 72 hours or urgent blocker: 4 hours.
- Milestone due within 24 hours or critical blocker: 1 hour.
- Closed or terminated transactions: cancel pending heartbeats.

## Observability

Wakeups emit activity events when they are scheduled, claimed, completed,
skipped, failed, rescheduled, or cancelled. These events are visible through the
existing observability and transaction-detail timelines.
