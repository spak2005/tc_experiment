import { pathToFileURL } from "node:url";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { answerHumanReviewItem } from "../state";
import { renderHumanStatusHtml } from "../status-page";

export async function runAnswerHumanCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { item } = await answerHumanReviewItem({
    itemId: stringArg(args, "item-id", true)!,
    answer: stringArg(args, "body", true)!
  });
  const status = await renderHumanStatusHtml();

  process.stdout.write(`Answered ${item.id}\n`);
  process.stdout.write(`Wrote ${status.outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAnswerHumanCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
