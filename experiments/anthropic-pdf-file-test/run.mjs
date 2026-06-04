#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import { File } from "node:buffer";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const filesBeta = ["files-api-2025-04-14"];
const defaultModel = "claude-sonnet-4-6";
const defaultMaxTokens = 12000;
const defaultTimeoutMs = 240000;

const defaultPrompt = `You are reading a Texas residential real estate contract package.

Read the entire PDF using both page images and any text layer. Pay special attention to filled blanks, handwriting, stamped receipts, checked boxes, signature dates, addenda, and title/escrow receipt pages.

Extract the real deal facts. Do not rely on generic TREC template text when a filled value is visible elsewhere.
Use ISO YYYY-MM-DD for dates when the date is clear. Preserve exact money values with currency symbols. If an email, phone number, handwriting, or checkbox mark is not fully legible, lower confidence and set needsConfirmation true.

Return only valid JSON in this shape:
{
  "summary": "one sentence",
  "requiredFacts": {
    "propertyAddress": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "buyerNames": {"value": string[]|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "sellerNames": {"value": string[]|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "salesPrice": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "cashOrFinanced": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "earnestMoneyAmount": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "optionFeeAmount": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "optionPeriodDays": {"value": number|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "titleCompany": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "escrowOfficer": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "effectiveDate": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean},
    "closingDate": {"value": string|null, "confidence": number, "page": string, "evidence": string, "needsConfirmation": boolean}
  },
  "contacts": [{"role": string, "name": string|null, "email": string|null, "phone": string|null, "organization": string|null, "page": string, "confidence": number}],
  "checkedBoxesAndSelections": [{"field": string, "selection": string, "page": string, "evidence": string, "confidence": number}],
  "timelineInputs": [{"name": string, "value": string|null, "page": string, "evidence": string, "confidence": number, "needsConfirmation": boolean}],
  "missingOrAmbiguous": [{"field": string, "reason": string, "page": string|null}],
  "warnings": string[]
}`;

function parseArgs(argv) {
  const args = {
    cleanup: true,
    maxTokens: defaultMaxTokens,
    model: process.env.ANTHROPIC_MODEL ?? defaultModel,
    outputDir: "experiments/anthropic-pdf-file-test/output",
    timeoutMs: defaultTimeoutMs
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--pdf" && next) {
      args.pdf = next;
      index += 1;
    } else if (arg === "--prompt" && next) {
      args.promptPath = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === "--model" && next) {
      args.model = next;
      index += 1;
    } else if (arg === "--max-tokens" && next) {
      args.maxTokens = Number(next);
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      args.timeoutMs = Number(next);
      index += 1;
    } else if (arg === "--keep-file") {
      args.cleanup = false;
    } else if (!arg.startsWith("-") && !args.pdf) {
      args.pdf = arg;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

async function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const body = await readFile(filePath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function loadEnv() {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");
}

function printHelp() {
  console.log(`Anthropic PDF Files API experiment

Usage:
  node experiments/anthropic-pdf-file-test/run.mjs --pdf /path/to/contract.pdf

Options:
  --pdf PATH          PDF to upload and analyze
  --prompt PATH       Optional prompt file to use instead of the default
  --out DIR           Output directory, default experiments/anthropic-pdf-file-test/output
  --model MODEL       Anthropic model, default ANTHROPIC_MODEL or ${defaultModel}
  --max-tokens N      Max output tokens, default ${defaultMaxTokens}
  --timeout-ms N      Message request timeout, default ${defaultTimeoutMs}
  --keep-file         Do not delete the uploaded Anthropic file after the run

Environment:
  LLM_API_KEY or ANTHROPIC_API_KEY must be set. .env.local and .env are loaded if present.
`);
}

function getFirstText(content) {
  const block = content.find((item) => item.type === "text");
  if (!block?.text) {
    throw new Error("Anthropic response did not include a text block.");
  }
  return block.text;
}

function extractJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found.");
    return JSON.parse(text.slice(start, end + 1));
  }
}

function safeOutputName(pdfPath) {
  return path
    .basename(pdfPath, path.extname(pdfPath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.pdf) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  await loadEnv();

  const apiKey = process.env.LLM_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing LLM_API_KEY or ANTHROPIC_API_KEY.");
  }

  const pdfPath = path.resolve(args.pdf);
  const pdfBytes = await readFile(pdfPath);
  const prompt = args.promptPath
    ? await readFile(path.resolve(args.promptPath), "utf8")
    : defaultPrompt;
  const client = new Anthropic({ apiKey });

  await mkdir(args.outputDir, { recursive: true });
  const runId = `${safeOutputName(pdfPath)}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const rawPath = path.join(args.outputDir, `${runId}.raw.txt`);
  const jsonPath = path.join(args.outputDir, `${runId}.json`);
  const metadataPath = path.join(args.outputDir, `${runId}.metadata.json`);

  const startedAt = performance.now();
  console.log(`Uploading ${path.basename(pdfPath)} (${pdfBytes.byteLength} bytes)...`);
  const uploadStartedAt = performance.now();
  const uploadedFile = await client.beta.files.upload(
    {
      file: new File([new Uint8Array(pdfBytes)], path.basename(pdfPath), {
        type: "application/pdf"
      }),
      betas: filesBeta
    },
    {
      maxRetries: 0,
      timeout: 60000
    }
  );
  const uploadMs = Math.round(performance.now() - uploadStartedAt);
  console.log(`Uploaded file_id=${uploadedFile.id} in ${uploadMs}ms`);

  let cleanupError;
  try {
    const messageStartedAt = performance.now();
    const response = await client.beta.messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens,
        temperature: 0,
        system:
          "You are an expert transaction coordinator extracting facts from real estate contract PDFs. Return JSON only.",
        betas: filesBeta,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                title: path.basename(pdfPath),
                source: {
                  type: "file",
                  file_id: uploadedFile.id
                },
                cache_control: {
                  type: "ephemeral"
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      },
      {
        maxRetries: 0,
        timeout: args.timeoutMs
      }
    );
    const messageMs = Math.round(performance.now() - messageStartedAt);
    const rawText = getFirstText(response.content);
    const parsed = extractJsonObject(rawText);
    const totalMs = Math.round(performance.now() - startedAt);

    await writeFile(rawPath, rawText);
    await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
    await writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          model: args.model,
          pdfPath,
          pdfBytes: pdfBytes.byteLength,
          uploadedFile,
          timingsMs: {
            upload: uploadMs,
            message: messageMs,
            total: totalMs
          },
          usage: response.usage,
          stopReason: response.stop_reason,
          output: {
            rawPath,
            jsonPath,
            metadataPath
          }
        },
        null,
        2
      )}\n`
    );

    console.log(`Claude finished in ${messageMs}ms; total ${totalMs}ms`);
    console.log(`Stop reason: ${response.stop_reason}`);
    console.log(`Usage: ${JSON.stringify(response.usage)}`);
    console.log(`Raw response: ${rawPath}`);
    console.log(`Parsed JSON:  ${jsonPath}`);
    console.log(`Metadata:     ${metadataPath}`);
  } finally {
    if (args.cleanup) {
      try {
        await client.beta.files.delete(uploadedFile.id, { betas: filesBeta });
        console.log(`Deleted uploaded file ${uploadedFile.id}`);
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (cleanupError) {
    console.warn(
      `Could not delete uploaded file: ${
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      }`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
