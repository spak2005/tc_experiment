import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDiagnosticsBundle } from "../bundle";
import { parseDiagnosticsDepth } from "../depth";
import type { DiagnosticsDepth } from "../types";
import {
  findActivityRunOwner,
  findUserByEmail
} from "@/lib/db/repositories";

export interface DebugRunCliArgs {
  activityRunId?: string;
  depth: DiagnosticsDepth;
  help: boolean;
  out?: string;
  userEmail?: string;
}

export function parseDebugRunArgs(argv: string[]): DebugRunCliArgs {
  const args: DebugRunCliArgs = {
    depth: "summary",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--activity-run-id" && next) {
      args.activityRunId = next;
      index += 1;
    } else if (arg === "--depth" && next) {
      args.depth = parseDiagnosticsDepth(next);
      index += 1;
    } else if (arg === "--user-email" && next) {
      args.userEmail = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (!arg.startsWith("-") && !args.activityRunId) {
      args.activityRunId = arg;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

async function loadDotEnvFile(filePath: string) {
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

function helpText() {
  return `Export an agent diagnostics bundle.

Usage:
  npm run debug:run -- --activity-run-id <run-id> [--depth summary|standard|raw]

Options:
  --activity-run-id ID   Required activity run id
  --depth DEPTH          summary, standard, or raw. Defaults to summary
  --user-email EMAIL     Optional user ownership assertion
  --out PATH             Optional output path. Defaults to stdout
  --help                 Show this help
`;
}

async function resolveUserId(args: DebugRunCliArgs) {
  if (args.userEmail) {
    const user = await findUserByEmail(args.userEmail);
    if (!user) {
      throw new Error(`No user found for email ${args.userEmail}.`);
    }
    return user.id;
  }

  if (!args.activityRunId) {
    throw new Error("--activity-run-id is required.");
  }

  const userId = await findActivityRunOwner(args.activityRunId);
  if (!userId) {
    throw new Error(`No activity run found for ${args.activityRunId}.`);
  }
  return userId;
}

export async function runDebugRunCli(argv = process.argv.slice(2)) {
  const args = parseDebugRunArgs(argv);
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  if (!args.activityRunId) {
    throw new Error("--activity-run-id is required.");
  }

  await loadEnv();
  const userId = await resolveUserId(args);
  const bundle = await getDiagnosticsBundle({
    activityRunId: args.activityRunId,
    userId,
    depth: args.depth
  });

  if (!bundle) {
    throw new Error(`Activity run ${args.activityRunId} was not found for the resolved user.`);
  }

  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  if (args.out) {
    const outputPath = path.resolve(args.out);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json);
    process.stdout.write(`Wrote diagnostics bundle to ${outputPath}\n`);
    return;
  }

  process.stdout.write(json);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDebugRunCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

