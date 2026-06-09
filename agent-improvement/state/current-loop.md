# Current Loop

## Status

fixed

## Current Case

Case: CASE-20260609T070431Z-kokoszka-receipted-contract-intake

Title: Kokoszka receipted contract intake

Failure type: product_behavior

Rubric: initial-contract-intake

## Goal

Compare Stephanie's actual behavior against the rubric and close only real gaps.

## Expected Behavior

Because the staged intake arrived on 2026-06-09 with contract dates that appear to close on 2026-04-01, Stephanie should preserve the intake artifact and avoid opening active coordination until the realtor confirms whether this is post-close, fell through, or contains a date/status error. The realtor-facing reply should still be warm and operationally precise: name the property, identify the apparent past-close posture, ask the realtor directly for the needed clarification, and avoid legal advice or unsafe external sends.

## Success Criteria

- If Stephanie meets the rubric, record the pass and stop.
- If Stephanie misses the rubric, classify the gap before changing code.
- Any behavior fix includes a targeted test or eval.
- Every loop ends with a run-log entry and a clear next step.

## Next Step

Deploy this branch before rerunning the staged Kokoszka case against the live worker.
