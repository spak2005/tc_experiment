# Diagnostics

Diagnostics bundles are generated views over existing observability records.
They do not duplicate activity data into a second store.

Depths:

- `summary`: compact default for first-pass debugging.
- `standard`: adds related transaction records.
- `raw`: includes stored raw JSON fields and email/action bodies.

