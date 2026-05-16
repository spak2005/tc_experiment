import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshTransactionMemory } from "@/lib/workflow/memory-refresh";
import type { TransactionContext } from "@/lib/agent/types";

const mocks = vi.hoisted(() => ({
  createAgentActivityEvent: vi.fn(),
  upsertTransactionMemory: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => mocks);

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => {
    throw new Error("LLM unavailable");
  },
  getAnthropicModel: () => "test-model"
}));

function context(overrides: Partial<TransactionContext> = {}): TransactionContext {
  return {
    transaction: {
      id: "tx-1",
      property_address: "123 Main St",
      status: "active",
      phase: "opening_file",
      current_risk: "watch",
      closing_date: "2026-06-15"
    },
    facts: undefined,
    canonicalFacts: [],
    recentChanges: [],
    milestones: [
      {
        key: "appraisal_deadline",
        title: "Appraisal deadline",
        due_date: "2026-05-25",
        completed_at: null
      }
    ],
    tasks: [
      {
        id: "task-1",
        title: "Confirm appraisal access",
        owner_role: "appraiser",
        status: "waiting_response",
        due_date: "2026-05-20"
      }
    ],
    documents: [],
    messages: [],
    blockers: [
      {
        id: "blocker-1",
        title: "Appraisal access missing",
        risk_level: "watch"
      }
    ],
    memory: undefined,
    dealMemory: {
      dealBrief: "",
      activeQuestionsAndWarnings: []
    },
    recentDecisions: [],
    nextMilestone: {
      key: "appraisal_deadline",
      title: "Appraisal deadline",
      due_date: "2026-05-25"
    },
    missingItems: ["Confirm whether appraisal access is scheduled."],
    ...overrides
  };
}

describe("refreshTransactionMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to a concise deal brief and active questions", async () => {
    const result = await refreshTransactionMemory({
      userId: "user-1",
      transactionId: "tx-1",
      context: context(),
      reason: "test_refresh",
      sourceReference: "test"
    });

    expect(result.mode).toBe("fallback");
    expect(result.dealBrief).toContain("123 Main St");
    expect(result.dealBrief).toContain("Appraisal access missing");
    expect(result.activeQuestionsAndWarnings).toContain(
      "Confirm whether appraisal access is scheduled."
    );
    expect(mocks.upsertTransactionMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "tx-1",
        summary: result.dealBrief,
        openQuestions: result.activeQuestionsAndWarnings,
        knownContext: expect.objectContaining({
          lastMemoryRefreshReason: "test_refresh",
          lastMemoryRefreshMode: "fallback"
        })
      })
    );
    expect(mocks.createAgentActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "transaction_memory_refreshed",
        metadata: expect.objectContaining({
          mode: "fallback",
          questionCount: result.activeQuestionsAndWarnings.length
        })
      })
    );
  });
});
