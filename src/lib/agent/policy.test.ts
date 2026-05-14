import { describe, expect, it } from "vitest";
import { evaluateActionPolicy } from "@/lib/agent/policy";
import type { AgentContextPack, AgentDecision } from "@/lib/agent/types";

const context = {
  tcProfile: {
    id: "tc-1",
    teamId: "team-1",
    displayName: "Uzochukwu's TC",
    inboxAddress: "tc@agentmail.to",
    inboxId: "tc@agentmail.to",
    escalationEmail: "agent@example.com"
  },
  match: { confidence: 0, reasons: [], ambiguous: false, candidates: [] },
  temporalContext: {
    now: "2026-05-13T20:18:00-05:00",
    today: "2026-05-13",
    timezone: "America/Chicago",
    businessDay: true
  },
  inbound: {
    eventId: "event-1",
    inboxId: "tc@agentmail.to",
    messageId: "message-1",
    from: "agent@example.com",
    to: ["tc@agentmail.to"],
    cc: [],
    subject: "Status",
    text: "What is next?",
    attachments: []
  },
  emailText: "What is next?"
} satisfies AgentContextPack;

const decision: AgentDecision = {
  intent: "status_question",
  action: "answer_status",
  confidence: 0.9,
  requiresApproval: false,
  rationale: "The realtor asked for status.",
  inboundEvent: "question",
  response: {
    to: ["agent@example.com"],
    body: "The next deadline is the option period."
  },
  toolCalls: [],
  transactionWrites: []
};

describe("evaluateActionPolicy", () => {
  it("allows realtor-only responses", () => {
    expect(evaluateActionPolicy(decision, context).result).toBe("allowed");
  });

  it("approval-gates external recipients", () => {
    expect(
      evaluateActionPolicy(
        {
          ...decision,
          response: {
            to: ["title@example.com"],
            body: "Please confirm receipt."
          }
        },
        context
      ).result
    ).toBe("approval_required");
  });

  it("blocks decisions that indicate legal advice", () => {
    expect(
      evaluateActionPolicy(
        {
          ...decision,
          rationale: "This would provide legal advice about contract rights."
        },
        context
      ).result
    ).toBe("blocked");
  });
});
