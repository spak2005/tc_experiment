import type { AgentContextPack, AgentDecision, PolicyResult } from "@/lib/agent/types";
import type { DocumentAssessment } from "@/lib/agent/document-assessment";
import { safeBodyPreview } from "@/lib/agent/activity";
import { replyTcEmail, sendTcEmail } from "@/lib/agentmail/service";
import {
  createAgentActivityEvent,
  createApproval,
  createAuditEvent,
  updateAgentDecisionExecution
} from "@/lib/db/repositories";
import { approvalRequestEmail } from "@/lib/email/templates";
import { getEnv } from "@/lib/config/env";
import { buildStatusAnswerForTransaction } from "@/lib/workflow/status-responder";
import { composeAgentResponse } from "@/lib/agent/response-writer";

async function sendDecisionResponse(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  labels: string[];
}) {
  if (input.context.inbound.messageId) {
    return replyTcEmail({
      inboxId: input.context.tcProfile.inboxId,
      messageId: input.context.inbound.messageId,
      to: input.to,
      cc: input.cc,
      text: input.body,
      labels: input.labels
    });
  }

  return sendTcEmail({
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

async function responseForDecision(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  documentAssessment?: DocumentAssessment;
}) {
  const { context, decision } = input;

  if (decision.response) {
    return {
      subject: defaultSubject(context, decision),
      body: decision.response.body,
      to: defaultRecipients(context, decision),
      cc: decision.response.cc,
      labels: decision.response.labels ?? [decision.intent, decision.action]
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
      documentAssessment: input.documentAssessment
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
      statusContext: answer.text
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
    const response = await responseForDecision({
      context: input.context,
      decision: input.decision,
      documentAssessment: input.documentAssessment
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
        const approval = await createApproval({
          transactionId,
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
            subject: response.subject,
            to: response.to,
            cc: response.cc ?? [],
            bodyPreview: safeBodyPreview(response.body)
          }
        });
        const baseUrl = getEnv().NEXT_PUBLIC_APP_URL ?? "";
        const request = approvalRequestEmail({
          proposedSubject: response.subject,
          proposedBody: response.body,
          approveUrl: `${baseUrl}/api/approvals/${approval.id}`,
          rejectUrl: `${baseUrl}/api/approvals/${approval.id}`
        });

        await sendTcEmail({
          inboxId: input.context.tcProfile.inboxId,
          to: [input.context.tcProfile.escalationEmail],
          subject: request.subject,
          text: request.text,
          labels: ["approval_request", input.decision.intent, input.decision.action]
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
