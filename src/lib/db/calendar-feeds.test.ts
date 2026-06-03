import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrReuseTransactionCalendarFeed,
  getCalendarFeedByToken,
  markCalendarFeedAccessed
} from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query,
  withTransaction: vi.fn()
}));

function feedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "feed-1",
    transaction_id: "tx-1",
    token: "token-1",
    created_at: "2026-06-03T10:00:00.000Z",
    revoked_at: null,
    last_accessed_at: null,
    ...overrides
  };
}

describe("calendar feed repositories", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("creates or reuses an active transaction feed token", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [feedRow()] });

    const feed = await createOrReuseTransactionCalendarFeed({ transactionId: "tx-1" });

    expect(feed).toMatchObject({
      id: "feed-1",
      transactionId: "tx-1",
      token: "token-1"
    });
    expect(mocks.query.mock.calls[0][0]).toContain("revoked_at is null");
    expect(mocks.query.mock.calls[0][1][0]).toBe("tx-1");
    expect(typeof mocks.query.mock.calls[0][1][1]).toBe("string");
  });

  it("resolves an active token to transaction milestones", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            feed_id: "feed-1",
            transaction_id: "tx-1",
            token: "token-1",
            feed_created_at: "2026-06-03T10:00:00.000Z",
            revoked_at: null,
            last_accessed_at: null,
            user_id: "user-1",
            property_address: "123 Main St",
            status: "active",
            phase: "opening_file",
            effective_date: "2026-06-01",
            closing_date: "2026-06-30"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "milestone-1",
            key: "closing_date",
            title: "Closing date",
            phase: "closing_funding",
            due_date: "2026-06-30",
            source_reference: "Paragraph 9A",
            risk_level: "critical",
            completed_at: null,
            metadata: { ownerRole: "title" }
          }
        ]
      });

    const feed = await getCalendarFeedByToken("token-1");

    expect(feed?.transaction).toMatchObject({
      id: "tx-1",
      userId: "user-1",
      propertyAddress: "123 Main St"
    });
    expect(feed?.milestones).toEqual([
      expect.objectContaining({
        key: "closing_date",
        dueDate: "2026-06-30",
        metadata: { ownerRole: "title" }
      })
    ]);
  });

  it("does not resolve missing or revoked tokens", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(getCalendarFeedByToken("missing-token")).resolves.toBeNull();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("marks active feeds as accessed", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await markCalendarFeedAccessed("token-1");

    expect(mocks.query.mock.calls[0][0]).toContain("last_accessed_at = now()");
    expect(mocks.query.mock.calls[0][1]).toEqual(["token-1"]);
  });
});
