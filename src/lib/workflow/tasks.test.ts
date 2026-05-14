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
      followUpDueDate: "2026-05-20",
      metadata: {
        expectedEvidence: ["title commitment"]
      }
    });
  });
});
