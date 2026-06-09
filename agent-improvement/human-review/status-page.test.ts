import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createImprovementCase, requiredStateFiles } from "@improvement/loop/state";
import {
  acknowledgeHumanReviewItem,
  createHumanReviewItem
} from "./state";
import { renderHumanStatusHtml } from "./status-page";

async function tempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "steph-status-page-"));
  for (const file of requiredStateFiles) {
    const fullPath = path.join(cwd, "agent-improvement", "state", file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, `# ${path.basename(file)}\n`);
  }
  await writeFile(
    path.join(cwd, "agent-improvement", "state", "human-review.json"),
    JSON.stringify({ schemaVersion: "steph-human-review.v1", items: [] })
  );
  return cwd;
}

describe("human status page", () => {
  it("shows active items and hides acknowledged items", async () => {
    const cwd = await tempRepo();
    await createHumanReviewItem({
      cwd,
      id: "HR-open",
      type: "question",
      title: "Need your idea",
      body: "Which title follow-up should Stephanie send?",
      now: new Date("2026-06-09T12:00:00.000Z")
    });
    await createHumanReviewItem({
      cwd,
      id: "HR-ack",
      type: "decision",
      title: "Use warmer opener",
      body: "Codex chose a warmer opener.",
      now: new Date("2026-06-09T12:01:00.000Z")
    });
    await acknowledgeHumanReviewItem({
      cwd,
      itemId: "HR-ack",
      now: new Date("2026-06-09T12:02:00.000Z")
    });

    const { html, outputPath, activeCount, archivedCount } =
      await renderHumanStatusHtml({
        cwd,
        generatedAt: new Date("2026-06-09T12:03:00.000Z")
      });

    expect(activeCount).toBe(1);
    expect(archivedCount).toBe(1);
    expect(html).toContain("Need your idea");
    expect(html).not.toContain("Use warmer opener");
    expect(await readFile(outputPath, "utf8")).toBe(html);
  });

  it("summarizes the current case and pass decision", async () => {
    const cwd = await tempRepo();
    await createImprovementCase({
      cwd,
      caseId: "CASE-001",
      title: "Initial intake",
      failureType: "no_gap",
      expectedBehavior: "Stephanie meets the rubric.",
      now: new Date("2026-06-09T12:00:00.000Z")
    });
    const manifestPath = path.join(
      cwd,
      "agent-improvement",
      "state",
      "cases",
      "CASE-001.json"
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.latestJudgment = {
      status: "pass",
      summary: "Stephanie met the quality bar. No change needed.",
      judgedAt: "2026-06-09T12:04:00.000Z"
    };
    manifest.runs = [
      {
        caseRunId: "CASE-001-RUN-1",
        status: "judged",
        result: "Passed cleanly.",
        createdAt: "2026-06-09T12:01:00.000Z",
        updatedAt: "2026-06-09T12:04:00.000Z"
      }
    ];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const { html } = await renderHumanStatusHtml({ cwd });

    expect(html).toContain("CASE-001");
    expect(html).toContain("No Change Needed");
    expect(html).toContain("Passed cleanly.");
  });
});
