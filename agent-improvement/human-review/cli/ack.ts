import { pathToFileURL } from "node:url";
import { parseFlagArgs, stringArg } from "@improvement/loop/cli/args";
import { acknowledgeHumanReviewItem } from "../state";
import { renderHumanStatusHtml } from "../status-page";

export async function runAckHumanCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { item } = await acknowledgeHumanReviewItem({
    itemId: stringArg(args, "item-id", true)!
  });
  const status = await renderHumanStatusHtml();

  process.stdout.write(`Acknowledged ${item.id}\n`);
  process.stdout.write(`Wrote ${status.outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAckHumanCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
