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
  approveUrl: string;
  rejectUrl: string;
}

export function approvalRequestEmail(input: ApprovalRequestEmailInput) {
  return {
    subject: `Approve email: ${input.proposedSubject}`,
    text: `I drafted the email below and need your approval before sending.\n\nSubject: ${input.proposedSubject}\n\n${input.proposedBody}\n\nApprove: ${input.approveUrl}\nReject: ${input.rejectUrl}`
  };
}
