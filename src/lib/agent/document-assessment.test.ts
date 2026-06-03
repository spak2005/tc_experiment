import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessContractDocument,
  buildMissingInfoContext
} from "@/lib/agent/document-assessment";

const mocks = vi.hoisted(() => ({
  extractContractFactsFromPdf: vi.fn()
}));

vi.mock("@/lib/contracts/anthropic-extract", () => ({
  extractContractFactsFromPdf: mocks.extractContractFactsFromPdf
}));

describe("assessContractDocument", () => {
  beforeEach(() => {
    mocks.extractContractFactsFromPdf.mockReset();
  });

  it("keeps a safe extraction error summary when PDF extraction fails", async () => {
    const error = new Error("PDF pages exceeded model limit");
    error.name = "BadRequestError";
    mocks.extractContractFactsFromPdf.mockRejectedValue(error);

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("pdf")
      },
      emailText: "Please see attached contract."
    });

    expect(assessment.extractionMode).toBe("email_fallback");
    expect(assessment.extractionError).toEqual({
      name: "BadRequestError",
      message: "PDF pages exceeded model limit",
      status: undefined,
      type: undefined
    });
  });
});

describe("buildMissingInfoContext", () => {
  it("keeps missing information as grounded context instead of prose", () => {
    const context = buildMissingInfoContext({
      usability: "needs_clarification",
      findings: ["The document is contract-like but incomplete."],
      missingItems: ["Confirm the Effective Date."],
      intakeGaps: [
        {
          key: "confirm_the_effective_date",
          label: "Confirm the Effective Date.",
          whyItMatters: "The TC needs the Effective Date to calculate contract deadlines correctly."
        }
      ]
    });

    expect(context.missingItems).toEqual(["Confirm the Effective Date."]);
    expect(context.gaps[0].whyItMatters).toContain("calculate contract deadlines");
  });
});
