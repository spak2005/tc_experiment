# Diagnostics

Diagnostics bundles are generated views over existing observability records.
They do not duplicate activity data into a second store.

Depths:

- `summary`: compact default for first-pass debugging.
- `standard`: adds related transaction records.
- `raw`: includes stored raw JSON fields and email/action bodies.

Local usage:

```bash
npm run debug:run -- --activity-run-id <run-id>
npm run debug:run -- --activity-run-id <run-id> --depth standard
npm run debug:run -- --activity-run-id <run-id> --depth raw --out diagnostics/run.json
```

The default `summary` depth is the right first request for Codex context. Use
`raw` only after the compact bundle shows that deeper payloads are needed.
