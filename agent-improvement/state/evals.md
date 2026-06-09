# Stephanie Evals

This scorecard tracks durable cases that should keep passing.

| Eval | Purpose | Command | Current Result |
| --- | --- | --- | --- |
| diagnostics-bundle | Diagnostics stays compact by default and raw only on request | `npm test -- agent-improvement/diagnostics` | Existing |
| improvement-harness-state | Improvement state and case helpers behave predictably | `npm test -- agent-improvement` | Pending |

## Promotion Rule

Promote a case into this file when it caused a fix or protects a behavior that
must not regress. If a case passes and reveals no gap, record it in the run log
without adding a new regression burden.
