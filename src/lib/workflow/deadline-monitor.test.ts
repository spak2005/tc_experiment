import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDeadlineRisk } from "@/lib/workflow/deadline-monitor";
import { findAtRiskMilestones } from "@/lib/db/repositories";

vi.mock("@/lib/time/clock", () => ({
  getTemporalContext: vi.fn(() => ({
    now: "2026-05-13T20:18:00-05:00",
    today: "2026-05-13",
    timezone: "America/Chicago",
    businessDay: true
  }))
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: vi.fn(),
  createAuditEvent: vi.fn(),
  createBlocker: vi.fn(),
  findAtRiskMilestones: vi.fn(async () => [])
}));

vi.mock("@/lib/agentmail/service", () => ({
  sendTcEmail: vi.fn()
}));

describe("checkDeadlineRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the app temporal context for at-risk milestone lookup", async () => {
    await checkDeadlineRisk();

    expect(findAtRiskMilestones).toHaveBeenCalledWith(2, "2026-05-13");
  });
});
