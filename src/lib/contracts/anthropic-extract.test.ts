import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractContractFactsFromPdfFile } from "@/lib/contracts/anthropic-extract";

const mocks = vi.hoisted(() => ({
  betaCreate: vi.fn(),
  create: vi.fn(),
  upload: vi.fn()
}));

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => ({
    beta: {
      files: {
        upload: mocks.upload
      },
      messages: {
        create: mocks.betaCreate
      }
    },
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

describe("extractContractFactsFromPdfFile", () => {
  beforeEach(() => {
    mocks.betaCreate.mockReset();
    mocks.create.mockReset();
    mocks.upload.mockReset();
  });

  it("uploads the PDF and extracts facts from the file source", async () => {
    mocks.upload.mockResolvedValue({ id: "file_123" });
    mocks.betaCreate.mockResolvedValue({
      content: [{ type: "text", text: validFactsJson }],
      stop_reason: "end_turn"
    });

    await extractContractFactsFromPdfFile({
      filename: "contract.pdf",
      pdf: Buffer.from("%PDF-contract")
    });

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        betas: ["files-api-2025-04-14"],
        file: expect.any(File)
      }),
      {
        maxRetries: 0,
        timeout: 60000
      }
    );
    expect(mocks.betaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        betas: ["files-api-2025-04-14"],
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "document",
                source: {
                  type: "file",
                  file_id: "file_123"
                }
              })
            ])
          }
        ],
        model: "claude-test"
      }),
      {
        maxRetries: 0,
        timeout: 180000
      }
    );
  });

  it("repairs malformed JSON responses from file extraction", async () => {
    mocks.upload.mockResolvedValue({ id: "file_123" });
    mocks.betaCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '{"contractVersion":"UNKNOWN","addenda":['
        }
      ],
      stop_reason: "end_turn"
    });
    mocks.create.mockResolvedValueOnce({
      content: [{ type: "text", text: validFactsJson }],
      stop_reason: "end_turn"
    });

    const facts = await extractContractFactsFromPdfFile({
      filename: "contract.pdf",
      pdf: Buffer.from("%PDF-contract")
    });

    expect(facts.contractVersion).toBe("UNKNOWN");
    expect(mocks.create).toHaveBeenCalledWith(
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
