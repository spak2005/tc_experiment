import { describe, expect, it } from "vitest";
import type { ProactiveAgentContext } from "@/lib/agent/proactive-context";
import { computeNextHeartbeat } from "@/lib/workflow/proactive-scheduling";

function context(overrides: Partial<ProactiveAgentContext["transactionContext"]> = {}) {
  return {
    temporalContext: {
      today: "2026-05-14",
      now: "2026-05-14T15:00:00.000Z",
      timezone: "America/Chicago",
      businessDay: true
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
      transaction: {
        id: "tx-1",
        status: "active",
        phase: "financing_appraisal"
      },
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
      missingItems: [],
      ...overrides
    }
  } satisfies ProactiveAgentContext;
}

const now = new Date("2026-05-14T15:00:00.000Z");

describe("computeNextHeartbeat", () => {
  it("uses a daily cadence for normal active transactions", () => {
    const next = computeNextHeartbeat({ context: context(), now });

    expect(next).toMatchObject({
      intervalHours: 24,
      reason: "Daily active transaction heartbeat."
    });
    expect(next?.wakeAt).toBe("2026-05-15T15:00:00.000Z");
  });

  it("uses a 12 hour cadence while opening the file", () => {
    const next = computeNextHeartbeat({
      context: context({ transaction: { status: "active", phase: "opening_file" } }),
      now
    });

    expect(next?.intervalHours).toBe(12);
    expect(next?.wakeAt).toBe("2026-05-15T03:00:00.000Z");
  });

  it("uses a 4 hour cadence for deadlines within 72 hours", () => {
    const next = computeNextHeartbeat({
      context: context({
        milestones: [
          {
            title: "Option period expires",
            due_date: "2026-05-16",
            completed_at: null
          }
        ]
      }),
      now
    });

    expect(next?.intervalHours).toBe(4);
  });

  it("uses a 1 hour cadence for critical blockers", () => {
    const next = computeNextHeartbeat({
      context: context({
        blockers: [
          {
            title: "Funding problem",
            risk_level: "critical"
          }
        ]
      }),
      now
    });

    expect(next?.intervalHours).toBe(1);
  });

  it("does not schedule heartbeats for closed transactions", () => {
    const next = computeNextHeartbeat({
      context: context({ transaction: { status: "closed", phase: "closing_funding" } }),
      now
    });

    expect(next).toBeUndefined();
  });
});
