import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadEnv } from "@improvement/diagnostics/cli/env";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { judgeImprovementCase } from "../case-judge";

export async function runImproveJudgeCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  await loadEnv();
  const replyFile = stringArg(args, "reply-file");
  const result = await judgeImprovementCase({
    caseId: stringArg(args, "case-id", true)!,
    caseRunId: stringArg(args, "case-run-id", true)!,
    replyText: replyFile ? await readFile(replyFile, "utf8") : stringArg(args, "reply")
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runImproveJudgeCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
