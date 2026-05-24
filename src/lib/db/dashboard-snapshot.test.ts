import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardSnapshotForUser } from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query
}));

describe("dashboard snapshot repository", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("returns enriched transaction rows and recent activity", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "tx-1",
            property_address: "123 Main St",
            status: "active",
            phase: "option_period",
            current_risk: "normal",
            effective_date: "2026-05-20",
            closing_date: "2026-06-20",
            created_at: "2026-05-20T10:00:00.000Z",
            updated_at: "2026-05-20T11:00:00.000Z",
            next_milestone_title: "Option period ends",
            next_milestone_due_date: "2026-05-27",
            next_milestone_risk_level: "watch",
            open_task_count: 4,
            waiting_response_task_count: 1,
            document_count: 6,
            outstanding_document_count: 2,
            open_blocker_count: 1,
            pending_approval_count: 1,
            latest_activity_title: "Built transaction plan",
            latest_activity_summary: "Stephanie created milestones and tasks.",
            latest_activity_status: "completed",
            latest_activity_occurred_at: "2026-05-20T11:00:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "activity-1",
            user_id: "user-1",
            transaction_id: "tx-1",
            property_address: "123 Main St",
            transaction_status: "active",
            agent_decision_id: null,
            source_type: "system",
            event_type: "transaction_plan_created",
            title: "Built transaction plan",
            summary: "Stephanie created milestones and tasks.",
            status: "completed",
            metadata: {},
            occurred_at: "2026-05-20T11:00:00.000Z"
          }
        ]
      });

    const snapshot = await getDashboardSnapshotForUser("user-1");

    expect(snapshot.transactions[0]).toMatchObject({
      id: "tx-1",
      next_milestone_title: "Option period ends",
      open_task_count: 4,
      outstanding_document_count: 2,
      pending_approval_count: 1,
      latest_activity_title: "Built transaction plan"
    });
    expect(snapshot.recentActivity[0]).toMatchObject({
      id: "activity-1",
      userId: "user-1",
      transactionId: "tx-1",
      transaction: {
        propertyAddress: "123 Main St",
        status: "active"
      }
    });

    const transactionQuery = mocks.query.mock.calls[0][0];
    expect(transactionQuery).toContain("next_milestone");
    expect(transactionQuery).toContain("open_task_count");
    expect(transactionQuery).toContain("outstanding_document_count");
    expect(transactionQuery).toContain("latest_activity");
  });
});
