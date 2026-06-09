import { pathToFileURL } from "node:url";
import { prepareScenarioEmail } from "../scenario-email";
import { parseFlagArgs, stringArg } from "./args";

export async function runPrepareEmailCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const payload = await prepareScenarioEmail({
    caseId: stringArg(args, "case-id", true)!,
    to: stringArg(args, "to")
  });

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPrepareEmailCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
