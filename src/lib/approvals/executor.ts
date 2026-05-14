import { safeBodyPreview } from "@/lib/agent/activity";
import {
  extractAgentMailMessageMetadata,
  replyTcEmail,
  sendTcEmail
} from "@/lib/agentmail/service";
import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";
import {
  createAgentActivityEvent,
  createAuditEvent,
  updateApprovalDraft,
  updateApprovalRequestMetadata,
  updateApprovalSentMetadata,
  updateApprovalStatus,
  type ApprovalExecutionRow
} from "@/lib/db/repositories";
import { approvalRequestEmail } from "@/lib/email/templates";
import {
  classifyApprovalReply,
  type ApprovalReplyDecision
} from "@/lib/approvals/reply-interpreter";
import { getTemporalContext } from "@/lib/time/clock";
import { transitionOutboundTaskToWaitingResponse } from "@/lib/workflow/task-transitions";

function inboundReplyText(inbound: NormalizedInboundEmail) {
  return [inbound.subject, inbound.text, inbound.html].filter(Boolean).join("\n\n");
}

async function replyToRealtor(input: {
  approval: ApprovalExecutionRow;
  inbound: NormalizedInboundEmail;
  text: string;
  labels: string[];
}) {
  if (input.inbound.messageId) {
    return replyTcEmail({
      inboxId: input.approval.inbox_id,
      messageId: input.inbound.messageId,
      to: [input.approval.escalation_email],
      text: input.text,
      labels: input.labels
    });
  }

  return sendTcEmail({
    inboxId: input.approval.inbox_id,
    to: [input.approval.escalation_email],
    subject: `Re: ${input.inbound.subject}`,
    text: input.text,
    labels: input.labels
  });
}

export async function sendApprovedApproval(input: {
  approval: ApprovalExecutionRow;
  labels?: string[];
}) {
  const sent = await sendTcEmail({
    inboxId: input.approval.inbox_id,
    to: input.approval.proposed_to,
    cc: input.approval.proposed_cc,
    subject: input.approval.proposed_subject,
    text: input.approval.proposed_body,
    labels: input.labels ?? ["approved-send"]
  });
  const sentMetadata = extractAgentMailMessageMetadata(sent);
  await updateApprovalSentMetadata({
    id: input.approval.id,
    sentMessageId: sentMetadata.messageId,
    sentThreadId: sentMetadata.threadId
  });
  await createAgentActivityEvent({
    teamId: input.approval.team_id,
    transactionId: input.approval.transaction_id,
    agentDecisionId: input.approval.agent_decision_id ?? undefined,
    sourceType: "email",
    eventType: "approved_email_sent",
    title: "Sent approved email",
    summary: `Sent approved email "${input.approval.proposed_subject}" to ${input.approval.proposed_to.join(", ")}.`,
    status: "sent",
    metadata: {
      approvalId: input.approval.id,
      taskId: input.approval.task_id,
      subject: input.approval.proposed_subject,
      to: input.approval.proposed_to,
      cc: input.approval.proposed_cc,
      labels: input.labels ?? ["approved-send"],
      sentMessageId: sentMetadata.messageId,
      sentThreadId: sentMetadata.threadId,
      bodyPreview: safeBodyPreview(input.approval.proposed_body)
    }
  });
  await transitionOutboundTaskToWaitingResponse({
    teamId: input.approval.team_id,
    transactionId: input.approval.transaction_id,
    taskId: input.approval.task_id ?? undefined,
    recipientEmails: input.approval.proposed_to,
    today: getTemporalContext().today,
    agentDecisionId: input.approval.agent_decision_id ?? undefined,
    approvalId: input.approval.id,
    outboundSubject: input.approval.proposed_subject
  });

  return sentMetadata;
}

async function logReplyDecision(input: {
  approval: ApprovalExecutionRow;
  decision: ApprovalReplyDecision;
}) {
  await createAgentActivityEvent({
    teamId: input.approval.team_id,
    transactionId: input.approval.transaction_id,
    agentDecisionId: input.approval.agent_decision_id ?? undefined,
    sourceType: "approval",
    eventType: "approval_reply_interpreted",
    title: `Approval reply: ${input.decision.action}`,
    summary: input.decision.rationale,
    status:
      input.decision.action === "needs_clarification"
        ? "waiting"
        : input.decision.action === "reject"
          ? "blocked"
          : "completed",
    metadata: {
      approvalId: input.approval.id,
      action: input.decision.action,
      confidence: input.decision.confidence,
      rationale: input.decision.rationale,
      question: input.decision.question,
      revisedSubject: input.decision.revisedSubject,
      revisedBodyPreview: input.decision.revisedBody
        ? safeBodyPreview(input.decision.revisedBody)
        : undefined
    }
  });
}

async function reviseApprovalDraft(input: {
  approval: ApprovalExecutionRow;
  decision: ApprovalReplyDecision;
}) {
  if (!input.decision.revisedBody) {
    return null;
  }

  const revised = await updateApprovalDraft({
    id: input.approval.id,
    proposedSubject: input.decision.revisedSubject,
    proposedBody: input.decision.revisedBody,
    proposedTo: input.decision.revisedTo,
    proposedCc: input.decision.revisedCc
  });

  if (revised) {
    await createAgentActivityEvent({
      teamId: revised.team_id,
      transactionId: revised.transaction_id,
      agentDecisionId: revised.agent_decision_id ?? undefined,
      sourceType: "approval",
      eventType: "approval_draft_revised",
      title: "Revised approval draft",
      summary: `Revised "${revised.proposed_subject}" from realtor feedback.`,
      status: "completed",
      metadata: {
        approvalId: revised.id,
        previousSubject: input.approval.proposed_subject,
        revisedSubject: revised.proposed_subject,
        previousBodyPreview: safeBodyPreview(input.approval.proposed_body),
        revisedBodyPreview: safeBodyPreview(revised.proposed_body)
      }
    });
  }

  return revised;
}

async function sendRevisedApprovalRequest(input: {
  approval: ApprovalExecutionRow;
  inbound: NormalizedInboundEmail;
}) {
  const request = approvalRequestEmail({
    proposedSubject: input.approval.proposed_subject,
    proposedBody: input.approval.proposed_body,
    proposedTo: input.approval.proposed_to,
    intro: "I made those changes and put the revised draft below"
  });
  const response = await replyToRealtor({
    approval: input.approval,
    inbound: input.inbound,
    text: request.text,
    labels: ["approval_request", "approval_revised"]
  });
  const metadata = extractAgentMailMessageMetadata(response);
  await updateApprovalRequestMetadata({
    id: input.approval.id,
    requestMessageId: metadata.messageId,
    requestThreadId: metadata.threadId ?? input.approval.request_thread_id ?? input.inbound.threadId
  });
  await createAgentActivityEvent({
    teamId: input.approval.team_id,
    transactionId: input.approval.transaction_id,
    agentDecisionId: input.approval.agent_decision_id ?? undefined,
    sourceType: "approval",
    eventType: "approval_revision_sent",
    title: "Sent revised approval request",
    summary: `Sent revised approval request for "${input.approval.proposed_subject}".`,
    status: "sent",
    metadata: {
      approvalId: input.approval.id,
      requestMessageId: metadata.messageId,
      requestThreadId: metadata.threadId ?? input.approval.request_thread_id ?? input.inbound.threadId,
      bodyPreview: safeBodyPreview(request.text)
    }
  });
}

export async function executeApprovalReply(input: {
  approval: ApprovalExecutionRow;
  inbound: NormalizedInboundEmail;
}) {
  const decision = await classifyApprovalReply({
    replyText: inboundReplyText(input.inbound),
    originalSubject: input.approval.proposed_subject,
    originalBody: input.approval.proposed_body,
    originalTo: input.approval.proposed_to,
    originalCc: input.approval.proposed_cc
  });
  await logReplyDecision({ approval: input.approval, decision });

  if (decision.action === "approve_send") {
    const approved = await updateApprovalStatus(input.approval.id, "approved");
    if (!approved) return { status: "ignored", action: decision.action };
    await sendApprovedApproval({ approval: approved });
    await replyToRealtor({
      approval: approved,
      inbound: input.inbound,
      text: "Sent.",
      labels: ["approval_reply", "approved"]
    });
    await createAuditEvent({
      teamId: approved.team_id,
      transactionId: approved.transaction_id,
      actor: "agent",
      eventType: "approval_reply_approved",
      payload: { approvalId: approved.id, action: decision.action }
    });

    return { status: "sent", action: decision.action };
  }

  if (decision.action === "reject") {
    const rejected = await updateApprovalStatus(input.approval.id, "rejected");
    if (!rejected) return { status: "ignored", action: decision.action };
    await replyToRealtor({
      approval: rejected,
      inbound: input.inbound,
      text: "Got it. I will not send it.",
      labels: ["approval_reply", "rejected"]
    });
    await createAuditEvent({
      teamId: rejected.team_id,
      transactionId: rejected.transaction_id,
      actor: "agent",
      eventType: "approval_reply_rejected",
      payload: { approvalId: rejected.id, action: decision.action }
    });

    return { status: "rejected", action: decision.action };
  }

  if (decision.action === "revise_and_send") {
    const revised = await reviseApprovalDraft({ approval: input.approval, decision });
    if (!revised) return { status: "waiting", action: "needs_clarification" };
    const approved = await updateApprovalStatus(revised.id, "approved");
    if (!approved) return { status: "ignored", action: decision.action };
    await sendApprovedApproval({ approval: approved, labels: ["approved-send", "revised"] });
    await replyToRealtor({
      approval: approved,
      inbound: input.inbound,
      text: "Updated and sent.",
      labels: ["approval_reply", "revised", "approved"]
    });
    await createAuditEvent({
      teamId: approved.team_id,
      transactionId: approved.transaction_id,
      actor: "agent",
      eventType: "approval_reply_revised_and_sent",
      payload: { approvalId: approved.id, action: decision.action }
    });

    return { status: "sent", action: decision.action };
  }

  if (decision.action === "revise_only") {
    const revised = await reviseApprovalDraft({ approval: input.approval, decision });
    if (!revised) return { status: "waiting", action: "needs_clarification" };
    await sendRevisedApprovalRequest({ approval: revised, inbound: input.inbound });
    await createAuditEvent({
      teamId: revised.team_id,
      transactionId: revised.transaction_id,
      actor: "agent",
      eventType: "approval_reply_revised",
      payload: { approvalId: revised.id, action: decision.action }
    });

    return { status: "waiting_approval", action: decision.action };
  }

  await replyToRealtor({
    approval: input.approval,
    inbound: input.inbound,
    text: decision.question ?? "Did you want me to send this draft, make changes, or wait?",
    labels: ["approval_reply", "clarification"]
  });

  return { status: "waiting", action: decision.action };
}
