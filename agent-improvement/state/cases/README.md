# Improvement Cases

Cases are Codex-readable specs for testing Stephanie. A case can be manual,
synthetic, or staged through QA Gmail.

Required fields are enforced by the case manifest schema:

- Case id and title.
- Failure type.
- Rubric id.
- Stimulus description.
- Expected behavior.
- Fixture references.
- Run history.
- Latest judgment.

If the latest judgment passes, Codex should record the pass and avoid making a
code change.
