import { describe, expect, it } from "vitest";
import {
  extractImprovementCaseRunId,
  improvementCaseMarker
} from "@/lib/improvement/case-marker";

describe("improvement case marker", () => {
  it("extracts a marker from a subject", () => {
    expect(
      extractImprovementCaseRunId(
        "Executed contract [STEPH-CASE:case-run-123]",
        "Body"
      )
    ).toBe("case-run-123");
  });

  it("falls back to the body when the subject has no marker", () => {
    expect(
      extractImprovementCaseRunId(
        "Executed contract",
        "Please process this. [STEPH-CASE:CASE_123.abc]"
      )
    ).toBe("CASE_123.abc");
  });

  it("returns undefined when no marker is present", () => {
    expect(extractImprovementCaseRunId("Executed contract", "No marker")).toBeUndefined();
  });

  it("formats markers", () => {
    expect(improvementCaseMarker("run-1")).toBe("[STEPH-CASE:run-1]");
  });
});
