import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPendingAgentWakeups,
  claimDueAgentWakeups,
  completeAgentWakeup,
  createAgentWakeup,
  failAgentWakeup
} from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  withTransaction: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query,
  withTransaction: mocks.withTransaction
}));

function wakeupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wake-1",
    user_id: "team-1",
    transaction_id: "tx-1",
    task_id: null,
    action_type: "transaction_heartbeat",
    reason: "Review transaction",
    status: "pending",
    dedupe_key: "tx-1:heartbeat",
    wake_at: "2026-05-14T15:00:00.000Z",
    payload: {},
    preconditions: {},
    attempt_count: 0,
    max_attempts: 3,
    locked_at: null,
    locked_by: null,
    last_error: null,
    completed_at: null,
    cancelled_at: null,
    created_at: "2026-05-14T14:00:00.000Z",
    updated_at: "2026-05-14T14:00:00.000Z",
    ...overrides
  };
}

describe("agent wakeup repositories", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.clientQuery.mockReset();
    mocks.withTransaction.mockReset();
  });

  it("creates or dedupes a pending wakeup", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [wakeupRow()] });

    const wakeup = await createAgentWakeup({
      userId: "team-1",
      transactionId: "tx-1",
      actionType: "transaction_heartbeat",
      reason: "Review transaction",
      dedupeKey: "tx-1:heartbeat",
      wakeAt: "2026-05-14T15:00:00.000Z"
    });

    expect(wakeup).toMatchObject({
      id: "wake-1",
      transactionId: "tx-1",
      actionType: "transaction_heartbeat",
      status: "pending"
    });
    expect(mocks.query.mock.calls[0][0]).toContain("on conflict (dedupe_key)");
  });

  it("marks a wakeup completed or skipped", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [wakeupRow({ status: "skipped", completed_at: "2026-05-14T15:01:00.000Z" })]
    });

    const wakeup = await completeAgentWakeup({
      id: "wake-1",
      status: "skipped",
      payload: { result: "noop" }
    });

    expect(wakeup?.status).toBe("skipped");
    expect(mocks.query.mock.calls[0][1]).toEqual(["wake-1", "skipped", "{\"result\":\"noop\"}"]);
  });

  it("reschedules failed wakeups until max attempts", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        wakeupRow({
          status: "pending",
          attempt_count: 1,
          last_error: "temporary failure",
          wake_at: "2026-05-14T15:30:00.000Z"
        })
      ]
    });

    const wakeup = await failAgentWakeup({
      id: "wake-1",
      error: "temporary failure",
      retryAt: "2026-05-14T15:30:00.000Z"
    });

    expect(wakeup?.status).toBe("pending");
    expect(wakeup?.lastError).toBe("temporary failure");
  });

  it("cancels pending wakeups for a transaction", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [wakeupRow({ status: "cancelled", cancelled_at: "2026-05-14T15:01:00.000Z" })]
    });

    const wakeups = await cancelPendingAgentWakeups({
      transactionId: "tx-1",
      actionType: "transaction_heartbeat",
      reason: "Transaction closed"
    });

    expect(wakeups).toHaveLength(1);
    expect(wakeups[0].status).toBe("cancelled");
  });

  it("claims due wakeups inside a transaction", async () => {
    mocks.clientQuery.mockResolvedValueOnce({
      rows: [
        wakeupRow({
          status: "running",
          attempt_count: 1,
          locked_by: "worker-1",
          locked_at: "2026-05-14T15:00:00.000Z"
        })
      ]
    });
    mocks.withTransaction.mockImplementationOnce(async (callback) =>
      callback({ query: mocks.clientQuery })
    );

    const wakeups = await claimDueAgentWakeups({
      now: "2026-05-14T15:00:00.000Z",
      limit: 10,
      workerId: "worker-1"
    });

    expect(wakeups[0]).toMatchObject({
      status: "running",
      attemptCount: 1,
      lockedBy: "worker-1"
    });
    expect(mocks.clientQuery.mock.calls[0][0]).toContain("for update skip locked");
  });
});
