import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractContractFactsFromPdf } from "@/lib/contracts/anthropic-extract";

const mocks = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: mocks.create
    }
  }),
  getAnthropicModel: () => "claude-test"
}));

const validFactsJson = JSON.stringify({
  contractVersion: "UNKNOWN",
  addenda: [],
  contacts: [],
  expectedDocuments: [],
  signatureStatus: "unknown",
  missingRequiredFacts: []
});

describe("extractContractFactsFromPdf", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });

  it("uses bounded Anthropic extraction request options", async () => {
    mocks.create.mockResolvedValue({
      content: [{ type: "text", text: validFactsJson }],
      stop_reason: "end_turn"
    });

    await extractContractFactsFromPdf({
      filename: "contract.pdf",
      pdf: Buffer.from("%PDF-contract")
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 8000,
        model: "claude-test"
      }),
      {
        maxRetries: 0,
        timeout: 75000
      }
    );
  });

  it("repairs malformed JSON responses", async () => {
    mocks.create
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: '{"contractVersion":"UNKNOWN","addenda":['
          }
        ],
        stop_reason: "end_turn"
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: validFactsJson }],
        stop_reason: "end_turn"
      });

    const facts = await extractContractFactsFromPdf({
      filename: "contract.pdf",
      pdf: Buffer.from("%PDF-contract")
    });

    expect(facts.contractVersion).toBe("UNKNOWN");
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        max_tokens: 8000,
        system: expect.stringContaining("repair")
      }),
      {
        maxRetries: 0,
        timeout: 30000
      }
    );
  });
});
