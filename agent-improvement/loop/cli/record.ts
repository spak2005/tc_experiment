import { pathToFileURL } from "node:url";
import { improvementCaseStatuses } from "../case-manifest";
import { recordImprovementResult } from "../state";
import { parseFlagArgs, stringArg } from "./args";

function parseStatus(value?: string) {
  if (!value) return undefined;
  if (improvementCaseStatuses.includes(value as (typeof improvementCaseStatuses)[number])) {
    return value as (typeof improvementCaseStatuses)[number];
  }
  throw new Error(`Invalid status: ${value}`);
}

export async function runImproveRecordCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { manifest, logPath } = await recordImprovementResult({
    caseId: stringArg(args, "case-id"),
    result: stringArg(args, "result", true)!,
    tests: stringArg(args, "tests", true)!,
    next: stringArg(args, "next", true)!,
    status: parseStatus(stringArg(args, "status"))
  });

  process.stdout.write(`Recorded ${manifest.caseId} as ${manifest.status}\n`);
  process.stdout.write(`${logPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runImproveRecordCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
