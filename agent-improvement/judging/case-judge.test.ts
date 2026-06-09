import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImprovementCase, requiredStateFiles } from "@improvement/loop/state";
import { judgeImprovementCase } from "./case-judge";

const mocks = vi.hoisted(() => ({
  resolveDiagnosticsRun: vi.fn(),
  getDiagnosticsBundle: vi.fn(),
  judgeRubric: vi.fn()
}));

vi.mock("@improvement/diagnostics/resolve", () => ({
  resolveDiagnosticsRun: mocks.resolveDiagnosticsRun
}));

vi.mock("@improvement/diagnostics/bundle", () => ({
  getDiagnosticsBundle: mocks.getDiagnosticsBundle
}));

vi.mock("./rubric", () => ({
  judgeRubric: mocks.judgeRubric
}));

async function tempRepo() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "steph-case-judge-"));
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

describe("judgeImprovementCase human review integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveDiagnosticsRun.mockResolvedValue({
      activityRunId: "run-1",
      userId: "user-1",
      source: "case-run-id"
    });
    mocks.getDiagnosticsBundle.mockResolvedValue({
      schemaVersion: "agent-diagnostics.v1",
      generatedAt: "2026-06-09T12:00:00.000Z",
      request: {
        activityRunId: "run-1",
        userId: "user-1",
        depth: "standard"
      },
      run: {
        id: "run-1",
        userId: "user-1",
        workflowType: "inbound_email",
        title: "Inbound email",
        summary: "",
        status: "completed",
        metadata: {},
        startedAt: "2026-06-09T12:00:00.000Z"
      },
      trigger: {
        kind: "inbound_email",
        label: "Inbound email",
        workflowType: "inbound_email",
        identifiers: {},
        details: {}
      },
      events: [],
      relatedRecords: {
        transactions: [{ id: "tx-1" }],
        agentDecisions: [{ id: "decision-1" }],
        outboundEmailActions: []
      },
      externalRefs: {}
    });
  });

  it("creates a visible human review item when rubric judging is uncertain", async () => {
    const cwd = await tempRepo();
    await createImprovementCase({
      cwd,
      caseId: "CASE-001",
      title: "Initial intake",
      failureType: "product_behavior",
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
    manifest.runs = [
      {
        caseRunId: "case-run-1",
        status: "observed",
        createdAt: "2026-06-09T12:01:00.000Z",
        updatedAt: "2026-06-09T12:01:00.000Z"
      }
    ];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    mocks.judgeRubric.mockResolvedValue({
      status: "needs_human_review",
      summary: "Need Israel's taste on whether this email is warm enough.",
      misses: ["taste"]
    });

    const result = await judgeImprovementCase({
      cwd,
      caseId: "CASE-001",
      caseRunId: "case-run-1",
      replyText: "Hi, I opened the file."
    });

    expect(result.status).toBe("needs_human_review");
    expect(result.humanReviewItemId).toBeTruthy();
    const reviewState = JSON.parse(
      await readFile(
        path.join(cwd, "agent-improvement", "state", "human-review.json"),
        "utf8"
      )
    );
    expect(reviewState.items[0]).toMatchObject({
      status: "open",
      caseId: "CASE-001",
      caseRunId: "case-run-1"
    });
    expect(
      await readFile(path.join(cwd, "agent-improvement", "state", "status.html"), "utf8")
    ).toContain("Need Israel&#039;s taste");
  });
});
