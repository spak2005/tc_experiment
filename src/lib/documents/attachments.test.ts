import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeIncomingAttachment } from "@/lib/documents/attachments";

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

describe("storeIncomingAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue(undefined);
    mocks.getTcAttachment.mockResolvedValue({
      arrayBuffer: async () => Buffer.from("pdf").buffer
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
      teamId: "team-1",
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
      teamId: "team-1",
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
