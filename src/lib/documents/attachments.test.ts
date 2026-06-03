import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchIncomingAttachment,
  storeIncomingAttachment
} from "@/lib/documents/attachments";

const mocks = vi.hoisted(() => ({
  getTcAttachment: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createDocumentRecordOnce: vi.fn(),
  findDocumentBySourceAttachmentKey: vi.fn(),
  updateDocumentStatus: vi.fn(),
  storePrivateDocument: vi.fn()
}));

vi.mock("@/lib/agentmail/service", () => ({
  getTcAttachment: mocks.getTcAttachment
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createDocumentRecordOnce: mocks.createDocumentRecordOnce,
  findDocumentBySourceAttachmentKey: mocks.findDocumentBySourceAttachmentKey,
  updateDocumentStatus: mocks.updateDocumentStatus
}));

vi.mock("@/lib/storage/blob", () => ({
  storePrivateDocument: mocks.storePrivateDocument
}));

const attachment = {
  id: "att-1",
  filename: "contract.pdf",
  contentType: "application/pdf"
};

function exactArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

describe("storeIncomingAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue(undefined);
    mocks.getTcAttachment.mockResolvedValue({
      arrayBuffer: async () => exactArrayBuffer(Buffer.from("%PDF-contract"))
    });
    mocks.findDocumentBySourceAttachmentKey.mockResolvedValue(null);
    mocks.storePrivateDocument.mockResolvedValue({ key: "blob-key", url: "https://blob" });
    mocks.createDocumentRecordOnce.mockResolvedValue({
      id: "doc-1",
      inserted: true,
      blob_key: "blob-key"
    });
  });

  it("reuses an existing document row for the same inbound attachment", async () => {
    mocks.findDocumentBySourceAttachmentKey.mockResolvedValueOnce({
      id: "doc-existing",
      transaction_id: "tx-1",
      type: "contract",
      name: "contract.pdf",
      status: "under_review",
      blob_key: "existing-blob-key",
      source_message_id: "message-1",
      source_attachment_key: "inbox-1:message-1:att-1"
    });

    const stored = await storeIncomingAttachment({
      userId: "user-1",
      transactionId: "tx-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment
    });

    expect(mocks.storePrivateDocument).not.toHaveBeenCalled();
    expect(mocks.createDocumentRecordOnce).not.toHaveBeenCalled();
    expect(stored).toMatchObject({
      documentId: "doc-existing",
      blobKey: "existing-blob-key"
    });
  });

  it("creates a document with a stable source attachment key", async () => {
    await storeIncomingAttachment({
      userId: "user-1",
      transactionId: "tx-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment
    });

    expect(mocks.createDocumentRecordOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAttachmentKey: "inbox-1:message-1:att-1",
        sourceMessageId: "message-1",
        blobKey: "blob-key"
      })
    );
  });
});

describe("fetchIncomingAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("downloads the real file when AgentMail returns attachment metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => exactArrayBuffer(Buffer.from("%PDF-contract"))
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.getTcAttachment.mockResolvedValue({
      arrayBuffer: async () =>
        exactArrayBuffer(
          Buffer.from(
            JSON.stringify({
              attachment_id: "att-1",
              size: 13,
              download_url: "https://agentmail-download.example/contract",
              expires_at: "2026-06-03T18:30:00Z",
              filename: "contract.pdf",
              content_type: "application/pdf"
            })
          )
        )
    });

    const fetched = await fetchIncomingAttachment({
      userId: "user-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://agentmail-download.example/contract"
    );
    expect(fetched.body.toString("utf8")).toBe("%PDF-contract");
    expect(mocks.createAgentActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          download: expect.objectContaining({
            source: "download_url",
            attachmentId: "att-1",
            hasDownloadUrl: true
          }),
          body: expect.objectContaining({
            startsWithPdfHeader: true
          })
        })
      })
    );
  });

  it("trims leading bytes before a PDF header", async () => {
    mocks.getTcAttachment.mockResolvedValue({
      arrayBuffer: async () => exactArrayBuffer(Buffer.from("junk%PDF-contract"))
    });

    const fetched = await fetchIncomingAttachment({
      userId: "user-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment
    });

    expect(fetched.body.toString("utf8")).toBe("%PDF-contract");
    expect(mocks.createAgentActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          body: expect.objectContaining({
            startsWithPdfHeader: true
          }),
          rawBody: expect.objectContaining({
            pdfHeaderOffset: 4,
            normalizedLeadingBytes: 4
          })
        })
      })
    );
  });

  it("logs fetched body diagnostics", async () => {
    mocks.getTcAttachment.mockResolvedValue({
      arrayBuffer: async () => exactArrayBuffer(Buffer.from("not a pdf"))
    });

    await fetchIncomingAttachment({
      userId: "user-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment
    });

    expect(mocks.createAgentActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          body: expect.objectContaining({
            byteLength: 9,
            firstBytesText: "not a pdf",
            pdfHeaderOffset: null,
            startsWithPdfHeader: false
          })
        })
      })
    );
  });
});
