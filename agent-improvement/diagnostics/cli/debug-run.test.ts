import { describe, expect, it } from "vitest";
import { parseDebugRunArgs } from "./debug-run";

describe("parseDebugRunArgs", () => {
  it("parses a run id and defaults to summary depth", () => {
    expect(parseDebugRunArgs(["--activity-run-id", "run-1"])).toMatchObject({
      activityRunId: "run-1",
      depth: "summary"
    });
  });

  it("parses depth, user email, and output path", () => {
    expect(
      parseDebugRunArgs([
        "--activity-run-id",
        "run-1",
        "--depth",
        "raw",
        "--user-email",
        "agent@example.com",
        "--out",
        "diagnostics/run.json"
      ])
    ).toMatchObject({
      activityRunId: "run-1",
      depth: "raw",
      userEmail: "agent@example.com",
      out: "diagnostics/run.json"
    });
  });

  it("accepts a positional run id", () => {
    expect(parseDebugRunArgs(["run-1", "--depth", "standard"])).toMatchObject({
      activityRunId: "run-1",
      depth: "standard"
    });
  });

  it("falls back to summary for invalid depths", () => {
    expect(parseDebugRunArgs(["run-1", "--depth", "everything"]).depth).toBe(
      "summary"
    );
  });
});

