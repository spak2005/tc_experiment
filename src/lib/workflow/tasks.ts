import type { Milestone, Task } from "@/lib/domain/types";

type TaskDraft = Omit<Task, "id" | "transactionId" | "createdAt">;

const ownerByMilestone: Record<string, TaskDraft["ownerRole"]> = {
  earnest_money_due: "buyer",
  option_fee_due: "buyer",
  option_period_expires: "agent",
  survey_due: "listing_agent",
  seller_disclosure_due: "listing_agent",
  title_commitment_due: "title",
  title_objection_due: "agent",
  buyer_approval_due: "lender",
  closing_disclosure_due: "lender",
  final_walkthrough: "agent",
  closing_date: "tc",
  post_closing_docs_due: "title"
};

export function createTasksForMilestone(milestone: Omit<Milestone, "id" | "transactionId">): TaskDraft[] {
  const ownerRole = ownerByMilestone[milestone.key] ?? "tc";

  return [
    {
      milestoneId: undefined,
      title: milestone.title,
      ownerRole,
      status: "not_started",
      dueDate: milestone.dueDate
    }
  ];
}

export function createOpeningTasks(): TaskDraft[] {
  return [
    {
      title: "Send opening email to title",
      ownerRole: "tc",
      status: "not_started"
    },
    {
      title: "Introduce TC to opposite agent",
      ownerRole: "tc",
      status: "not_started"
    },
    {
      title: "Ask agent for missing stakeholder contacts",
      ownerRole: "agent",
      status: "not_started"
    }
  ];
}
