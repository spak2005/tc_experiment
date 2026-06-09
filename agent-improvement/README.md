# Agent Improvement

This directory contains tooling for the improvement cycle around Stephanie and
future agents. It is intentionally separate from the main runtime agent code.

The core rule is: chat is temporary; repo state is truth. Codex should improve
Stephanie by measuring real or staged behavior against the human-TC quality bar,
then changing code only when there is a real gap.

## Persistent State

Read `state/` at the start of every Stephanie-improvement session:

- `mission.md` — stable improvement mission.
- `current-loop.md` — one active improvement loop.
- `decisions.md` — durable product/architecture decisions.
- `experiments.md` — hypotheses and outcomes.
- `evals.md` — regression scorecard.
- `failure-taxonomy.md` — failure categories.
- `rubrics/` — quality bars such as initial contract intake.
- `cases/` — machine-readable improvement case manifests.
- `run-logs/` — dated append-only work history.

If Stephanie meets the rubric, record `no_gap` and stop. Do not invent a patch.

## Autonomous Staging Loop

1. Create a branch: `git switch -c codex/steph-improve-<slug>`.
2. Check state: `npm run improve:check`.
3. Create/select a case: `npm run improve:new -- --title "..." --failure-type product_behavior`.
4. Prepare a staged QA Gmail payload:
   `npm run improve:prepare-email -- --case-id <case-id>`.
5. Send the payload with the dedicated QA Gmail connector.
6. Find and inspect Stephanie's run:
   `npm run debug:find -- --case-run-id <case-run-id>`,
   then `npm run debug:timeline -- --case-run-id <case-run-id>`.
7. Drill into one suspicious event only when needed:
   `npm run debug:event -- --event-id <event-id> --depth standard`.
8. Judge the run:
   `npm run improve:judge -- --case-id <case-id> --case-run-id <case-run-id>`.
9. If the case passes, record `no_gap`. If it fails, classify the gap, add or
   update a targeted test/eval, implement the smallest fix, rerun, and record.

## Diagnostics

Diagnostics bundles are generated from the same database records that power
human observability. Start compact:

```bash
npm run debug:run -- --activity-run-id <run-id>
npm run debug:timeline -- --case-run-id <case-run-id>
```

Escalate only when needed:

```bash
npm run debug:run -- --activity-run-id <run-id> --depth standard
npm run debug:event -- --event-id <event-id> --depth raw
```

Raw diagnostics are opt-in and should not be committed unless intentionally
creating a redacted eval snapshot.

## Staging Safety

Live loops require staging service configuration. In staging, non-allowlisted
outbound recipients are rewritten to `IMPROVEMENT_EMAIL_SINK` before AgentMail
sends and before the outbound ledger records the action.

Portable skill:

- `skills/agent-improvement-harness/` teaches future agents how to use this
  improvement loop and diagnostics harness.
