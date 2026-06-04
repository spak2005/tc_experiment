# Agent Improvement

This directory contains tooling for the improvement cycle around Stephanie and
future agents. It is intentionally separate from the main runtime agent code.

The first capability is diagnostics: Codex-readable JSON bundles assembled from
the same database records that power human observability. The diagnostics flow
starts compact, then allows deeper raw context when needed.

Current workflow:

1. Start with a `summary` diagnostics bundle for the activity run.
2. Request `standard` depth if the surrounding transaction state matters.
3. Request `raw` depth only when stored payloads, tool results, or email/action
   bodies are needed to diagnose the issue.

Future improvement-loop pieces, such as human corrections and eval snapshots,
should live here too unless they are thin app integration points.

Portable skill:

- `skills/agent-improvement-harness/` teaches future agents how to use this
  improvement loop and diagnostics harness.
