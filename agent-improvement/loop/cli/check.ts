import { pathToFileURL } from "node:url";
import { checkImprovementState } from "../state";
import { parseFlagArgs } from "./args";

export async function runImproveCheckCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const result = await checkImprovementState({ live: args.live === true });

  if (result.branch) {
    process.stdout.write(`Branch: ${result.branch}\n`);
  }
  for (const warning of result.warnings) {
    process.stdout.write(`Warning: ${warning}\n`);
  }
  if (!result.ok) {
    for (const error of result.errors) {
      process.stderr.write(`Error: ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Improvement state is ready.\n\n");
  process.stdout.write(result.currentLoop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runImproveCheckCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
