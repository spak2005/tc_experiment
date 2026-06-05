# Agent Posture And Market Expansion

This note captures an architectural issue we intend to address after the
Texas-only V1 is working reliably. It is not a request to remove the current
Texas workflow today.

## The Problem

Stephanie currently behaves partly like an agent and partly like a deterministic
Texas transaction workflow. In the current intake path, the system can extract a
usable contract, create or update a transaction, generate Texas milestones,
generate tasks, prepare a calendar feed, and schedule proactive work before the
agent has made a broad operational judgment about the situation.

That sequencing can create the wrong posture. For example, an old or already
closed contract can be treated as a live transaction because the document is
valid and the deadline generator can calculate milestones from the extracted
dates. Downstream systems then behave consistently with the bad posture:
heartbeats run, deadline monitoring escalates, and emails go out.

The specific old-contract failure is only one symptom. The larger issue is that
Stephanie is not always asked to orient first, like a strong human transaction
coordinator would.

A human TC does not simply ask, "Can I calculate deadlines from this contract?"
They first ask:

- What did I just receive?
- Is this an active transaction, historical package, duplicate file, amendment,
  disclosure, FYI, status request, or ambiguous item?
- What stage is this file really in?
- Does the email ask me to coordinate, archive, update, clarify, or ignore?
- What facts are known, uncertain, stale, or risky relative to today?
- What should I do before creating urgency?

Stephanie needs that same operating posture.

## Why This Matters Beyond One Bug

If we fix each observed failure with a narrow deterministic rule, the system
will become harder to reason about and harder to expand. Each new edge case
would add another special branch: old contracts, future contracts, amended
contracts, duplicate files, terminated deals, out-of-state documents, partial
packages, and "for your records" emails.

That moves the product away from the reason to build an AI coordinator in the
first place.

The goal is not to avoid deterministic code. The goal is to put deterministic
code in the right place. Date math, idempotency, schema validation, email send
ledgers, business-day calculations, and jurisdiction-specific deadline helpers
should remain deterministic tools. But the judgment of what situation Stephanie
is looking at should happen before those tools create live operational work.

## Texas V1 Is Still Acceptable

For the next phase, Stephanie can remain Texas-only. Texas-specific extraction,
TREC-focused prompts, Texas milestone generation, and Texas operating tasks are
acceptable while we prove the core product loop.

The concern is not that Texas logic exists. The concern is that Texas logic is
currently too close to the center of the agent's judgment. A future general TC
should have a universal coordination posture with Texas as one market adapter,
not a Texas workflow engine with an LLM attached.

## Desired Future Shape

The future architecture should move toward this sequence:

```text
Inbound email or document
  -> Extract facts and evidence
  -> Add market/form-specific enrichment when available
  -> Build an orientation packet
  -> Ask Stephanie for operational posture and next intent
  -> Execute selected tools with policy, approval, and idempotency
```

Instead of the current tendency:

```text
Inbound email or document
  -> Texas contract assessment
  -> Create/update active transaction state
  -> Generate Texas milestones and tasks
  -> Schedule proactive work
  -> Ask Stephanie what to do next
```

The future orientation step should let Stephanie decide whether the inbound is
active coordination work before the system creates active tasks, wakeups,
deadline alerts, or external communication.

The output does not need to overfit every possible scenario, but it should force
the right professional question:

```json
{
  "situation": "Plain-English summary of what Stephanie thinks this is.",
  "operationalPosture": "active | informational | historical | ambiguous | blocked | noise",
  "shouldOpenActiveFile": true,
  "shouldStartCoordination": true,
  "nextAction": "The next operational move.",
  "rationale": "Why this is the right posture and action."
}
```

The exact schema can change. The important feature is that Stephanie orients
before operational machinery runs.

## Concrete Refactor Direction

The first implementation should split "we received a package" from "we opened a
live transaction file." Inbound packages should be stored as intake artifacts
first, then Stephanie should decide whether they become active coordination
work.

The intended sequence is:

1. Store the inbound email/package as an intake artifact.
2. Extract facts and build deterministic signals, including temporal signals.
3. Ask Stephanie for an intake orientation before transaction creation.
4. Create/update a transaction only for active coordination.
5. Generate milestones, tasks, calendar feeds, wakeups, and alerts only after
   active orientation.
6. For historical, informational, ambiguous, blocked, or noise inbounds, reply
   to the realtor without creating a transaction file.

This preserves auditability without letting every valid-looking contract become
live operational work.

Transactions should also carry an explicit coordination gate so downstream
automation can distinguish "stored/known" from "safe to coordinate." Deadline
monitoring, stale-response checks, and proactive heartbeats should ignore any
transaction where coordination is disabled.

## Market Expansion Implication

A good transaction coordinator can work across markets because the fundamentals
are similar:

- identify parties and contacts,
- understand the property and file identity,
- track dates and obligations,
- request missing information,
- coordinate documents,
- draft and route communication,
- notice risk,
- escalate appropriately,
- avoid legal advice.

Different states and forms add context, terminology, deadline conventions, and
regulatory details. They should inform the agent, not replace the agent's
coordination judgment.

In a future multi-market system, Texas, California, and other markets should
look like adapters:

- extraction hints,
- known form types,
- deadline conventions,
- required or common documents,
- market-specific checklist templates,
- regulatory cautions.

Stephanie should still own the general TC posture:

"What am I looking at, what does it mean operationally, and what should I do
next?"

## Design Principle

Deterministic systems should provide tools and guardrails. Stephanie should
provide operating judgment.

When we revisit this, the core refactor should not be "add a rule for old
contracts." It should be "move operational orientation before active
coordination state is created."
