import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findActivityEventDiagnosticsTarget,
  findActivityRunByImprovementCaseRunId,
  getDiagnosticsSourceRecords
} from "@/lib/db/repositories";

const mocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  query: mocks.query,
  withTransaction: vi.fn()
}));

function emptyRows() {
  return { rows: [] };
}

describe("getDiagnosticsSourceRecords", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("returns null when the run is not owned by the user", async () => {
    mocks.query.mockResolvedValueOnce(emptyRows());

    await expect(
      getDiagnosticsSourceRecords({
        activityRunId: "run-1",
        userId: "user-1"
      })
    ).resolves.toBeNull();

    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("loads a user-owned run and fans out from run and event metadata", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "run-1",
            user_id: "user-1",
            transaction_id: "tx-1",
            property_address: "100 Pecanwood South",
            transaction_status: "active",
            workflow_type: "inbound_email",
            title: "Inbound email",
            summary: "Processing inbound email.",
            status: "completed",
            metadata: {
              webhookEventId: "11111111-1111-1111-1111-111111111111",
              messageId: "message-1",
              threadId: "thread-1"
            },
            started_at: "2026-06-04T00:00:00.000Z",
            completed_at: "2026-06-04T00:02:00.000Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "event-1",
            user_id: "user-1",
            transaction_id: "tx-1",
            property_address: "100 Pecanwood South",
            transaction_status: "active",
            activity_run_id: "run-1",
            run_user_id: "user-1",
            run_transaction_id: "tx-1",
            run_property_address: "100 Pecanwood South",
            run_transaction_status: "active",
            run_workflow_type: "inbound_email",
            run_title: "Inbound email",
            run_summary: "Processing inbound email.",
            run_status: "completed",
            run_metadata: {
              messageId: "message-1"
            },
            run_started_at: "2026-06-04T00:00:00.000Z",
            run_completed_at: "2026-06-04T00:02:00.000Z",
            agent_decision_id: "22222222-2222-2222-2222-222222222222",
            source_type: "extraction",
            event_type: "contract_extraction_completed",
            title: "Extracted contract facts",
            summary: "Extracted facts.",
            status: "completed",
            metadata: {
              approvalId: "33333333-3333-3333-3333-333333333333",
              taskId: "44444444-4444-4444-4444-444444444444"
            },
            occurred_at: "2026-06-04T00:02:00.000Z"
          }
        ]
      });
    for (let index = 0; index < 17; index += 1) {
      mocks.query.mockResolvedValueOnce(emptyRows());
    }

    const records = await getDiagnosticsSourceRecords({
      activityRunId: "run-1",
      userId: "user-1"
    });

    expect(records?.run).toMatchObject({
      id: "run-1",
      workflowType: "inbound_email",
      transactionId: "tx-1"
    });
    expect(records?.events[0]).toMatchObject({
      id: "event-1",
      agentDecisionId: "22222222-2222-2222-2222-222222222222"
    });

    const messagesCall = mocks.query.mock.calls.find((call) =>
      String(call[0]).includes("from messages")
    );
    expect(messagesCall?.[1]).toEqual([
      ["tx-1"],
      ["message-1"],
      ["thread-1"]
    ]);

    const approvalsCall = mocks.query.mock.calls.find((call) =>
      String(call[0]).includes("from approvals")
    );
    expect(approvalsCall?.[1]).toEqual([
      ["tx-1"],
      ["22222222-2222-2222-2222-222222222222"],
      ["33333333-3333-3333-3333-333333333333"],
      ["44444444-4444-4444-4444-444444444444"]
    ]);
  });
});

describe("diagnostics lookup helpers", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("finds an activity run by improvement case run id", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "run-1",
          user_id: "user-1",
          workflow_type: "inbound_email",
          title: "Inbound email",
          status: "completed",
          started_at: "2026-06-09T12:00:00.000Z"
        }
      ]
    });

    await expect(
      findActivityRunByImprovementCaseRunId("case-run-1")
    ).resolves.toMatchObject({
      id: "run-1",
      user_id: "user-1"
    });

    expect(String(mocks.query.mock.calls[0][0])).toContain(
      "improvementCaseRunId"
    );
    expect(mocks.query.mock.calls[0][1]).toEqual(["case-run-1"]);
  });

  it("finds the run and owner for one event drilldown", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          event_id: "event-1",
          user_id: "user-1",
          activity_run_id: "run-1"
        }
      ]
    });

    await expect(findActivityEventDiagnosticsTarget("event-1")).resolves.toEqual({
      event_id: "event-1",
      user_id: "user-1",
      activity_run_id: "run-1"
    });
  });
});
