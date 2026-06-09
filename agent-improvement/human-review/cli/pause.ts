import { pathToFileURL } from "node:url";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { createHumanReviewItem } from "../state";
import { renderHumanStatusHtml } from "../status-page";

export async function runPauseHumanCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { item } = await createHumanReviewItem({
    type: stringArg(args, "type") ?? "blocked_request",
    title: stringArg(args, "title") ?? "Codex paused",
    body: stringArg(args, "reason", true)!,
    caseId: stringArg(args, "case-id"),
    caseRunId: stringArg(args, "case-run-id")
  });
  const status = await renderHumanStatusHtml();

  process.stdout.write(`Paused with ${item.id}\n`);
  process.stdout.write(`Wrote ${status.outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPauseHumanCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
