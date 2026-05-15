import { describe, expect, it, vi } from "vitest";
import { classifyTransactionDocument } from "@/lib/agent/document-classifier";

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => {
    throw new Error("LLM unavailable");
  },
  getAnthropicModel: () => "test-model"
}));

describe("classifyTransactionDocument", () => {
  it("deterministically matches survey documents to expected rows", async () => {
    const result = await classifyTransactionDocument({
      documentId: "stored-1",
      filename: "random-upload.pdf",
      contentType: "application/pdf",
      emailText: "Attached is the survey and T-47 for this file.",
      expectedDocuments: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Survey / T-47",
          status: "needed",
          metadata: { key: "survey_or_t47" }
        }
      ]
    });

    expect(result).toMatchObject({
      documentId: "stored-1",
      categoryKey: "survey_or_t47",
      matchedDocumentId: "11111111-1111-4111-8111-111111111111",
      satisfiesExpectedDocument: true,
      mode: "deterministic"
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("returns an unclassified fallback when no match is available", async () => {
    const result = await classifyTransactionDocument({
      filename: "photo.pdf",
      contentType: "application/pdf",
      emailText: "Please see attached.",
      expectedDocuments: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Title commitment",
          status: "needed",
          metadata: { key: "title_commitment" }
        }
      ]
    });

    expect(result).toMatchObject({
      filename: "photo.pdf",
      satisfiesExpectedDocument: false,
      confidence: 0,
      mode: "unclassified"
    });
  });
});
