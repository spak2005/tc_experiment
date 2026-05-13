import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAgentDecision } from "@/lib/agent/executor";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";

const mocks = vi.hoisted(() => ({
  composeAgentResponse: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createAuditEvent: vi.fn(),
  executeTransactionWrites: vi.fn(),
  replyTcEmail: vi.fn(),
  sendTcEmail: vi.fn(),
  updateAgentDecisionExecution: vi.fn()
}));

vi.mock("@/lib/agent/response-writer", () => ({
  composeAgentResponse: mocks.composeAgentResponse
}));
vi.mock("@/lib/agentmail/service", () => ({
  replyTcEmail: mocks.replyTcEmail,
  sendTcEmail: mocks.sendTcEmail
}));
vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createAuditEvent: mocks.createAuditEvent,
  updateAgentDecisionExecution: mocks.updateAgentDecisionExecution
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
});
