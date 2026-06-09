import { pathToFileURL } from "node:url";
import { renderHumanStatusHtml } from "../status-page";

export async function runImproveStatusCli() {
  const result = await renderHumanStatusHtml();
  process.stdout.write(`Wrote ${result.outputPath}\n`);
  process.stdout.write(
    `${result.activeCount} active item(s), ${result.archivedCount} archived item(s)\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runImproveStatusCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
