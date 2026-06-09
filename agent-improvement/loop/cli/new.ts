import { pathToFileURL } from "node:url";
import { createImprovementCase } from "../state";
import { parseFlagArgs, stringArg } from "./args";

function splitCsv(value?: string) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export async function runImproveNewCli(argv = process.argv.slice(2)) {
  const args = parseFlagArgs(argv);
  const { manifest, filePath } = await createImprovementCase({
    caseId: stringArg(args, "case-id"),
    title: stringArg(args, "title", true)!,
    failureType: stringArg(args, "failure-type", true)!,
    rubricId: stringArg(args, "rubric"),
    stimulus: stringArg(args, "stimulus"),
    expectedBehavior: stringArg(args, "expected"),
    fixturePaths: splitCsv(stringArg(args, "fixtures"))
  });

  process.stdout.write(`Created ${manifest.caseId}\n`);
  process.stdout.write(`${filePath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runImproveNewCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
