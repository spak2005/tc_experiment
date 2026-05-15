import { describe, expect, it, vi } from "vitest";
import type { TransactionContext } from "@/lib/agent/types";
import { classifyEvidenceDocuments } from "@/lib/workflow/document-reconciliation";

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => {
    throw new Error("LLM unavailable");
  },
  getAnthropicModel: () => "test-model"
}));

describe("classifyEvidenceDocuments", () => {
  it("matches unclear filenames against expected document rows using email context", async () => {
    const context = {
      transaction: { id: "tx-1" },
      canonicalFacts: [],
      recentChanges: [],
      milestones: [],
      tasks: [],
      documents: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Survey / T-47",
          type: "survey",
          status: "needed",
          metadata: { key: "survey_or_t47" }
        }
      ],
      messages: [],
      blockers: [],
      dealMemory: {
        dealBrief: "",
        activeQuestionsAndWarnings: []
      },
      recentDecisions: [],
      missingItems: []
    } satisfies TransactionContext;

    const [classification] = await classifyEvidenceDocuments({
      context,
      emailText: "Attached is the survey for this transaction.",
      documents: [
        {
          documentId: "stored-1",
          filename: "upload.pdf",
          contentType: "application/pdf"
        }
      ]
    });

    expect(classification).toMatchObject({
      documentId: "stored-1",
      matchedDocumentId: "11111111-1111-4111-8111-111111111111",
      satisfiesExpectedDocument: true
    });
  });
});
