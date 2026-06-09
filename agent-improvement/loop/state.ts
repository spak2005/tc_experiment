import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  improvementCaseManifestSchema,
  type ImprovementCaseManifest
} from "./case-manifest";
import {
  isImprovementFailureType,
  type ImprovementFailureType
} from "./failure-types";

export const requiredStateFiles = [
  "mission.md",
  "current-loop.md",
  "decisions.md",
  "experiments.md",
  "evals.md",
  "failure-taxonomy.md",
  "human-loop.md",
  "human-review.json",
  "prompts.md",
  "run-logs/README.md",
  "cases/README.md",
  "rubrics/initial-contract-intake.md"
];

export function stateRoot(cwd = process.cwd()) {
  return path.join(cwd, "agent-improvement", "state");
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

function dateStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function timeStamp(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createCaseId(title: string, now = new Date()) {
  const compact = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const slug = slugify(title) || "case";
  return `CASE-${compact}-${slug}`;
}

export function caseManifestPath(caseId: string, cwd = process.cwd()) {
  return path.join(stateRoot(cwd), "cases", `${caseId}.json`);
}

function getCurrentBranch(cwd: string) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

export async function checkImprovementState(input: {
  cwd?: string;
  live?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const root = stateRoot(cwd);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of requiredStateFiles) {
    const fullPath = path.join(root, file);
    if (!existsSync(fullPath)) {
      errors.push(`Missing ${path.relative(cwd, fullPath)}`);
    }
  }

  const branch = getCurrentBranch(cwd);
  if (!branch) {
    warnings.push("Could not determine git branch.");
  } else if (branch === "main" || branch === "master") {
    errors.push("Improvement work must run on a non-main branch.");
  }

  if (input.live) {
    if (env.STEPH_ENV !== "staging") {
      errors.push("Live improvement loops require STEPH_ENV=staging.");
    }
    if (!env.STEPH_STAGING_INBOX) {
      errors.push("Live improvement loops require STEPH_STAGING_INBOX.");
    }
    if (!env.IMPROVEMENT_EMAIL_SINK) {
      errors.push("Live improvement loops require IMPROVEMENT_EMAIL_SINK.");
    }
  }

  const currentLoopPath = path.join(root, "current-loop.md");
  const currentLoop = existsSync(currentLoopPath)
    ? await readFile(currentLoopPath, "utf8")
    : "";

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    branch,
    currentLoop
  };
}

export async function createImprovementCase(input: {
  cwd?: string;
  caseId?: string;
  title: string;
  failureType: string;
  rubricId?: string;
  stimulus?: string;
  expectedBehavior?: string;
  fixturePaths?: string[];
  now?: Date;
}) {
  if (!isImprovementFailureType(input.failureType)) {
    throw new Error(`Invalid failure type: ${input.failureType}`);
  }

  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const caseId = input.caseId ?? createCaseId(input.title, now);
  const createdAt = nowIso(now);
  const manifest: ImprovementCaseManifest = {
    schemaVersion: "steph-improvement-case.v1",
    caseId,
    title: input.title,
    failureType: input.failureType as ImprovementFailureType,
    rubricId: input.rubricId ?? "initial-contract-intake",
    status: "planned",
    stimulus: {
      description: input.stimulus ?? "",
      fixturePaths: input.fixturePaths ?? []
    },
    expectedBehavior: input.expectedBehavior ?? "",
    runs: [],
    createdAt,
    updatedAt: createdAt
  };
  const parsed = improvementCaseManifestSchema.parse(manifest);
  const filePath = caseManifestPath(caseId, cwd);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  await writeCurrentLoop({ cwd, manifest: parsed });

  return { manifest: parsed, filePath };
}

async function writeCurrentLoop(input: {
  cwd: string;
  manifest: ImprovementCaseManifest;
  nextStep?: string;
}) {
  const body = `# Current Loop

## Status

${input.manifest.status}

## Current Case

Case: ${input.manifest.caseId}

Title: ${input.manifest.title}

Failure type: ${input.manifest.failureType}

Rubric: ${input.manifest.rubricId}

## Goal

Compare Stephanie's actual behavior against the rubric and close only real gaps.

## Expected Behavior

${input.manifest.expectedBehavior || "TBD"}

## Success Criteria

- If Stephanie meets the rubric, record the pass and stop.
- If Stephanie misses the rubric, classify the gap before changing code.
- Any behavior fix includes a targeted test or eval.
- Every loop ends with a run-log entry and a clear next step.

## Next Step

${input.nextStep ?? "Run or prepare the case stimulus."}
`;

  await writeFile(path.join(stateRoot(input.cwd), "current-loop.md"), body);
}

export async function readImprovementCase(input: {
  cwd?: string;
  caseId: string;
}) {
  const cwd = input.cwd ?? process.cwd();
  const body = await readFile(caseManifestPath(input.caseId, cwd), "utf8");
  return improvementCaseManifestSchema.parse(JSON.parse(body));
}

async function inferCurrentCaseId(cwd: string) {
  const body = await readFile(path.join(stateRoot(cwd), "current-loop.md"), "utf8");
  const match = body.match(/^Case:\s*(\S+)/m);
  return match?.[1];
}

export async function recordImprovementResult(input: {
  cwd?: string;
  caseId?: string;
  result: string;
  tests: string;
  next: string;
  status?: ImprovementCaseManifest["status"];
  now?: Date;
}) {
  const cwd = input.cwd ?? process.cwd();
  const caseId = input.caseId ?? (await inferCurrentCaseId(cwd));
  if (!caseId) {
    throw new Error("No case id supplied and no current case found.");
  }

  const manifest = await readImprovementCase({ cwd, caseId });
  const updatedAt = nowIso(input.now ?? new Date());
  const status = input.status ?? manifest.status;
  const updated: ImprovementCaseManifest = {
    ...manifest,
    status,
    updatedAt
  };

  const parsed = improvementCaseManifestSchema.parse(updated);
  await writeFile(caseManifestPath(caseId, cwd), `${JSON.stringify(parsed, null, 2)}\n`);

  const logPath = path.join(
    stateRoot(cwd),
    "run-logs",
    `${dateStamp(input.now ?? new Date())}.md`
  );
  await mkdir(path.dirname(logPath), { recursive: true });
  const entry = `\n## ${timeStamp(input.now ?? new Date())} - ${caseId}\n\n- Status: ${status}\n- Result: ${input.result}\n- Tests: ${input.tests}\n- Next: ${input.next}\n`;
  const existing = existsSync(logPath) ? await readFile(logPath, "utf8") : `# Run log: ${dateStamp(input.now ?? new Date())}\n`;
  await writeFile(logPath, `${existing.trimEnd()}\n${entry}`);
  await writeCurrentLoop({ cwd, manifest: parsed, nextStep: input.next });

  return { manifest: parsed, logPath };
}
