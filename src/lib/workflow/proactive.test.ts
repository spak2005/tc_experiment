import { beforeEach, describe, expect, it, vi } from "vitest";
import { processDueAgentWakeups } from "@/lib/workflow/proactive";
import type { AgentWakeup } from "@/lib/domain/types";

const mocks = vi.hoisted(() => ({
  claimDueAgentWakeups: vi.fn(),
  completeAgentWakeup: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createAgentDecisionOnce: vi.fn(),
  createApprovalOnce: vi.fn(),
  createAuditEvent: vi.fn(),
  failAgentWakeup: vi.fn(),
  updateAgentDecisionExecution: vi.fn(),
  updateApprovalRequestMetadata: vi.fn(),
  buildProactiveAgentContext: vi.fn(),
  decideProactiveAction: vi.fn(),
  executeTransactionWrites: vi.fn(),
  sendTcEmailOnce: vi.fn(),
  extractAgentMailMessageMetadata: vi.fn(),
  transitionOutboundTaskToWaitingResponse: vi.fn(),
  scheduleAgentWakeup: vi.fn(),
  scheduleNextHeartbeat: vi.fn(),
  cancelScheduledWakeups: vi.fn(),
  refreshTransactionMemory: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => ({
  claimDueAgentWakeups: mocks.claimDueAgentWakeups,
  completeAgentWakeup: mocks.completeAgentWakeup,
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createAgentDecisionOnce: mocks.createAgentDecisionOnce,
  createApprovalOnce: mocks.createApprovalOnce,
  createAuditEvent: mocks.createAuditEvent,
  failAgentWakeup: mocks.failAgentWakeup,
  updateAgentDecisionExecution: mocks.updateAgentDecisionExecution,
  updateApprovalRequestMetadata: mocks.updateApprovalRequestMetadata
}));

vi.mock("@/lib/agent/proactive-context", () => ({
  buildProactiveAgentContext: mocks.buildProactiveAgentContext
}));

vi.mock("@/lib/agent/proactive-planner", () => ({
  decideProactiveAction: mocks.decideProactiveAction
}));

vi.mock("@/lib/transaction-writes/executor", () => ({
  executeTransactionWrites: mocks.executeTransactionWrites
}));

vi.mock("@/lib/agentmail/service", () => ({
  sendTcEmailOnce: mocks.sendTcEmailOnce,
  extractAgentMailMessageMetadata: mocks.extractAgentMailMessageMetadata
}));

vi.mock("@/lib/workflow/task-transitions", () => ({
  transitionOutboundTaskToWaitingResponse: mocks.transitionOutboundTaskToWaitingResponse
}));

vi.mock("@/lib/workflow/proactive-scheduling", () => ({
  scheduleAgentWakeup: mocks.scheduleAgentWakeup,
  scheduleNextHeartbeat: mocks.scheduleNextHeartbeat,
  cancelScheduledWakeups: mocks.cancelScheduledWakeups
}));

vi.mock("@/lib/workflow/memory-refresh", () => ({
  refreshTransactionMemory: mocks.refreshTransactionMemory
}));

function wakeup(overrides: Partial<AgentWakeup> = {}): AgentWakeup {
  return {
    id: "wake-1",
    userId: "user-1",
    transactionId: "tx-1",
    actionType: "transaction_heartbeat",
    reason: "Daily review",
    status: "running",
    dedupeKey: "tx-1:transaction_heartbeat:transaction",
    wakeAt: "2026-05-14T15:00:00.000Z",
    payload: {},
    preconditions: {},
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-05-14T14:00:00.000Z",
    updatedAt: "2026-05-14T15:00:00.000Z",
    ...overrides
  };
}

function proactiveContext() {
  return {
    temporalContext: {
      today: "2026-05-14",
      nowIso: "2026-05-14T15:00:00.000Z",
      timeZone: "America/Chicago"
    },
    tcProfile: {
      id: "tc-1",
      userId: "user-1",
      displayName: "TC",
      inboxAddress: "tc@example.com",
      inboxId: "inbox-1",
      escalationEmail: "agent@example.com"
    },
    transactionId: "tx-1",
    parties: [],
    transactionContext: {
      transaction: { id: "tx-1", status: "active" },
      canonicalFacts: [],
      recentChanges: [],
      milestones: [],
      tasks: [],
      documents: [],
      messages: [],
      blockers: [],
      dealMemory: {
        dealBrief: "",
        activeQuestionsAndWarnings: []
      },
      recentDecisions: [],
      missingItems: []
    }
  };
}

describe("processDueAgentWakeups", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.createAgentDecisionOnce.mockResolvedValue({ id: "decision-1" });
    mocks.executeTransactionWrites.mockResolvedValue([]);
    mocks.completeAgentWakeup.mockResolvedValue(wakeup({ status: "completed" }));
    mocks.scheduleNextHeartbeat.mockResolvedValue(undefined);
    mocks.cancelScheduledWakeups.mockResolvedValue([]);
  });

  it("exits cheaply when no wakeups are due", async () => {
    mocks.claimDueAgentWakeups.mockResolvedValue([]);

    const result = await processDueAgentWakeups({
      now: new Date("2026-05-14T15:00:00.000Z"),
      workerId: "worker-1"
    });

    expect(result).toEqual({ claimed: 0, results: [] });
    expect(mocks.buildProactiveAgentContext).not.toHaveBeenCalled();
  });

  it("executes a claimed wakeup and marks it complete", async () => {
    mocks.claimDueAgentWakeups.mockResolvedValue([wakeup()]);
    mocks.buildProactiveAgentContext.mockResolvedValue(proactiveContext());
    mocks.decideProactiveAction.mockResolvedValue({
      action: "noop",
      confidence: 0.8,
      rationale: "Nothing to do",
      requiresApproval: false,
      transactionWrites: []
    });

    const result = await processDueAgentWakeups({
      now: new Date("2026-05-14T15:00:00.000Z"),
      workerId: "worker-1"
    });

    expect(result.claimed).toBe(1);
    expect(mocks.completeAgentWakeup).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wake-1",
        status: "skipped"
      })
    );
    expect(mocks.updateAgentDecisionExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "decision-1",
        policyResult: "allowed"
      })
    );
  });

  it("reschedules a wakeup when execution throws", async () => {
    mocks.claimDueAgentWakeups.mockResolvedValue([wakeup()]);
    mocks.buildProactiveAgentContext.mockRejectedValue(new Error("context exploded"));
    mocks.failAgentWakeup.mockResolvedValue(
      wakeup({
        status: "pending",
        lastError: "context exploded",
        wakeAt: "2026-05-14T15:30:00.000Z"
      })
    );

    const result = await processDueAgentWakeups({
      now: new Date("2026-05-14T15:00:00.000Z"),
      workerId: "worker-1"
    });

    expect(result.results[0]).toMatchObject({
      wakeupId: "wake-1",
      status: "pending",
      error: "context exploded"
    });
    expect(mocks.failAgentWakeup).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wake-1",
        error: "context exploded",
        retryAt: "2026-05-14T15:30:00.000Z"
      })
    );
  });

  it("creates approval requests with the proactive task id for external outreach", async () => {
    const taskId = "33333333-3333-4333-8333-333333333333";
    mocks.claimDueAgentWakeups.mockResolvedValue([wakeup({ taskId })]);
    mocks.buildProactiveAgentContext.mockResolvedValue(proactiveContext());
    mocks.decideProactiveAction.mockResolvedValue({
      action: "draft_external_email",
      confidence: 0.9,
      rationale: "Title contact is known",
      taskId,
      requiresApproval: true,
      response: {
        subject: "New contract: 123 Main St",
        body: "Hi there,\n\nPlease confirm receipt.",
        to: ["title@example.com"],
        labels: ["proactive", "opening_title"]
      },
      transactionWrites: []
    });
    mocks.createApprovalOnce.mockResolvedValue({ id: "approval-1" });
    mocks.sendTcEmailOnce.mockResolvedValue({ id: "request-message" });
    mocks.extractAgentMailMessageMetadata.mockReturnValue({
      messageId: "request-message",
      threadId: "request-thread"
    });

    await processDueAgentWakeups({
      now: new Date("2026-05-14T15:00:00.000Z"),
      workerId: "worker-1"
    });

    expect(mocks.createApprovalOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("approval:decision-1:"),
        taskId,
        proposedTo: ["title@example.com"]
      })
    );
    expect(mocks.sendTcEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "approval:approval-1:request",
        to: ["agent@example.com"],
        labels: ["approval_request", "proactive", "draft_external_email"]
      })
    );
  });
});
