import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeApprovalReply } from "@/lib/approvals/executor";
import type { ApprovalExecutionRow } from "@/lib/db/repositories";
import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";

const mocks = vi.hoisted(() => ({
  classifyApprovalReply: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createAuditEvent: vi.fn(),
  replyTcEmail: vi.fn(),
  sendTcEmail: vi.fn(),
  updateApprovalDraft: vi.fn(),
  updateApprovalRequestMetadata: vi.fn(),
  updateApprovalSentMetadata: vi.fn(),
  updateApprovalStatus: vi.fn()
}));

vi.mock("@/lib/approvals/reply-interpreter", () => ({
  classifyApprovalReply: mocks.classifyApprovalReply
}));

vi.mock("@/lib/agentmail/service", () => ({
  extractAgentMailMessageMetadata: (value: unknown) => {
    const record = value as Record<string, string | undefined>;
    return { messageId: record?.messageId, threadId: record?.threadId };
  },
  replyTcEmail: mocks.replyTcEmail,
  sendTcEmail: mocks.sendTcEmail
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createAuditEvent: mocks.createAuditEvent,
  updateApprovalDraft: mocks.updateApprovalDraft,
  updateApprovalRequestMetadata: mocks.updateApprovalRequestMetadata,
  updateApprovalSentMetadata: mocks.updateApprovalSentMetadata,
  updateApprovalStatus: mocks.updateApprovalStatus
}));

const approval: ApprovalExecutionRow = {
  id: "approval-1",
  transaction_id: "tx-1",
  team_id: "team-1",
  agent_decision_id: "decision-1",
  proposed_subject: "Title update",
  proposed_body: "Please confirm receipt.",
  proposed_to: ["title@example.com"],
  proposed_cc: [],
  inbox_id: "tc@example.com",
  escalation_email: "agent@example.com",
  request_message_id: "request-1",
  request_thread_id: "thread-1"
};

const inbound: NormalizedInboundEmail = {
  eventId: "event-1",
  inboxId: "tc@example.com",
  messageId: "reply-1",
  threadId: "thread-1",
  from: "agent@example.com",
  to: ["tc@example.com"],
  cc: [],
  subject: "Re: Approve email",
  text: "send",
  attachments: []
};

describe("executeApprovalReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.replyTcEmail.mockResolvedValue({ messageId: "reply-out-1", threadId: "thread-1" });
    mocks.sendTcEmail.mockResolvedValue({ messageId: "sent-1", threadId: "sent-thread-1" });
    mocks.updateApprovalDraft.mockResolvedValue({ ...approval, proposed_body: "Revised body." });
    mocks.updateApprovalRequestMetadata.mockResolvedValue(undefined);
    mocks.updateApprovalSentMetadata.mockResolvedValue(undefined);
    mocks.updateApprovalStatus.mockResolvedValue(approval);
  });

  it("sends the original draft when the realtor approves", async () => {
    mocks.classifyApprovalReply.mockResolvedValue({
      action: "approve_send",
      confidence: 0.95,
      rationale: "Approved."
    });

    await executeApprovalReply({ approval, inbound });

    expect(mocks.updateApprovalStatus).toHaveBeenCalledWith("approval-1", "approved");
    expect(mocks.sendTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["title@example.com"],
        subject: "Title update",
        text: "Please confirm receipt."
      })
    );
    expect(mocks.replyTcEmail).toHaveBeenCalledWith(expect.objectContaining({ text: "Sent." }));
  });

  it("rejects without sending externally when the realtor holds", async () => {
    mocks.classifyApprovalReply.mockResolvedValue({
      action: "reject",
      confidence: 0.95,
      rationale: "Do not send."
    });

    await executeApprovalReply({ approval, inbound });

    expect(mocks.updateApprovalStatus).toHaveBeenCalledWith("approval-1", "rejected");
    expect(mocks.sendTcEmail).not.toHaveBeenCalled();
    expect(mocks.replyTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Got it. I will not send it." })
    );
  });

  it("revises and sends when the realtor explicitly says to send", async () => {
    mocks.classifyApprovalReply.mockResolvedValue({
      action: "revise_and_send",
      confidence: 0.9,
      rationale: "Revise and send.",
      revisedBody: "Revised body."
    });
    mocks.updateApprovalStatus.mockResolvedValue({ ...approval, proposed_body: "Revised body." });

    await executeApprovalReply({ approval, inbound });

    expect(mocks.updateApprovalDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: "approval-1", proposedBody: "Revised body." })
    );
    expect(mocks.sendTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Revised body.", labels: ["approved-send", "revised"] })
    );
    expect(mocks.replyTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Updated and sent." })
    );
  });

  it("revises and asks again when the realtor wants to review", async () => {
    mocks.classifyApprovalReply.mockResolvedValue({
      action: "revise_only",
      confidence: 0.9,
      rationale: "Revise only.",
      revisedBody: "Revised body."
    });

    await executeApprovalReply({ approval, inbound });

    expect(mocks.updateApprovalDraft).toHaveBeenCalled();
    expect(mocks.updateApprovalStatus).not.toHaveBeenCalled();
    expect(mocks.sendTcEmail).not.toHaveBeenCalled();
    expect(mocks.replyTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Is this okay to send") })
    );
  });

  it("asks a clarification for ambiguous replies", async () => {
    mocks.classifyApprovalReply.mockResolvedValue({
      action: "needs_clarification",
      confidence: 0.4,
      rationale: "Ambiguous.",
      question: "Should I send this?"
    });

    await executeApprovalReply({ approval, inbound });

    expect(mocks.updateApprovalStatus).not.toHaveBeenCalled();
    expect(mocks.sendTcEmail).not.toHaveBeenCalled();
    expect(mocks.replyTcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Should I send this?" })
    );
  });
});
