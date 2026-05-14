import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAgentDecision } from "@/lib/agent/executor";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";

const mocks = vi.hoisted(() => ({
  composeAgentResponse: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createApproval: vi.fn(),
  createAuditEvent: vi.fn(),
  executeTransactionWrites: vi.fn(),
  extractAgentMailMessageMetadata: vi.fn(),
  findOpenTasksByOwnerRole: vi.fn(),
  findPartyRolesByEmails: vi.fn(),
  getTaskById: vi.fn(),
  replyTcEmail: vi.fn(),
  sendTcEmail: vi.fn(),
  updateAgentDecisionExecution: vi.fn(),
  updateApprovalRequestMetadata: vi.fn(),
  upsertTaskRecord: vi.fn()
}));

vi.mock("@/lib/agent/response-writer", () => ({
  composeAgentResponse: mocks.composeAgentResponse
}));
vi.mock("@/lib/agentmail/service", () => ({
  extractAgentMailMessageMetadata: mocks.extractAgentMailMessageMetadata,
  replyTcEmail: mocks.replyTcEmail,
  sendTcEmail: mocks.sendTcEmail
}));
vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createApproval: mocks.createApproval,
  createAuditEvent: mocks.createAuditEvent,
  findOpenTasksByOwnerRole: mocks.findOpenTasksByOwnerRole,
  findPartyRolesByEmails: mocks.findPartyRolesByEmails,
  getTaskById: mocks.getTaskById,
  updateAgentDecisionExecution: mocks.updateAgentDecisionExecution,
  updateApprovalRequestMetadata: mocks.updateApprovalRequestMetadata,
  upsertTaskRecord: mocks.upsertTaskRecord
}));
vi.mock("@/lib/transaction-writes/executor", () => ({
  executeTransactionWrites: mocks.executeTransactionWrites
}));

const transactionId = "11111111-1111-4111-8111-111111111111";

const context: AgentContextPack = {
  inbound: {
    eventId: "event-1",
    inboxId: "tc@example.com",
    messageId: "message-1",
    threadId: "thread-1",
    from: "agent@example.com",
    to: ["tc@example.com"],
    cc: [],
    subject: "Closing update",
    text: "Closing moved to June 30.",
    attachments: []
  },
  emailText: "Closing update\n\nClosing moved to June 30.",
  temporalContext: {
    now: "2026-05-13T10:00:00-05:00",
    today: "2026-05-13",
    timezone: "America/Chicago",
    businessDay: true
  },
  tcProfile: {
    id: "tc-1",
    teamId: "team-1",
    displayName: "Agent's TC",
    inboxAddress: "tc@example.com",
    inboxId: "tc@example.com",
    escalationEmail: "agent@example.com"
  },
  match: {
    transactionId,
    confidence: 0.9,
    reasons: ["same property"],
    ambiguous: false,
    candidates: []
  }
};

describe("executeAgentDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.updateAgentDecisionExecution.mockResolvedValue(undefined);
    mocks.replyTcEmail.mockResolvedValue({});
    mocks.findPartyRolesByEmails.mockResolvedValue([]);
    mocks.findOpenTasksByOwnerRole.mockResolvedValue([]);
    mocks.getTaskById.mockResolvedValue(null);
    mocks.upsertTaskRecord.mockResolvedValue({ id: "task-stub", inserted: false });
    mocks.executeTransactionWrites.mockResolvedValue([
      {
        name: "updateTransactionCore",
        status: "applied",
        targetType: "transaction",
        targetId: transactionId,
        fieldKey: "closingDate",
        previousValue: "2026-06-15",
        newValue: "2026-06-30",
        message: "Updated closingDate."
      }
    ]);
    mocks.composeAgentResponse.mockResolvedValue({
      subject: "Re: Closing update",
      body: "Got it, I updated the closing date to June 30.",
      to: ["agent@example.com"],
      labels: ["transaction_update"]
    });
  });

  it("executes transaction writes before composing the response", async () => {
    const decision: AgentDecision = {
      intent: "transaction_update",
      action: "record_update",
      confidence: 0.9,
      transactionId,
      matchConfidence: 0.9,
      requiresApproval: false,
      rationale: "The realtor provided a closing-date update.",
      inboundEvent: "deadline_change",
      toolCalls: [],
      transactionWrites: [
        {
          name: "updateTransactionCore",
          input: { transactionId, closingDate: "2026-06-30" },
          source: {
            sourceType: "email",
            sourceReference: "message-1",
            confidence: 0.9,
            rationale: "Realtor said closing moved to June 30."
          }
        }
      ]
    };

    await executeAgentDecision({
      context,
      decision,
      decisionId: "decision-1",
      policy: { result: "allowed", reasons: ["Allowed"] }
    });

    expect(mocks.executeTransactionWrites).toHaveBeenCalledWith({
      teamId: "team-1",
      agentDecisionId: "decision-1",
      writes: decision.transactionWrites
    });
    expect(mocks.composeAgentResponse.mock.calls[0][0].writeResults[0]).toMatchObject({
      fieldKey: "closingDate",
      status: "applied"
    });
    expect(mocks.executeTransactionWrites.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.composeAgentResponse.mock.invocationCallOrder[0]
    );
  });

  it("forwards the decision taskId onto approval requests for external recipients", async () => {
    const taskId = "22222222-2222-4222-8222-222222222222";
    mocks.createApproval.mockResolvedValueOnce({ id: "approval-99" });
    mocks.sendTcEmail.mockResolvedValueOnce({
      messageId: "request-1",
      threadId: "thread-1"
    });
    mocks.extractAgentMailMessageMetadata.mockReturnValueOnce({
      messageId: "request-1",
      threadId: "thread-1"
    });
    mocks.updateApprovalRequestMetadata.mockResolvedValue(undefined);

    const decision: AgentDecision = {
      intent: "transaction_update",
      action: "ask_for_info",
      confidence: 0.9,
      transactionId,
      matchConfidence: 0.9,
      requiresApproval: false,
      rationale: "Need a title commitment from title.",
      inboundEvent: "question",
      toolCalls: [],
      transactionWrites: [],
      response: {
        subject: "Title commitment status",
        body: "Hi - can you send the commitment when ready? Thanks.",
        to: ["title@example.com"],
        labels: ["title_commitment", "outbound"],
        taskId
      }
    };

    await executeAgentDecision({
      context,
      decision,
      decisionId: "decision-2",
      policy: { result: "allowed", reasons: ["Allowed"] }
    });

    expect(mocks.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId,
        agentDecisionId: "decision-2",
        taskId,
        proposedSubject: "Title commitment status",
        proposedTo: ["title@example.com"]
      })
    );
    const approvalCreatedEvent = mocks.createAgentActivityEvent.mock.calls.find(
      ([event]) => event.eventType === "approval_created"
    );
    expect(approvalCreatedEvent?.[0].metadata).toMatchObject({ taskId });
  });

  it("transitions the task to waiting_response on a direct realtor send when an external recipient is also addressed", async () => {
    const taskId = "33333333-3333-4333-8333-333333333333";
    mocks.composeAgentResponse.mockReset();
    mocks.composeAgentResponse.mockResolvedValue({
      subject: "Re: Closing update",
      body: "Quick update for the team.",
      to: ["agent@example.com"],
      labels: ["transaction_update"]
    });
    mocks.executeTransactionWrites.mockResolvedValue([]);

    const decision: AgentDecision = {
      intent: "transaction_update",
      action: "record_update",
      confidence: 0.9,
      transactionId,
      matchConfidence: 0.9,
      requiresApproval: false,
      rationale: "Updating realtor with a quick note.",
      inboundEvent: "deadline_change",
      toolCalls: [],
      transactionWrites: [],
      response: {
        subject: "Re: Closing update",
        body: "Quick update for the team.",
        to: ["agent@example.com"],
        labels: ["transaction_update"],
        taskId
      }
    };

    await executeAgentDecision({
      context,
      decision,
      decisionId: "decision-3",
      policy: { result: "allowed", reasons: ["Allowed"] }
    });

    expect(mocks.createApproval).not.toHaveBeenCalled();
    expect(mocks.replyTcEmail).toHaveBeenCalled();
    expect(mocks.upsertTaskRecord).not.toHaveBeenCalled();
    const skipped = mocks.createAgentActivityEvent.mock.calls.find(
      ([event]) => event.eventType === "outbound_task_transition_skipped"
    );
    expect(skipped?.[0].metadata.resolution.kind).toBe("no_external_recipient");
  });
});
