import type { AgentContextPack, AgentDecision, PolicyResult } from "@/lib/agent/types";
import { replyTcEmail, sendTcEmail } from "@/lib/agentmail/service";
import {
  createApproval,
  createAuditEvent,
  updateAgentDecisionExecution
} from "@/lib/db/repositories";
import { approvalRequestEmail } from "@/lib/email/templates";
import { getEnv } from "@/lib/config/env";
import { buildStatusAnswerForTransaction } from "@/lib/workflow/status-responder";

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

async function responseForDecision(context: AgentContextPack, decision: AgentDecision) {
  if (decision.response) {
    return {
      subject: defaultSubject(context, decision),
      body: decision.response.body,
      to: defaultRecipients(context, decision),
      cc: decision.response.cc,
      labels: decision.response.labels ?? [decision.intent, decision.action]
    };
  }

  if (decision.action === "answer_status" && decision.transactionId) {
    const answer = await buildStatusAnswerForTransaction(decision.transactionId);

    return {
      subject: defaultSubject(context, decision),
      body: answer.text,
      to: [context.tcProfile.escalationEmail],
      labels: ["status_answer"]
    };
  }

  return undefined;
}

export async function executeAgentDecision(input: {
  context: AgentContextPack;
  decision: AgentDecision;
  decisionId: string;
  policy: PolicyResult;
}) {
  const transactionId = input.decision.transactionId ?? input.context.match.transactionId;
  const toolResults: unknown[] = [];
  let status = "executed";

  if (input.policy.result === "blocked") {
    status = "blocked";
    toolResults.push({ tool: "policy", result: "blocked", reasons: input.policy.reasons });
  } else {
    const response = await responseForDecision(input.context, input.decision);

    if (response && input.policy.result === "approval_required") {
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
        status = "waiting_approval";
        toolResults.push({ tool: "createApproval", result: "created", approvalId: approval.id });
      }
    } else if (response) {
      await sendDecisionResponse({
        context: input.context,
        decision: input.decision,
        ...response
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
