import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAtRiskMilestones, findStaleResponseTasks } from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query,
  withTransaction: vi.fn()
}));

describe("deadline query gates", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("only returns at-risk milestones for coordination-enabled transactions", async () => {
    await findAtRiskMilestones(2, "2026-06-04");

    expect(String(mocks.query.mock.calls[0][0])).toContain(
      "t.coordination_enabled = true"
    );
  });

  it("only returns stale tasks for coordination-enabled transactions", async () => {
    await findStaleResponseTasks("2026-06-04");

    expect(String(mocks.query.mock.calls[0][0])).toContain(
      "t.coordination_enabled = true"
    );
  });
});
