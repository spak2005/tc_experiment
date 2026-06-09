# Failure Taxonomy

Use one primary failure type per case.

| Type | Meaning |
| --- | --- |
| `instrumentation` | The trace does not expose enough evidence to diagnose the behavior. |
| `ingestion_extraction` | Attachment, PDF, OCR, extraction, schema, or validation failed. |
| `matching_routing` | Stephanie picked the wrong transaction or failed to create/update the right one. |
| `decision_policy` | Intent, action, approval gating, safety, or rationale was wrong. |
| `execution_write` | Writes, tasks, milestones, approvals, emails, wakeups, or blockers did not match the decision. |
| `product_behavior` | The code worked as designed, but the behavior is below a strong human TC bar. |
| `no_gap` | Stephanie met the rubric; no implementation change is needed. |

When the type is `no_gap`, record the pass and stop.
