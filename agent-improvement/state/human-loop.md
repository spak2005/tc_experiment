# Human Review Loop

Codex should stay autonomous when the next step is clear, testable, and safely
inside the repo. Codex should pause for Israel when judgment, taste, outside
access, or repeated failure matters.

## Pause For Israel

- Product taste: wording, tone, or TC judgment has multiple plausible good
  answers.
- Better idea needed: Codex sees the gap but is unsure which approach fits the
  product.
- Outside logs needed: Vercel, Neon, AgentMail, Gmail, or another service has
  evidence Codex cannot access.
- Repeated failed attempts: two fix-rerun cycles miss the same bar.
- Human confirmation: a decision is high-impact or would shape future behavior.

## Do Not Pause

- The case passes the rubric. Record `no_gap` and stop.
- The fix is narrow, local, and covered by a targeted test.
- The missing information is discoverable from repo state or diagnostics.

## Status Page Rule

`status.html` is a generated reader view. The source of truth is structured
state in `agent-improvement/state`. Acknowledged or answered items stay in the
state archive but disappear from the active status page.
