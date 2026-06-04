import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractContractFactsFromPdf,
  extractContractFactsFromPdfChunks
} from "@/lib/contracts/anthropic-extract";
import { PDFDocument } from "pdf-lib";

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

describe("extractContractFactsFromPdfChunks", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });

  async function createPdf(pageCount: number) {
    const pdf = await PDFDocument.create();
    for (let index = 0; index < pageCount; index += 1) {
      pdf.addPage();
    }
    return Buffer.from(await pdf.save());
  }

  it("uses two-page chunks and starts all chunks concurrently by default", async () => {
    let resolveFirstCall: ((value: unknown) => void) | undefined;
    const firstCall = new Promise((resolve) => {
      resolveFirstCall = resolve;
    });

    mocks.create
      .mockReturnValueOnce(firstCall)
      .mockResolvedValue({
        content: [{ type: "text", text: validFactsJson }],
        stop_reason: "end_turn"
      });

    const extraction = extractContractFactsFromPdfChunks({
      filename: "contract.pdf",
      pdf: await createPdf(5)
    });

    await vi.waitFor(() => {
      expect(mocks.create).toHaveBeenCalledTimes(3);
    });

    const titles = mocks.create.mock.calls.map(
      ([body]) => body.messages[0].content[0].title
    );
    expect(titles).toEqual([
      "contract.pdf pages 1-2",
      "contract.pdf pages 3-4",
      "contract.pdf pages 5-5"
    ]);

    resolveFirstCall?.({
      content: [{ type: "text", text: validFactsJson }],
      stop_reason: "end_turn"
    });

    await extraction;
  });
});
