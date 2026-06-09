import { pathToFileURL } from "node:url";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { createHumanReviewItem } from "../state";
import { renderHumanStatusHtml } from "../status-page";

export async function runAskHumanCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { item } = await createHumanReviewItem({
    type: stringArg(args, "type", true)!,
    title: stringArg(args, "title", true)!,
    body: stringArg(args, "body", true)!,
    caseId: stringArg(args, "case-id"),
    caseRunId: stringArg(args, "case-run-id")
  });
  const status = await renderHumanStatusHtml();

  process.stdout.write(`Created ${item.id}\n`);
  process.stdout.write(`Wrote ${status.outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAskHumanCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
