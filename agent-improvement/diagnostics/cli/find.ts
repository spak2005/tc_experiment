import { pathToFileURL } from "node:url";
import { findActivityRunByImprovementCaseRunId } from "@/lib/db/repositories";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { loadEnv } from "./env";

export async function runDebugFindCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const caseRunId = stringArg(args, "case-run-id", true)!;

  await loadEnv();
  const run = await findActivityRunByImprovementCaseRunId(caseRunId);
  if (!run) {
    throw new Error(`No activity run found for case run ${caseRunId}.`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        caseRunId,
        activityRunId: run.id,
        userId: run.user_id,
        workflowType: run.workflow_type,
        title: run.title,
        status: run.status,
        startedAt: run.started_at
      },
      null,
      2
    )}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDebugFindCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
