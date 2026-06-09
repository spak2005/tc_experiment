import { pathToFileURL } from "node:url";
import { getDiagnosticsBundle } from "../bundle";
import { parseDiagnosticsDepth } from "../depth";
import { eventDrilldown } from "../timeline";
import { findActivityEventDiagnosticsTarget } from "@/lib/db/repositories";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { loadEnv } from "./env";

export async function runDebugEventCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const eventId = stringArg(args, "event-id", true)!;
  const depth = parseDiagnosticsDepth(stringArg(args, "depth"));

  await loadEnv();
  const target = await findActivityEventDiagnosticsTarget(eventId);
  if (!target?.activity_run_id) {
    throw new Error(`No activity run found for event ${eventId}.`);
  }

  const bundle = await getDiagnosticsBundle({
    activityRunId: target.activity_run_id,
    userId: target.user_id,
    depth
  });
  if (!bundle) throw new Error("Diagnostics bundle not found.");

  const drilldown = eventDrilldown(bundle, eventId);
  if (!drilldown) throw new Error(`Event ${eventId} not found in bundle.`);
  process.stdout.write(`${JSON.stringify(drilldown, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDebugEventCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
