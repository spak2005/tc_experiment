import { describe, expect, it } from "vitest";
import { parseImprovementCaseManifest } from "./case-manifest";

describe("improvement case manifest", () => {
  it("parses a valid case manifest", () => {
    expect(
      parseImprovementCaseManifest({
        schemaVersion: "steph-improvement-case.v1",
        caseId: "CASE-001",
        title: "Contract intake quality",
        failureType: "product_behavior",
        rubricId: "initial-contract-intake",
        status: "planned",
        stimulus: {
          description: "Forward an executed contract.",
          fixturePaths: []
        },
        expectedBehavior: "Stephanie opens a transaction map.",
        runs: [],
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z"
      })
    ).toMatchObject({
      caseId: "CASE-001",
      failureType: "product_behavior"
    });
  });

  it("accepts no_gap as a first-class outcome", () => {
    const parsed = parseImprovementCaseManifest({
      schemaVersion: "steph-improvement-case.v1",
      caseId: "CASE-002",
      title: "Passing case",
      failureType: "no_gap",
      rubricId: "initial-contract-intake",
      status: "no_gap",
      stimulus: {
        description: "Send a test contract.",
        fixturePaths: []
      },
      expectedBehavior: "Stephanie meets the rubric.",
      latestJudgment: {
        status: "pass",
        summary: "No implementation change needed.",
        judgedAt: "2026-06-09T00:01:00.000Z"
      },
      runs: [],
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:01:00.000Z"
    });

    expect(parsed.status).toBe("no_gap");
    expect(parsed.latestJudgment?.status).toBe("pass");
  });

  it("rejects invalid failure types", () => {
    expect(() =>
      parseImprovementCaseManifest({
        schemaVersion: "steph-improvement-case.v1",
        caseId: "CASE-003",
        title: "Bad case",
        failureType: "always_patch",
        rubricId: "initial-contract-intake",
        status: "planned",
        stimulus: {
          description: "",
          fixturePaths: []
        },
        expectedBehavior: "",
        runs: [],
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z"
      })
    ).toThrow();
  });
});
