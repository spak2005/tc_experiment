import { describe, expect, it } from "vitest";
import { createOpeningTasks, createTasksForMilestone } from "@/lib/workflow/tasks";

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
        staleAfterDays: 2,
        outreachKind: "milestone_follow_up",
        recipientRole: "title",
        requiredContactRoles: ["title"],
        completionSignals: ["title commitment"],
        requiresApproval: true,
        templateHint: "milestoneFollowUp"
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

describe("createOpeningTasks", () => {
  it("adds proactive metadata to opening outreach tasks", () => {
    const tasks = createOpeningTasks();

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Send opening email to title",
          metadata: expect.objectContaining({
            outreachKind: "opening_title_email",
            recipientRole: "title",
            requiredContactRoles: ["title"],
            requiresApproval: true
          })
        }),
        expect.objectContaining({
          title: "Introduce TC to opposite agent",
          metadata: expect.objectContaining({
            outreachKind: "opposite_agent_intro",
            recipientRole: "listing_agent",
            requiredContactRoles: ["listing_agent"],
            requiresApproval: true
          })
        }),
        expect.objectContaining({
          title: "Ask agent for missing stakeholder contacts",
          metadata: expect.objectContaining({
            outreachKind: "missing_stakeholder_contacts",
            recipientRole: "agent",
            requiredContactRoles: [],
            requiresApproval: false
          })
        })
      ])
    );
  });
});
