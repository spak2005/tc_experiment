# Prompt Notes

Track prompt-facing changes that affect Stephanie's behavior.

## Surfaces

- Intake orientation: `src/lib/agent/orientation.ts`
- Agent decisioning: `src/lib/agent/decision.ts`
- Response writing: `src/lib/agent/response-writer.ts`
- Proactive planning: `src/lib/agent/proactive-planner.ts`
- Memory refresh: `src/lib/workflow/memory-refresh.ts`

## Rule

Prompt edits should be tied to a case, rubric miss, or eval failure. Avoid
prompt churn when the observed behavior already meets the quality bar.
