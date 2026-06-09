import { pathToFileURL } from "node:url";
import { getDiagnosticsBundle } from "../bundle";
import { resolveDiagnosticsRun } from "../resolve";
import { formatDiagnosticsTimeline } from "../timeline";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { loadEnv } from "./env";

export async function runDebugTimelineCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  await loadEnv();
  const resolved = await resolveDiagnosticsRun({
    activityRunId: stringArg(args, "activity-run-id"),
    caseRunId: stringArg(args, "case-run-id")
  });
  if (!resolved) throw new Error("Activity run not found.");

  const bundle = await getDiagnosticsBundle({
    activityRunId: resolved.activityRunId,
    userId: resolved.userId,
    depth: "summary"
  });
  if (!bundle) throw new Error("Diagnostics bundle not found.");

  process.stdout.write(formatDiagnosticsTimeline(bundle));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDebugTimelineCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
