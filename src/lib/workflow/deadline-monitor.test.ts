import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDeadlineRisk } from "@/lib/workflow/deadline-monitor";
import {
  createOrGetOpenDeadlineBlocker,
  createOrGetOpenTaskBlocker,
  findAtRiskMilestones,
  findStaleResponseTasks
} from "@/lib/db/repositories";
import { sendTcEmailOnce } from "@/lib/agentmail/service";

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
  createOrGetOpenDeadlineBlocker: vi.fn(async () => ({ id: "blocker-1", inserted: true })),
  createOrGetOpenTaskBlocker: vi.fn(async () => ({ id: "blocker-1", inserted: true })),
  findAtRiskMilestones: vi.fn(async () => []),
  findStaleResponseTasks: vi.fn(async () => [])
}));

vi.mock("@/lib/agentmail/service", () => ({
  sendTcEmailOnce: vi.fn()
}));

describe("checkDeadlineRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the app temporal context for at-risk milestone lookup", async () => {
    await checkDeadlineRisk();

    expect(findAtRiskMilestones).toHaveBeenCalledWith(2, "2026-05-13");
    expect(findStaleResponseTasks).toHaveBeenCalledWith("2026-05-13");
  });

  it("escalates stale response tasks once the repository returns them", async () => {
    vi.mocked(findStaleResponseTasks).mockResolvedValue([
      {
        transaction_id: "tx-1",
        team_id: "team-1",
        property_address: "123 Main St",
        task_id: "task-1",
        title: "Confirm title receipt",
        owner_role: "title",
        due_date: "2026-05-12",
        follow_up_due_date: "2026-05-13",
        escalation_email: "agent@example.com",
        inbox_id: "tc-inbox-1"
      }
    ]);

    const results = await checkDeadlineRisk();

    expect(sendTcEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "task:task-1:stale-escalation",
        to: ["agent@example.com"],
        labels: ["escalation", "stale_response"]
      })
    );
    expect(createOrGetOpenTaskBlocker).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "tx-1",
        taskId: "task-1",
        title: "Stale response: Confirm title receipt"
      })
    );
    expect(results).toEqual([{ transactionId: "tx-1", blockerId: "blocker-1" }]);
  });

  it("does not create a blocker when escalation sending fails", async () => {
    vi.mocked(findStaleResponseTasks).mockResolvedValue([
      {
        transaction_id: "tx-1",
        team_id: "team-1",
        property_address: "123 Main St",
        task_id: "task-1",
        title: "Confirm title receipt",
        owner_role: "title",
        due_date: "2026-05-12",
        follow_up_due_date: "2026-05-13",
        escalation_email: "agent@example.com",
        inbox_id: "tc-inbox-1"
      }
    ]);
    vi.mocked(sendTcEmailOnce).mockRejectedValueOnce(new Error("AgentMail down"));

    await expect(checkDeadlineRisk()).rejects.toThrow("AgentMail down");

    expect(createOrGetOpenTaskBlocker).not.toHaveBeenCalled();
  });
});
