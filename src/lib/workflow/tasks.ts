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
  appraisal_status_due: "lender",
  hoa_resale_certificate_due: "hoa",
  closing_disclosure_due: "lender",
  final_walkthrough: "agent",
  closing_date: "tc",
  post_closing_docs_due: "title"
};

export function createTasksForMilestone(milestone: Omit<Milestone, "id" | "transactionId">): TaskDraft[] {
  const metadata = milestone.metadata ?? {};
  const ownerRole =
    (typeof metadata.ownerRole === "string"
      ? (metadata.ownerRole as TaskDraft["ownerRole"])
      : undefined) ??
    ownerByMilestone[milestone.key] ??
    "tc";

  return [
    {
      milestoneId: undefined,
      title: milestone.title,
      ownerRole,
      status: "not_started",
      dueDate: milestone.dueDate,
      followUpDueDate: undefined,
      metadata
    }
  ];
}

export function createOpeningTasks(): TaskDraft[] {
  return [
    {
      title: "Send opening email to title",
      ownerRole: "tc",
      status: "not_started",
      metadata: {
        outreachKind: "opening_title_email",
        recipientRole: "title",
        requiredContactRoles: ["title"],
        staleAfterDays: 2,
        completionSignals: ["title confirms receipt", "escrow officer/contact identified"],
        requiresApproval: true,
        templateHint: "openingTitleEmail"
      }
    },
    {
      title: "Introduce TC to opposite agent",
      ownerRole: "tc",
      status: "not_started",
      metadata: {
        outreachKind: "opposite_agent_intro",
        recipientRole: "listing_agent",
        requiredContactRoles: ["listing_agent"],
        staleAfterDays: 2,
        completionSignals: ["opposite agent confirms best coordination contact"],
        requiresApproval: true,
        templateHint: "oppositeAgentIntro"
      }
    },
    {
      title: "Ask agent for missing stakeholder contacts",
      ownerRole: "agent",
      status: "not_started",
      metadata: {
        outreachKind: "missing_stakeholder_contacts",
        recipientRole: "agent",
        requiredContactRoles: [],
        staleAfterDays: 1,
        completionSignals: ["agent provides missing contact information"],
        requiresApproval: false,
        templateHint: "missingContacts"
      }
    }
  ];
}
