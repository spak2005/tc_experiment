import { describe, expect, it } from "vitest";
import {
  buildDashboardSummary,
  documentProgressLabel,
  formatDashboardDate,
  humanizeDashboardValue,
  pluralizeDashboardCount
} from "@/app/dashboard/dashboard-view";

describe("dashboard view helpers", () => {
  it("summarizes active files, waiting items, and open tasks", () => {
    expect(
      buildDashboardSummary({
        transactions: [{ open_task_count: 3 }, { open_task_count: 2 }],
        approvals: [{ id: "approval-1" }],
        blockers: [{ id: "blocker-1" }, { id: "blocker-2" }]
      })
    ).toEqual({
      activeFiles: 2,
      waitingOnYou: 3,
      openTasks: 5
    });
  });

  it("formats dashboard labels for empty and active states", () => {
    expect(documentProgressLabel({ document_count: 7, outstanding_document_count: 3 })).toBe(
      "4/7 ready"
    );
    expect(formatDashboardDate(null)).toBe("Pending");
    expect(humanizeDashboardValue("waiting_response")).toBe("waiting response");
    expect(pluralizeDashboardCount(1, "approval")).toBe("1 approval");
    expect(pluralizeDashboardCount(2, "approval")).toBe("2 approvals");
  });
});
