import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  intakeAttachmentKey,
  storeIntakeArtifactAttachment
} from "@/lib/documents/intake-artifacts";

const mocks = vi.hoisted(() => ({
  fetchIncomingAttachment: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createIntakeArtifactAttachment: vi.fn(),
  storePrivateDocument: vi.fn()
}));

vi.mock("@/lib/documents/attachments", () => ({
  fetchIncomingAttachment: mocks.fetchIncomingAttachment
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createIntakeArtifactAttachment: mocks.createIntakeArtifactAttachment
}));

vi.mock("@/lib/storage/blob", () => ({
  storePrivateDocument: mocks.storePrivateDocument
}));

describe("intake artifact attachment storage", () => {
  beforeEach(() => {
    mocks.fetchIncomingAttachment.mockReset();
    mocks.createAgentActivityEvent.mockReset();
    mocks.createIntakeArtifactAttachment.mockReset();
    mocks.storePrivateDocument.mockReset();
  });

  it("builds stable attachment keys", () => {
    expect(
      intakeAttachmentKey({
        inboxId: "inbox-1",
        messageId: "message-1",
        attachmentId: "attachment-1"
      })
    ).toBe("inbox-1:message-1:attachment-1");
  });

  it("stores an intake attachment without requiring a transaction id", async () => {
    mocks.storePrivateDocument.mockResolvedValue({
      key: "users/user-1/intake/contract.pdf"
    });
    mocks.createIntakeArtifactAttachment.mockResolvedValue({
      id: "artifact-attachment-1",
      inserted: true
    });

    const stored = await storeIntakeArtifactAttachment({
      userId: "user-1",
      intakeArtifactId: "artifact-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      attachment: {
        id: "attachment-1",
        filename: "contract.pdf",
        contentType: "application/pdf"
      },
      fetched: {
        filename: "contract.pdf",
        contentType: "application/pdf",
        body: Buffer.from("pdf")
      }
    });

    expect(mocks.storePrivateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        filename: "contract.pdf"
      })
    );
    expect(mocks.storePrivateDocument.mock.calls[0][0]).not.toHaveProperty("transactionId");
    expect(mocks.createIntakeArtifactAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        intakeArtifactId: "artifact-1",
        attachmentKey: "inbox-1:message-1:attachment-1",
        blobKey: "users/user-1/intake/contract.pdf"
      })
    );
    expect(stored.blobKey).toBe("users/user-1/intake/contract.pdf");
  });
});
