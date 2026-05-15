import { describe, expect, it } from "vitest";
import { buildDealMemory } from "@/lib/agent/memory";

describe("buildDealMemory", () => {
  it("returns an empty prompt shape without stored memory", () => {
    expect(buildDealMemory()).toEqual({
      dealBrief: "",
      activeQuestionsAndWarnings: []
    });
  });

  it("maps stored transaction memory into prompt-facing deal memory", () => {
    expect(
      buildDealMemory({
        summary: "Current deal brief.",
        open_questions: ["Confirm title contact.", "Do not assume appraisal delay is official."],
        last_inbound_at: "2026-05-15T12:00:00Z",
        updated_at: "2026-05-15T12:05:00Z"
      })
    ).toEqual({
      dealBrief: "Current deal brief.",
      activeQuestionsAndWarnings: [
        "Confirm title contact.",
        "Do not assume appraisal delay is official."
      ],
      lastInboundAt: "2026-05-15T12:00:00Z",
      updatedAt: "2026-05-15T12:05:00Z"
    });
  });

  it("filters malformed or blank open questions", () => {
    expect(
      buildDealMemory({
        summary: "  Brief with whitespace.  ",
        open_questions: ["", "  Confirm lender status. ", 7, null]
      })
    ).toEqual({
      dealBrief: "Brief with whitespace.",
      activeQuestionsAndWarnings: ["Confirm lender status."]
    });
  });
});
