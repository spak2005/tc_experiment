import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIntakeArtifact,
  createIntakeArtifactAttachment,
  updateIntakeArtifact
} from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query,
  withTransaction: vi.fn()
}));

describe("intake artifact repositories", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("creates or reuses an intake artifact by user-scoped artifact key", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "artifact-1",
          user_id: "user-1",
          tc_profile_id: "tc-1",
          webhook_event_id: "webhook-1",
          artifact_key: "inbox-1:message:message-1",
          inbox_id: "inbox-1",
          message_id: "message-1",
          thread_id: "thread-1",
          from_address: "agent@example.com",
          to_addresses: ["tc@example.com"],
          cc_addresses: [],
          subject: "Contract",
          body_preview: "See attached.",
          status: "received",
          extraction_summary: {},
          orientation_result: {},
          disposition: null,
          transaction_id: null,
          created_at: "2026-06-04T00:00:00.000Z",
          updated_at: "2026-06-04T00:00:00.000Z",
          inserted: true
        }
      ]
    });

    const artifact = await createIntakeArtifact({
      userId: "user-1",
      tcProfileId: "tc-1",
      webhookEventId: "webhook-1",
      artifactKey: "inbox-1:message:message-1",
      inboxId: "inbox-1",
      messageId: "message-1",
      threadId: "thread-1",
      fromAddress: "agent@example.com",
      toAddresses: ["tc@example.com"],
      ccAddresses: [],
      subject: "Contract",
      bodyPreview: "See attached."
    });

    expect(artifact.inserted).toBe(true);
    expect(String(mocks.query.mock.calls[0][0])).toContain("on conflict (user_id, artifact_key)");
  });

  it("updates extraction, orientation, disposition, and transaction link", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "artifact-1",
          user_id: "user-1",
          tc_profile_id: "tc-1",
          webhook_event_id: null,
          artifact_key: "key-1",
          inbox_id: "inbox-1",
          message_id: "message-1",
          thread_id: "thread-1",
          from_address: "agent@example.com",
          to_addresses: [],
          cc_addresses: [],
          subject: "Contract",
          body_preview: null,
          status: "oriented",
          extraction_summary: { contractVersion: "TREC_20_18" },
          orientation_result: { posture: "active_coordination" },
          disposition: "active_coordination",
          transaction_id: "tx-1",
          created_at: "2026-06-04T00:00:00.000Z",
          updated_at: "2026-06-04T00:00:00.000Z"
        }
      ]
    });

    const artifact = await updateIntakeArtifact({
      id: "artifact-1",
      status: "oriented",
      extractionSummary: { contractVersion: "TREC_20_18" },
      orientationResult: { posture: "active_coordination" },
      disposition: "active_coordination",
      transactionId: "tx-1"
    });

    expect(artifact?.orientation_result).toEqual({ posture: "active_coordination" });
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "artifact-1",
      "oriented",
      JSON.stringify({ contractVersion: "TREC_20_18" }),
      JSON.stringify({ posture: "active_coordination" }),
      "active_coordination",
      "tx-1"
    ]);
  });

  it("creates or reuses intake artifact attachments idempotently", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "artifact-attachment-1",
          intake_artifact_id: "artifact-1",
          attachment_key: "inbox-1:message-1:attachment-1",
          filename: "contract.pdf",
          content_type: "application/pdf",
          blob_key: "users/user-1/intake/contract.pdf",
          document_id: null,
          metadata: { byteLength: 123 },
          created_at: "2026-06-04T00:00:00.000Z",
          inserted: true
        }
      ]
    });

    const attachment = await createIntakeArtifactAttachment({
      intakeArtifactId: "artifact-1",
      attachmentKey: "inbox-1:message-1:attachment-1",
      filename: "contract.pdf",
      contentType: "application/pdf",
      blobKey: "users/user-1/intake/contract.pdf",
      metadata: { byteLength: 123 }
    });

    expect(attachment.inserted).toBe(true);
    expect(String(mocks.query.mock.calls[0][0])).toContain(
      "on conflict (intake_artifact_id, attachment_key)"
    );
  });
});
