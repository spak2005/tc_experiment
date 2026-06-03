import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessContractDocument,
  buildMissingInfoContext
} from "@/lib/agent/document-assessment";

const mocks = vi.hoisted(() => ({
  extractContractFactsFromPdf: vi.fn(),
  extractContractFactsFromPdfChunks: vi.fn(),
  extractContractFactsFromText: vi.fn(),
  extractTextFromPdfWithOcr: vi.fn()
}));

vi.mock("@/lib/contracts/anthropic-extract", () => ({
  extractContractFactsFromPdf: mocks.extractContractFactsFromPdf,
  extractContractFactsFromPdfChunks: mocks.extractContractFactsFromPdfChunks,
  extractContractFactsFromText: mocks.extractContractFactsFromText
}));

vi.mock("@/lib/contracts/ocr-extract", () => ({
  extractTextFromPdfWithOcr: mocks.extractTextFromPdfWithOcr
}));

describe("assessContractDocument", () => {
  beforeEach(() => {
    mocks.extractContractFactsFromPdf.mockReset();
    mocks.extractContractFactsFromPdfChunks.mockReset();
    mocks.extractContractFactsFromText.mockReset();
    mocks.extractTextFromPdfWithOcr.mockReset();
  });

  it("uses chunked PDF extraction when full PDF extraction fails", async () => {
    mocks.extractContractFactsFromPdf.mockRejectedValue(new Error("Request too large"));
    mocks.extractContractFactsFromPdfChunks.mockResolvedValue({
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
    });

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("pdf")
      },
      emailText: "Please see attached contract."
    });

    expect(assessment.extractionMode).toBe("anthropic_pdf_chunks");
    expect(assessment.usability).toBe("usable");
    expect(assessment.extractionError).toBeUndefined();
  });

  it("keeps a safe extraction error summary when all PDF extraction fails", async () => {
    const error = new Error("PDF pages exceeded model limit");
    error.name = "BadRequestError";
    mocks.extractContractFactsFromPdf.mockRejectedValue(error);
    mocks.extractContractFactsFromPdfChunks.mockRejectedValue(
      new Error("All PDF chunk extraction attempts failed.")
    );
    mocks.extractTextFromPdfWithOcr.mockRejectedValue(new Error("OCR binary not found: pdftoppm"));

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("pdf")
      },
      emailText: "Please see attached contract."
    });

    expect(assessment.extractionMode).toBe("email_fallback");
    expect(assessment.extractionError?.message).toBe(
      "OCR binary not found: pdftoppm"
    );
    expect(assessment.extractionError?.previousAttempt).toBe(
      "All PDF chunk extraction attempts failed."
    );
  });

  it("uses OCR text extraction when PDF document extraction fails", async () => {
    mocks.extractContractFactsFromPdf.mockRejectedValue(new Error("Request too large"));
    mocks.extractContractFactsFromPdfChunks.mockRejectedValue(
      new Error("All PDF chunk extraction attempts failed.")
    );
    mocks.extractTextFromPdfWithOcr.mockResolvedValue(
      "100 Pecanwood South, Kyle, TX 78640"
    );
    mocks.extractContractFactsFromText.mockResolvedValue({
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
    });

    const assessment = await assessContractDocument({
      attachment: {
        filename: "contract.pdf",
        body: Buffer.from("pdf")
      },
      emailText: "Please see attached contract."
    });

    expect(assessment.extractionMode).toBe("ocr_text");
    expect(assessment.usability).toBe("usable");
    expect(mocks.extractContractFactsFromText).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "contract.pdf",
        text: "100 Pecanwood South, Kyle, TX 78640"
      })
    );
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
