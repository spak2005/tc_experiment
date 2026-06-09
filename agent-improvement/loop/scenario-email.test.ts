import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { prepareScenarioEmail } from "./scenario-email";
import { createImprovementCase, requiredStateFiles } from "./state";

async function tempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "steph-scenario-"));
  for (const file of requiredStateFiles) {
    const fullPath = path.join(cwd, "agent-improvement", "state", file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `# ${path.basename(file)}\n`);
  }
  return cwd;
}

describe("scenario email prep", () => {
  it("prepares a Gmail payload and records a case run", async () => {
    const cwd = await tempRepo();
    const fixturePath = path.join(
      "agent-improvement",
      "private-fixtures",
      "contract.pdf"
    );
    await mkdir(path.dirname(path.join(cwd, fixturePath)), { recursive: true });
    await writeFile(path.join(cwd, fixturePath), "pdf");
    await createImprovementCase({
      cwd,
      caseId: "CASE-001",
      title: "Initial intake",
      failureType: "product_behavior",
      stimulus: "Please open this contract.",
      fixturePaths: [fixturePath],
      now: new Date("2026-06-09T12:00:00.000Z")
    });

    const payload = await prepareScenarioEmail({
      cwd,
      caseId: "CASE-001",
      env: {
        STEPH_STAGING_INBOX: "stephanie-staging@example.com"
      } as NodeJS.ProcessEnv,
      now: new Date("2026-06-09T12:05:00.000Z")
    });

    expect(payload.gmail.to).toBe("stephanie-staging@example.com");
    expect(payload.gmail.subject).toContain("[STEPH-CASE:CASE-001-RUN-");
    expect(payload.gmail.body).toContain("Please open this contract.");
    expect(payload.gmail.attachment_files).toBe(path.join(cwd, fixturePath));

    const manifest = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "cases", "CASE-001.json"),
        "utf8"
      )
    );
    expect(manifest.status).toBe("running");
    expect(manifest.runs[0]).toMatchObject({
      status: "planned"
    });
  });

  it("requires a staging recipient", async () => {
    const cwd = await tempRepo();
    await createImprovementCase({
      cwd,
      caseId: "CASE-002",
      title: "No inbox",
      failureType: "product_behavior"
    });

    await expect(
      prepareScenarioEmail({
        cwd,
        caseId: "CASE-002",
        env: {} as NodeJS.ProcessEnv
      })
    ).rejects.toThrow("STEPH_STAGING_INBOX");
  });
});
