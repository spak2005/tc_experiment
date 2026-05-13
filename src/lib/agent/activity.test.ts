import { describe, expect, it } from "vitest";
import {
  activityStatusForExecutionStatus,
  activityStatusForPolicyResult,
  safeBodyPreview
} from "@/lib/agent/activity";

describe("agent activity helpers", () => {
  it("normalizes and truncates email body previews", () => {
    expect(safeBodyPreview("  Hello\n\nthere\tfriend  ")).toBe("Hello there friend");
    expect(safeBodyPreview("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefg...");
  });

  it("maps policy outcomes to activity statuses", () => {
    expect(activityStatusForPolicyResult("allowed")).toBe("completed");
    expect(activityStatusForPolicyResult("approval_required")).toBe("waiting");
    expect(activityStatusForPolicyResult("blocked")).toBe("blocked");
  });

  it("maps execution outcomes to activity statuses", () => {
    expect(activityStatusForExecutionStatus("executed")).toBe("completed");
    expect(activityStatusForExecutionStatus("waiting_approval")).toBe("waiting");
    expect(activityStatusForExecutionStatus("blocked")).toBe("blocked");
  });
});
