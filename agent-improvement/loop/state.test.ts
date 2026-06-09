import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkImprovementState,
  createImprovementCase,
  recordImprovementResult,
  requiredStateFiles
} from "./state";

async function tempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "steph-improvement-"));
  for (const file of requiredStateFiles) {
    const fullPath = path.join(cwd, "agent-improvement", "state", file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `# ${path.basename(file)}\n`);
  }
  return cwd;
}

describe("improvement state helpers", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await tempRepo();
  });

  it("validates the required state files", async () => {
    const result = await checkImprovementState({ cwd });

    expect(result.ok).toBe(true);
    expect(result.currentLoop).toContain("current-loop.md");
  });

  it("reports missing state files", async () => {
    const emptyCwd = await mkdtemp(path.join(os.tmpdir(), "steph-empty-"));
    const result = await checkImprovementState({ cwd: emptyCwd });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("mission.md"))).toBe(true);
  });

  it("creates a case and updates the current loop", async () => {
    const { manifest, filePath } = await createImprovementCase({
      cwd,
      caseId: "CASE-001",
      title: "Initial intake should be great",
      failureType: "product_behavior",
      expectedBehavior: "Stephanie sends a complete transaction map.",
      now: new Date("2026-06-09T12:00:00.000Z")
    });

    expect(manifest.caseId).toBe("CASE-001");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toMatchObject({
      title: "Initial intake should be great"
    });
    expect(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "current-loop.md"),
        "utf8"
      )
    ).toContain("Case: CASE-001");
  });

  it("records no_gap results without requiring a patch", async () => {
    await createImprovementCase({
      cwd,
      caseId: "CASE-002",
      title: "Passing intake",
      failureType: "no_gap",
      now: new Date("2026-06-09T12:00:00.000Z")
    });

    const { manifest, logPath } = await recordImprovementResult({
      cwd,
      result: "Stephanie met the rubric; no implementation change needed.",
      tests: "Live staging case only.",
      next: "Select a harder fixture.",
      status: "no_gap",
      now: new Date("2026-06-09T12:05:00.000Z")
    });

    expect(manifest.status).toBe("no_gap");
    expect(await readFile(logPath, "utf8")).toContain("no implementation change");
  });
});
