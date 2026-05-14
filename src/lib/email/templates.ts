export interface IntakeConfirmationInput {
  agentName: string;
  propertyAddress?: string;
  missingItems: string[];
}

export function intakeConfirmationEmail(input: IntakeConfirmationInput) {
  const property = input.propertyAddress ?? "this transaction";
  const missing =
    input.missingItems.length > 0
      ? `\n\nI still need:\n${input.missingItems.map((item) => `- ${item}`).join("\n")}`
      : "";

  return {
    subject: `Opening file: ${property}`,
    text: `Hi ${input.agentName},\n\nI received the contract for ${property}. I am opening the file, reviewing the contract, and building the timeline now.${missing}\n\nI will follow up as soon as the transaction map is ready.\n\nBest,\nYour TC`
  };
}

export interface OpeningTitleEmailInput {
  titleContactName?: string;
  propertyAddress: string;
  agentName: string;
}

export function openingTitleEmail(input: OpeningTitleEmailInput) {
  return {
    subject: `New contract: ${input.propertyAddress}`,
    text: `Hi ${input.titleContactName ?? "there"},\n\nI am coordinating the transaction for ${input.propertyAddress} on behalf of ${input.agentName}. Please confirm receipt of the contract and let me know the escrow officer/contact for this file.\n\nI will also need confirmation once earnest money and the option fee are received.\n\nBest,\nTransaction Coordination`
  };
}

export interface AgentEscalationEmailInput {
  propertyAddress: string;
  deadlineTitle: string;
  dueDate?: string;
  responsibleParty?: string;
  lastAttempts: number;
  neededAction: string;
}

export function agentEscalationEmail(input: AgentEscalationEmailInput) {
  return {
    subject: `Action needed: ${input.deadlineTitle}`,
    text: `I need your help on ${input.propertyAddress}.\n\nDeadline at risk: ${input.deadlineTitle}${input.dueDate ? ` (${input.dueDate})` : ""}\nWaiting on: ${input.responsibleParty ?? "the responsible party"}\nContact attempts: ${input.lastAttempts}\n\nNeeded action: ${input.neededAction}\n\nI will keep tracking this, but you may need to intervene directly.`
  };
}

export interface ApprovalRequestEmailInput {
  proposedSubject: string;
  proposedBody: string;
}

export function approvalRequestEmail(input: ApprovalRequestEmailInput) {
  return {
    subject: `Approve email: ${input.proposedSubject}`,
    text: `I drafted this email and want to make sure it looks right before I send it.\n\nSubject: ${input.proposedSubject}\n\n${input.proposedBody}\n\nIs this okay to send, or should I make any changes?`
  };
}

export interface TransactionMapEmailInput {
  propertyAddress?: string;
  effectiveDate?: string;
  closingDate?: string;
  milestones: Array<{
    title: string;
    dueDate?: string;
    sourceReference?: string;
    riskLevel: string;
  }>;
  missingItems: string[];
}

export function transactionMapEmail(input: TransactionMapEmailInput) {
  const property = input.propertyAddress ?? "this transaction";
  const headline = [
    `Property: ${property}`,
    `Effective Date: ${input.effectiveDate ?? "Needs confirmation"}`,
    `Closing Date: ${input.closingDate ?? "Needs confirmation"}`
  ].join("\n");
  const milestones =
    input.milestones.length > 0
      ? input.milestones
          .map((milestone) => {
            const source = milestone.sourceReference
              ? ` (${milestone.sourceReference})`
              : "";
            return `- ${milestone.title}: ${milestone.dueDate ?? "event-triggered"}${source}`;
          })
          .join("\n")
      : "- No milestones could be generated yet.";
  const missing =
    input.missingItems.length > 0
      ? `\n\nI still need you to confirm:\n${input.missingItems.map((item) => `- ${item}`).join("\n")}`
      : "\n\nI have enough information to start tracking the file.";

  return {
    subject: `Transaction map: ${property}`,
    text: `Hi there,\n\nI reviewed the contract and built the initial transaction map.\n\n${headline}\n\nKey milestones:\n${milestones}${missing}\n\nI will keep monitoring the timeline and will escalate if a deadline is at risk.\n\nBest,\nYour TC`
  };
}
