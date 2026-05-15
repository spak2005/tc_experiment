import type { AgentContextPack, AgentDecision, PolicyResult } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import { safeBodyPreview } from "@/lib/agent/activity";
import {
  extractAgentMailMessageMetadata,
  replyTcEmailOnce,
  sendTcEmailOnce
} from "@/lib/agentmail/service";
import {
  createAgentActivityEvent,
  createApprovalOnce,
  createAuditEvent,
  updateApprovalRequestMetadata,
  updateAgentDecisionExecution
} from "@/lib/db/repositories";
import { approvalRequestEmail } from "@/lib/email/templates";
import { getTemporalContext } from "@/lib/time/clock";
import { buildStatusAnswerForTransaction } from "@/lib/workflow/status-responder";
import { composeAgentResponse } from "@/lib/agent/response-writer";
import { transitionOutboundTaskToWaitingResponse } from "@/lib/workflow/task-transitions";
import { executeTransactionWrites } from "@/lib/transaction-writes/executor";
import type { TransactionWriteResult } from "@/lib/transaction-writes/schemas";

async function sendDecisionResponse(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  decisionId: string;
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  labels: string[];
}) {
  const idempotencyKey = [
    "decision",
    input.decisionId,
    "response",
    input.context.inbound.messageId ?? input.subject
  ].join(":");

  if (input.context.inbound.messageId) {
    return replyTcEmailOnce({
      idempotencyKey,
      inboxId: input.context.tcProfile.inboxId,
      messageId: input.context.inbound.messageId,
      to: input.to,
      cc: input.cc,
      text: input.body,
      labels: input.labels
    });
  }

  return sendTcEmailOnce({
    idempotencyKey,
    inboxId: input.context.tcProfile.inboxId,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.body,
    labels: input.labels
  });
}

function defaultSubject(context: AgentContextPack, decision: AgentDecision) {
  return decision.response?.subject ?? `Re: ${context.inbound.subject}`;
}

function defaultRecipients(context: AgentContextPack, decision: AgentDecision) {
  return decision.response?.to ?? [context.tcProfile.escalationEmail];
}

function normalizeEmail(value?: string) {
  return (value ?? "").toLowerCase().trim();
}

function responseIsRealtorOnly(input: { context: AgentContextPack; to: string[] }) {
  const realtorEmail = normalizeEmail(input.context.tcProfile.escalationEmail);

  return (
    input.to.length > 0 &&
    input.to.every((recipient) => normalizeEmail(recipient) === realtorEmail)
  );
}

function approvalIdempotencyKey(input: {
  decisionId: string;
  taskId?: string;
  to: string[];
  subject: string;
}) {
  return [
    "approval",
    input.decisionId,
    input.taskId ?? "transaction",
    input.to.map(normalizeEmail).sort().join(","),
    input.subject
  ].join(":");
}

interface ResolvedResponse {
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  labels: string[];
  taskId?: string;
}

async function responseForDecision(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  documentAssessment?: DocumentAssessment;
  writeResults?: TransactionWriteResult[];
}): Promise<ResolvedResponse | undefined> {
  const { context, decision } = input;

  if (decision.response) {
    return {
      subject: defaultSubject(context, decision),
      body: decision.response.body,
      to: defaultRecipients(context, decision),
      cc: decision.response.cc,
      labels: decision.response.labels ?? [decision.intent, decision.action],
      taskId: decision.response.taskId
    };
  }

  if (
    decision.action === "ask_for_info" ||
    decision.action === "ask_which_transaction" ||
    decision.action === "process_contract" ||
    decision.action === "record_update" ||
    decision.action === "escalate_to_realtor"
  ) {
    const response = await composeAgentResponse({
      context,
      decision,
      documentAssessment: input.documentAssessment,
      writeResults: input.writeResults
    });

    if (response) {
      return {
        subject: response.subject ?? defaultSubject(context, decision),
        body: response.body,
        to: response.to,
        cc: response.cc,
        labels: response.labels
      };
    }
  }

  if (decision.action === "answer_status" && decision.transactionId) {
    const answer = await buildStatusAnswerForTransaction(decision.transactionId);
    const response = await composeAgentResponse({
      context,
      decision,
      statusContext: answer.text,
      writeResults: input.writeResults
    });

    return {
      subject: response?.subject ?? defaultSubject(context, decision),
      body: response?.body ?? answer.text,
      to: response?.to ?? [context.tcProfile.escalationEmail],
      cc: response?.cc,
      labels: response?.labels ?? ["status_answer"]
    };
  }

  return undefined;
}

export async function executeAgentDecision(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  decisionId: string;
  policy: PolicyResult;
  documentAssessment?: DocumentAssessment;
}) {
  const transactionId = input.decision.transactionId ?? input.context.match.transactionId;
  const toolResults: unknown[] = [];
  let status = "executed";

  if (input.policy.result === "blocked") {
    status = "blocked";
    toolResults.push({ tool: "policy", result: "blocked", reasons: input.policy.reasons });
  } else {
    const writeResults =
      input.decision.transactionWrites.length > 0
        ? await executeTransactionWrites({
            teamId: input.context.tcProfile.teamId,
            agentDecisionId: input.decisionId,
            writes: input.decision.transactionWrites
          })
        : [];
    if (writeResults.length > 0) {
      toolResults.push({ tool: "transactionWrites", result: writeResults });
    }

    const response = await responseForDecision({
      context: input.context,
      decision: input.decision,
      documentAssessment: input.documentAssessment,
      writeResults
    });
    if (response) {
      await createAgentActivityEvent({
        teamId: input.context.tcProfile.teamId,
        transactionId,
        agentDecisionId: input.decisionId,
        sourceType: "email",
        eventType: "response_composed",
        title: "Composed response",
        summary: `Composed "${response.subject}" for ${response.to.join(", ")}.`,
        status: "completed",
        metadata: {
          subject: response.subject,
          to: response.to,
          cc: response.cc ?? [],
          labels: response.labels,
          bodyPreview: safeBodyPreview(response.body)
        }
      });
    }

    const responseNeedsApproval =
      response &&
      (input.policy.result === "approval_required" ||
        !responseIsRealtorOnly({ context: input.context, to: response.to }));

    if (response && responseNeedsApproval) {
      if (!transactionId) {
        status = "blocked";
        toolResults.push({
          tool: "createApproval",
          result: "skipped",
          reason: "approval requires a transaction"
        });
      } else {
        const approval = await createApprovalOnce({
          transactionId,
          agentDecisionId: input.decisionId,
          taskId: response.taskId,
          idempotencyKey: approvalIdempotencyKey({
            decisionId: input.decisionId,
            taskId: response.taskId,
            to: response.to,
            subject: response.subject
          }),
          proposedSubject: response.subject,
          proposedBody: response.body,
          proposedTo: response.to,
          proposedCc: response.cc ?? []
        });
        await createAgentActivityEvent({
          teamId: input.context.tcProfile.teamId,
          transactionId,
          agentDecisionId: input.decisionId,
          sourceType: "approval",
          eventType: "approval_created",
          title: "Created approval request",
          summary: `Created approval for "${response.subject}".`,
          status: "waiting",
          metadata: {
            approvalId: approval.id,
            taskId: response.taskId,
            subject: response.subject,
            to: response.to,
            cc: response.cc ?? [],
            bodyPreview: safeBodyPreview(response.body)
          }
        });
        const request = approvalRequestEmail({
          proposedSubject: response.subject,
          proposedBody: response.body,
          proposedTo: response.to
        });

        const requestMessage = await sendTcEmailOnce({
          idempotencyKey: `approval:${approval.id}:request`,
          inboxId: input.context.tcProfile.inboxId,
          to: [input.context.tcProfile.escalationEmail],
          subject: request.subject,
          text: request.text,
          labels: ["approval_request", input.decision.intent, input.decision.action]
        });
        const requestMetadata = extractAgentMailMessageMetadata(requestMessage);
        await updateApprovalRequestMetadata({
          id: approval.id,
          requestMessageId: requestMetadata.messageId,
          requestThreadId: requestMetadata.threadId
        });
        await createAgentActivityEvent({
          teamId: input.context.tcProfile.teamId,
          transactionId,
          agentDecisionId: input.decisionId,
          sourceType: "approval",
          eventType: "approval_request_sent",
          title: "Sent approval request",
          summary: `Asked the realtor to approve "${response.subject}".`,
          status: "sent",
          metadata: {
            approvalId: approval.id,
            to: [input.context.tcProfile.escalationEmail],
            subject: request.subject,
            requestMessageId: requestMetadata.messageId,
            requestThreadId: requestMetadata.threadId,
            labels: ["approval_request", input.decision.intent, input.decision.action],
            bodyPreview: safeBodyPreview(request.text)
          }
        });
        status = "waiting_approval";
        toolResults.push({ tool: "createApproval", result: "created", approvalId: approval.id });
      }
    } else if (response) {
      await sendDecisionResponse({
        context: input.context,
        decision: input.decision,
        decisionId: input.decisionId,
        ...response
      });
      await createAgentActivityEvent({
        teamId: input.context.tcProfile.teamId,
        transactionId,
        agentDecisionId: input.decisionId,
        sourceType: "email",
        eventType: input.context.inbound.messageId ? "email_reply_sent" : "email_sent",
        title: input.context.inbound.messageId ? "Sent email reply" : "Sent email",
        summary: `Sent "${response.subject}" to ${response.to.join(", ")}.`,
        status: "sent",
        metadata: {
          subject: response.subject,
          to: response.to,
          cc: response.cc ?? [],
          labels: response.labels,
          bodyPreview: safeBodyPreview(response.body)
        }
      });
      toolResults.push({ tool: "sendResponse", result: "sent", labels: response.labels });
      if (transactionId) {
        const transition = await transitionOutboundTaskToWaitingResponse({
          teamId: input.context.tcProfile.teamId,
          transactionId,
          taskId: response.taskId,
          recipientEmails: response.to,
          today: getTemporalContext().today,
          agentDecisionId: input.decisionId,
          outboundSubject: response.subject
        });
        toolResults.push({ tool: "outboundTaskTransition", result: transition });
      }
    } else {
      toolResults.push({ tool: "sendResponse", result: "skipped", reason: "no response needed" });
    }
  }

  await updateAgentDecisionExecution({
    decisionId: input.decisionId,
    policyResult: input.policy.result,
    toolResults,
    status
  });

  await createAuditEvent({
    teamId: input.context.tcProfile.teamId,
    transactionId,
    actor: "tc_agent",
    eventType: "agent_decision_executed",
    payload: {
      decisionId: input.decisionId,
      intent: input.decision.intent,
      action: input.decision.action,
      policy: input.policy.result,
      status,
      toolResults
    }
  });

  return { status, toolResults };
}
