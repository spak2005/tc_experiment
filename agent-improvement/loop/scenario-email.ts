import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { improvementCaseMarker } from "@/lib/improvement/case-marker";
import {
  caseManifestPath,
  readImprovementCase
} from "./state";
import { improvementCaseManifestSchema } from "./case-manifest";

function compactTimestamp(now = new Date()) {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export async function prepareScenarioEmail(input: {
  cwd?: string;
  caseId: string;
  to?: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const to = input.to ?? env.STEPH_STAGING_INBOX;
  if (!to) {
    throw new Error("Scenario email prep requires --to or STEPH_STAGING_INBOX.");
  }

  const manifest = await readImprovementCase({ cwd, caseId: input.caseId });
  const fixturePaths = manifest.stimulus.fixturePaths.map((fixturePath) => {
    return path.isAbsolute(fixturePath) ? fixturePath : path.join(cwd, fixturePath);
  });
  const missingFixture = fixturePaths.find((fixturePath) => {
    return !existsSync(fixturePath);
  });
  if (missingFixture) {
    throw new Error(`Fixture does not exist: ${missingFixture}`);
  }

  const now = input.now ?? new Date();
  const caseRunId = `${manifest.caseId}-RUN-${compactTimestamp(now)}`;
  const marker = improvementCaseMarker(caseRunId);
  const subject = manifest.stimulus.subject
    ? `${manifest.stimulus.subject} ${marker}`
    : `${manifest.title} ${marker}`;
  const body = [
    manifest.stimulus.body || manifest.stimulus.description || "Please process this staged case.",
    "",
    marker
  ].join("\n");

  const updated = improvementCaseManifestSchema.parse({
    ...manifest,
    status: "running",
    runs: [
      ...manifest.runs,
      {
        caseRunId,
        status: "planned",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ],
    updatedAt: now.toISOString()
  });
  await writeFile(
    caseManifestPath(manifest.caseId, cwd),
    `${JSON.stringify(updated, null, 2)}\n`
  );

  return {
    caseId: manifest.caseId,
    caseRunId,
    gmail: {
      to,
      subject,
      body,
      attachment_files: fixturePaths.join(",")
    }
  };
}
