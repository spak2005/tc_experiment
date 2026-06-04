import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessContractDocument,
  buildMissingInfoContext
} from "@/lib/agent/document-assessment";

const mocks = vi.hoisted(() => ({
  extractContractFactsFromPdfFile: vi.fn()
}));

vi.mock("@/lib/contracts/anthropic-extract", () => ({
  extractContractFactsFromPdfFile: mocks.extractContractFactsFromPdfFile
}));

const usableFacts = {
  contractVersion: "TREC_20_18",
  propertyAddress: {
    value: "100 Pecanwood South, Kyle, TX 78640",
    confidence: 0.9,
    needsConfirmation: false
  },
  cashOrFinanced: {
    value: "financed",
    confidence: 0.9,
    needsConfirmation: false
  },
  earnestMoneyAmount: {
    value: "2900",
    confidence: 0.85,
    needsConfirmation: false
  },
  optionPeriodDays: {
    value: 7,
    confidence: 0.85,
    needsConfirmation: false
  },
  effectiveDate: {
    value: "2026-03-11",
    confidence: 0.9,
    needsConfirmation: false
  },
  closingDate: {
    value: "2026-04-10",
    confidence: 0.9,
    needsConfirmation: false
  },
  titleCompany: {
    value: "McKnight Title",
    confidence: 0.9,
    needsConfirmation: false
  },
  addenda: [],
  contacts: [],
  expectedDocuments: [],
  signatureStatus: "appears_executed",
  missingRequiredFacts: []
} as const;

describe("assessContractDocument", () => {
  beforeEach(() => {
    mocks.extractContractFactsFromPdfFile.mockReset();
  });

  it("uses uploaded PDF extraction for valid PDFs", async () => {
    mocks.extractContractFactsFromPdfFile.mockResolvedValue(usableFacts);

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("%PDF-contract")
      },
      emailText: "Please see attached contract."
    });

    expect(mocks.extractContractFactsFromPdfFile).toHaveBeenCalled();
    expect(assessment.extractionMode).toBe("anthropic_pdf_file");
    expect(assessment.usability).toBe("usable");
  });

  it("uses uploaded PDF extraction for large PDFs", async () => {
    mocks.extractContractFactsFromPdfFile.mockResolvedValue(usableFacts);
    const largePdf = Buffer.concat([
      Buffer.from("%PDF-contract"),
      Buffer.alloc(10 * 1024 * 1024 + 1)
    ]);

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: largePdf
      },
      emailText: "Please see attached contract."
    });

    expect(mocks.extractContractFactsFromPdfFile).toHaveBeenCalled();
    expect(assessment.extractionMode).toBe("anthropic_pdf_file");
    expect(assessment.usability).toBe("usable");
  });

  it("falls back to email assessment when uploaded PDF extraction fails", async () => {
    mocks.extractContractFactsFromPdfFile.mockRejectedValue(
      new Error("Files API failed")
    );
    const largePdf = Buffer.concat([
      Buffer.from("%PDF-contract"),
      Buffer.alloc(10 * 1024 * 1024 + 1)
    ]);

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: largePdf
      },
      emailText: "Please see attached contract."
    });

    expect(mocks.extractContractFactsFromPdfFile).toHaveBeenCalled();
    expect(assessment.extractionMode).toBe("email_fallback");
    expect(assessment.extractionError?.message).toBe("Files API failed");
  });

  it("fails locally when a PDF attachment has no PDF header", async () => {
    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("not a pdf")
      },
      emailText: "Please see attached contract."
    });

    expect(assessment.extractionMode).toBe("email_fallback");
    expect(assessment.extractionError?.message).toContain(
      "did not contain a PDF header"
    );
    expect(mocks.extractContractFactsFromPdfFile).not.toHaveBeenCalled();
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
