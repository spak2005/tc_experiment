import { beforeEach, describe, expect, it, vi } from "vitest";
import { processAgentMailInbound } from "@/lib/workflow/intake";

const mocks = vi.hoisted(() => ({
  normalizeAgentMailInbound: vi.fn(),
  findTcProfileByInbox: vi.fn(),
  markWebhookEventProcessed: vi.fn()
}));

vi.mock("@/lib/agent/context", () => ({
  buildAgentContextPack: vi.fn(),
  getTransactionContext: vi.fn()
}));

vi.mock("@/lib/agent/document-assessment", () => ({
  assessContractDocument: vi.fn()
}));

vi.mock("@/lib/agent/decision", () => ({
  decideNextAction: vi.fn()
}));

vi.mock("@/lib/agent/executor", () => ({
  executeAgentDecision: vi.fn()
}));

vi.mock("@/lib/agent/policy", () => ({
  evaluateActionPolicy: vi.fn()
}));

vi.mock("@/lib/agentmail/inbound", () => ({
  normalizeAgentMailInbound: mocks.normalizeAgentMailInbound
}));

vi.mock("@/lib/approvals/executor", () => ({
  executeApprovalReply: vi.fn()
}));

vi.mock("@/lib/contracts/checklist", () => ({
  buildExpectedDocumentChecklist: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: vi.fn(),
  createAgentDecisionOnce: vi.fn(),
  createAuditEvent: vi.fn(),
  createMessage: vi.fn(),
  findOrCreateTransactionForIntake: vi.fn(),
  findPendingApprovalByReply: vi.fn(),
  findTransactionMatchCandidates: vi.fn(),
  findTcProfileByInbox: mocks.findTcProfileByInbox,
  insertMilestones: vi.fn(),
  insertTasks: vi.fn(),
  markWebhookEventProcessed: mocks.markWebhookEventProcessed,
  saveExtractedContractFacts: vi.fn(),
  updateTransactionFromFacts: vi.fn(),
  upsertTransactionMemory: vi.fn()
}));

vi.mock("@/lib/documents/attachments", () => ({
  fetchIncomingAttachment: vi.fn(),
  isPdfAttachment: vi.fn(),
  markStoredAttachmentProcessed: vi.fn(),
  storeIncomingAttachment: vi.fn()
}));

vi.mock("@/lib/milestones/engine", () => ({
  generateTexasMilestones: vi.fn()
}));

vi.mock("@/lib/transaction-writes/executor", () => ({
  executeTransactionWrites: vi.fn()
}));

vi.mock("@/lib/workflow/contract-routing", () => ({
  routeContractIntake: vi.fn()
}));

vi.mock("@/lib/workflow/evidence-reconciliation", () => ({
  reconcileTransactionEvidence: vi.fn()
}));

vi.mock("@/lib/workflow/memory-refresh", () => ({
  refreshTransactionMemory: vi.fn()
}));

vi.mock("@/lib/workflow/proactive-scheduling", () => ({
  scheduleAgentWakeup: vi.fn()
}));

vi.mock("@/lib/workflow/tasks", () => ({
  createOpeningTasks: vi.fn(),
  createTasksForMilestone: vi.fn()
}));

describe("processAgentMailInbound reliability guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeAgentMailInbound.mockReturnValue({
      eventId: "event-1",
      inboxId: "unknown-inbox",
      messageId: "message-1",
      threadId: "thread-1",
      from: "agent@example.com",
      to: ["tc@example.com"],
      cc: [],
      subject: "Contract",
      text: "See attached.",
      attachments: []
    });
    mocks.findTcProfileByInbox.mockResolvedValue(null);
    mocks.markWebhookEventProcessed.mockResolvedValue(undefined);
  });

  it("marks unknown inbox webhooks processed before ignoring them", async () => {
    await expect(
      processAgentMailInbound({
        webhookEventId: "webhook-1",
        agentMailEvent: { id: "event-1" }
      })
    ).resolves.toEqual({ status: "ignored", reason: "unknown_inbox" });

    expect(mocks.markWebhookEventProcessed).toHaveBeenCalledWith("webhook-1");
  });
});
