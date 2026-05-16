import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentActivityEvent: vi.fn(),
  findOpenTasksByOwnerRole: vi.fn(),
  findPartyRolesByEmails: vi.fn(),
  getTaskById: vi.fn(),
  upsertTaskRecord: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => mocks);

import {
  DEFAULT_STALE_AFTER_DAYS,
  readStaleAfterDays,
  resolveTaskFollowUpDate,
  transitionOutboundTaskToWaitingResponse
} from "@/lib/workflow/task-transitions";

describe("readStaleAfterDays", () => {
  it("returns the metadata value when present and positive", () => {
    expect(readStaleAfterDays({ staleAfterDays: 3 })).toBe(3);
  });

  it("falls back to default when metadata is missing", () => {
    expect(readStaleAfterDays(undefined)).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({})).toBe(DEFAULT_STALE_AFTER_DAYS);
  });

  it("ignores non-numeric or non-positive values", () => {
    expect(readStaleAfterDays({ staleAfterDays: "two" })).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({ staleAfterDays: 0 })).toBe(DEFAULT_STALE_AFTER_DAYS);
    expect(readStaleAfterDays({ staleAfterDays: -1 })).toBe(DEFAULT_STALE_AFTER_DAYS);
  });

  it("floors fractional values", () => {
    expect(readStaleAfterDays({ staleAfterDays: 2.7 })).toBe(2);
  });
});

describe("resolveTaskFollowUpDate", () => {
  it("computes today plus staleAfterDays in calendar days", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13",
        metadata: { staleAfterDays: 2 }
      })
    ).toBe("2026-05-15");
  });

  it("uses the default offset when metadata is missing", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13"
      })
    ).toBe("2026-05-15");
  });

  it("crosses month boundaries", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-30",
        metadata: { staleAfterDays: 3 }
      })
    ).toBe("2026-06-02");
  });

  it("prefers an explicit override over the metadata", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "2026-05-13",
        metadata: { staleAfterDays: 5 },
        staleAfterDaysOverride: 1
      })
    ).toBe("2026-05-14");
  });

  it("returns undefined when today cannot be parsed", () => {
    expect(
      resolveTaskFollowUpDate({
        today: "not-a-date"
      })
    ).toBeUndefined();
  });
});

describe("transitionOutboundTaskToWaitingResponse", () => {
  beforeEach(() => {
    mocks.createAgentActivityEvent.mockReset();
    mocks.findOpenTasksByOwnerRole.mockReset();
    mocks.findPartyRolesByEmails.mockReset();
    mocks.getTaskById.mockReset();
    mocks.upsertTaskRecord.mockReset();
  });

  const baseInput = {
    userId: "team-1",
    transactionId: "tx-1",
    recipientEmails: ["title@example.com"],
    today: "2026-05-13",
    agentDecisionId: "decision-1"
  };

  it("flips the task identified by the LLM provided taskId", async () => {
    mocks.getTaskById.mockResolvedValueOnce({
      id: "task-1",
      transaction_id: "tx-1",
      title: "Earnest money due",
      owner_role: "title",
      status: "not_started",
      due_date: "2026-05-15",
      follow_up_due_date: null,
      metadata: { staleAfterDays: 1 }
    });

    const result = await transitionOutboundTaskToWaitingResponse({
      ...baseInput,
      taskId: "task-1"
    });

    expect(result).toEqual({
      status: "transitioned",
      reason: "task_id",
      taskId: "task-1",
      followUpDueDate: "2026-05-14"
    });
    expect(mocks.upsertTaskRecord).toHaveBeenCalledWith({
      transactionId: "tx-1",
      id: "task-1",
      status: "waiting_response",
      followUpDueDate: "2026-05-14"
    });
    expect(mocks.findOpenTasksByOwnerRole).not.toHaveBeenCalled();
  });

  it("falls back to owner-role match when no taskId is supplied", async () => {
    mocks.findPartyRolesByEmails.mockResolvedValueOnce(["title"]);
    mocks.findOpenTasksByOwnerRole.mockResolvedValueOnce([
      {
        id: "task-2",
        transaction_id: "tx-1",
        title: "Title commitment due",
        owner_role: "title",
        status: "not_started",
        due_date: null,
        follow_up_due_date: null,
        metadata: { staleAfterDays: 2 }
      }
    ]);

    const result = await transitionOutboundTaskToWaitingResponse(baseInput);

    expect(result.status).toBe("transitioned");
    expect(result.reason).toBe("owner_role");
    expect(result.followUpDueDate).toBe("2026-05-15");
    expect(mocks.upsertTaskRecord).toHaveBeenCalledWith({
      transactionId: "tx-1",
      id: "task-2",
      status: "waiting_response",
      followUpDueDate: "2026-05-15"
    });
  });

  it("skips and logs when no party email matches", async () => {
    mocks.findPartyRolesByEmails.mockResolvedValueOnce([]);

    const result = await transitionOutboundTaskToWaitingResponse(baseInput);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_external_recipient");
    expect(mocks.upsertTaskRecord).not.toHaveBeenCalled();
    expect(mocks.createAgentActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "outbound_task_transition_skipped",
        status: "ignored"
      })
    );
  });

  it("skips when multiple open tasks share the owner role", async () => {
    mocks.findPartyRolesByEmails.mockResolvedValueOnce(["title"]);
    mocks.findOpenTasksByOwnerRole.mockResolvedValueOnce([
      {
        id: "task-a",
        transaction_id: "tx-1",
        title: "Earnest money due",
        owner_role: "title",
        status: "not_started",
        due_date: "2026-05-15",
        follow_up_due_date: null,
        metadata: {}
      },
      {
        id: "task-b",
        transaction_id: "tx-1",
        title: "Title commitment due",
        owner_role: "title",
        status: "not_started",
        due_date: "2026-06-01",
        follow_up_due_date: null,
        metadata: {}
      }
    ]);

    const result = await transitionOutboundTaskToWaitingResponse(baseInput);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("ambiguous");
    expect(mocks.upsertTaskRecord).not.toHaveBeenCalled();
  });

  it("ignores realtor-internal recipients", async () => {
    mocks.findPartyRolesByEmails.mockResolvedValueOnce(["agent"]);

    const result = await transitionOutboundTaskToWaitingResponse({
      ...baseInput,
      recipientEmails: ["agent@example.com"]
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_external_recipient");
    expect(mocks.findOpenTasksByOwnerRole).not.toHaveBeenCalled();
  });
});
