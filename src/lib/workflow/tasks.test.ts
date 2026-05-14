import { describe, expect, it } from "vitest";
import { createTasksForMilestone } from "@/lib/workflow/tasks";

describe("createTasksForMilestone", () => {
  it("copies operational metadata from milestones into tasks", () => {
    const [task] = createTasksForMilestone({
      key: "title_commitment_due",
      title: "Title commitment due",
      phase: "title_survey_disclosures",
      dueDate: "2026-05-20",
      sourceType: "derived_event",
      riskLevel: "watch",
      metadata: {
        ownerRole: "title",
        expectedEvidence: ["title commitment"],
        staleAfterDays: 2
      }
    });

    expect(task).toMatchObject({
      ownerRole: "title",
      dueDate: "2026-05-20",
      status: "not_started",
      metadata: {
        expectedEvidence: ["title commitment"],
        staleAfterDays: 2
      }
    });
  });

  it("leaves followUpDueDate unset at creation so the send transition can fill it in later", () => {
    const [task] = createTasksForMilestone({
      key: "earnest_money_due",
      title: "Earnest money due",
      phase: "earnest_money_and_option",
      dueDate: "2026-05-15",
      sourceType: "anchor_offset",
      riskLevel: "urgent",
      metadata: {
        ownerRole: "title",
        staleAfterDays: 1
      }
    });

    expect(task.followUpDueDate).toBeUndefined();
  });
});
