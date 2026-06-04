# Anthropic PDF Files API Experiment

Disposable runner for testing Anthropic's full-PDF Files API path outside
Stephanie.

## Run

From the repo root:

```bash
node experiments/anthropic-pdf-file-test/run.mjs \
  --pdf "/Users/israelogbonna/Downloads/100 Pecanwood S Receipted Contract Package - Henry & Mary Kokoszka - 3.11.26.pdf"
```

The script loads `.env.local` and `.env` if present. It uses `LLM_API_KEY`
first, then `ANTHROPIC_API_KEY`.

## Outputs

Each run writes files under:

```text
experiments/anthropic-pdf-file-test/output/
```

- `*.raw.txt`: Claude's raw text response.
- `*.json`: parsed JSON extraction.
- `*.metadata.json`: file id, usage, stop reason, and timings.

By default the uploaded Anthropic file is deleted after the request. Add
`--keep-file` if you want to inspect the uploaded file metadata later.

## Iterating Prompt

Create a prompt file and pass it with `--prompt`:

```bash
node experiments/anthropic-pdf-file-test/run.mjs \
  --pdf "/path/to/contract.pdf" \
  --prompt experiments/anthropic-pdf-file-test/my-prompt.txt
```

Useful knobs:

```bash
--model claude-sonnet-4-6
--max-tokens 16000
--timeout-ms 300000
--keep-file
```
