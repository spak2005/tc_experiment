import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/calendar-feeds/[token]/route";

const mocks = vi.hoisted(() => ({
  getCalendarFeedByToken: vi.fn(),
  markCalendarFeedAccessed: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => ({
  getCalendarFeedByToken: mocks.getCalendarFeedByToken,
  markCalendarFeedAccessed: mocks.markCalendarFeedAccessed
}));

describe("calendar feed route", () => {
  beforeEach(() => {
    mocks.getCalendarFeedByToken.mockReset();
    mocks.markCalendarFeedAccessed.mockReset();
  });

  it("serves an ICS calendar for a valid token", async () => {
    mocks.getCalendarFeedByToken.mockResolvedValueOnce({
      feed: {
        id: "feed-1",
        transactionId: "tx-1",
        token: "token-1",
        createdAt: "2026-06-03T10:00:00.000Z"
      },
      transaction: {
        id: "tx-1",
        userId: "user-1",
        propertyAddress: "123 Main St",
        status: "active"
      },
      milestones: [
        {
          id: "milestone-1",
          key: "closing_date",
          title: "Closing date",
          phase: "closing_funding",
          dueDate: "2026-06-30",
          riskLevel: "critical",
          metadata: {}
        }
      ]
    });

    const response = await GET(new Request("https://tc.example.com"), {
      params: Promise.resolve({ token: "token-1" })
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:Closing date");
    expect(mocks.markCalendarFeedAccessed).toHaveBeenCalledWith("token-1");
  });

  it("returns not found for invalid tokens", async () => {
    mocks.getCalendarFeedByToken.mockResolvedValueOnce(null);

    const response = await GET(new Request("https://tc.example.com"), {
      params: Promise.resolve({ token: "missing" })
    });

    expect(response.status).toBe(404);
    expect(mocks.markCalendarFeedAccessed).not.toHaveBeenCalled();
  });
});
