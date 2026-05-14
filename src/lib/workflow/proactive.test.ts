import { beforeEach, describe, expect, it, vi } from "vitest";
import { processDueAgentWakeups } from "@/lib/workflow/proactive";
import type { AgentWakeup } from "@/lib/domain/types";

const mocks = vi.hoisted(() => ({
  claimDueAgentWakeups: vi.fn(),
  completeAgentWakeup: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createAgentDecision: vi.fn(),
  createApproval: vi.fn(),
  createAuditEvent: vi.fn(),
  failAgentWakeup: vi.fn(),
  updateAgentDecisionExecution: vi.fn(),
  updateApprovalRequestMetadata: vi.fn(),
  buildProactiveAgentContext: vi.fn(),
  decideProactiveAction: vi.fn(),
  executeTransactionWrites: vi.fn(),
  sendTcEmail: vi.fn(),
  extractAgentMailMessageMetadata: vi.fn(),
  transitionOutboundTaskToWaitingResponse: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => ({
  claimDueAgentWakeups: mocks.claimDueAgentWakeups,
  completeAgentWakeup: mocks.completeAgentWakeup,
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createAgentDecision: mocks.createAgentDecision,
  createApproval: mocks.createApproval,
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
  sendTcEmail: mocks.sendTcEmail,
  extractAgentMailMessageMetadata: mocks.extractAgentMailMessageMetadata
}));

vi.mock("@/lib/workflow/task-transitions", () => ({
  transitionOutboundTaskToWaitingResponse: mocks.transitionOutboundTaskToWaitingResponse
}));

function wakeup(overrides: Partial<AgentWakeup> = {}): AgentWakeup {
  return {
    id: "wake-1",
    teamId: "team-1",
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
      teamId: "team-1",
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
    mocks.createAgentDecision.mockResolvedValue({ id: "decision-1" });
    mocks.executeTransactionWrites.mockResolvedValue([]);
    mocks.completeAgentWakeup.mockResolvedValue(wakeup({ status: "completed" }));
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
});
