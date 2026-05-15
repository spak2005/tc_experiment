import { safeBodyPreview } from "@/lib/agent/activity";
import { buildProactiveAgentContext } from "@/lib/agent/proactive-context";
import { decideProactiveAction } from "@/lib/agent/proactive-planner";
import {
  extractAgentMailMessageMetadata,
  sendTcEmail
} from "@/lib/agentmail/service";
import {
  claimDueAgentWakeups,
  completeAgentWakeup,
  createAgentActivityEvent,
  createAgentDecision,
  createApproval,
  createAuditEvent,
  failAgentWakeup,
  updateAgentDecisionExecution,
  updateApprovalRequestMetadata
} from "@/lib/db/repositories";
import type { AgentWakeup } from "@/lib/domain/types";
import { approvalRequestEmail } from "@/lib/email/templates";
import { getTemporalContext } from "@/lib/time/clock";
import { executeTransactionWrites } from "@/lib/transaction-writes/executor";
import { reconcileTransactionEvidence } from "@/lib/workflow/evidence-reconciliation";
import { refreshTransactionMemory } from "@/lib/workflow/memory-refresh";
import {
  cancelScheduledWakeups,
  scheduleAgentWakeup,
  scheduleNextHeartbeat
} from "@/lib/workflow/proactive-scheduling";
import { transitionOutboundTaskToWaitingResponse } from "@/lib/workflow/task-transitions";

function normalizeEmail(value?: string) {
  return (value ?? "").toLowerCase().trim();
}

function responseIsRealtorOnly(input: { realtorEmail: string; to: string[] }) {
  const realtorEmail = normalizeEmail(input.realtorEmail);
  return input.to.length > 0 && input.to.every((recipient) => normalizeEmail(recipient) === realtorEmail);
}

function wakeupDedupeKey(input: {
  transactionId: string;
  actionType: string;
  taskId?: string;
}) {
  return [input.transactionId, input.actionType, input.taskId].filter(Boolean).join(":");
}

export async function executeAgentWakeup(wakeup: AgentWakeup) {
  let context = await buildProactiveAgentContext(wakeup.transactionId);
  if (!context) {
    await createAgentActivityEvent({
      teamId: wakeup.teamId,
      transactionId: wakeup.transactionId,
      sourceType: "system",
      eventType: "proactive_wakeup_skipped",
      title: "Skipped proactive wakeup",
      summary: "The wakeup transaction context could not be loaded.",
      status: "ignored",
      metadata: {
        wakeupId: wakeup.id,
        actionType: wakeup.actionType,
        reason: wakeup.reason
      }
    });
    await completeAgentWakeup({
      id: wakeup.id,
      status: "skipped",
      payload: { skippedReason: "missing_transaction_context" }
    });
    return { status: "skipped", reason: "missing_transaction_context" };
  }

  await createAgentActivityEvent({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    sourceType: "system",
    eventType: "proactive_wakeup_claimed",
    title: "Claimed proactive wakeup",
    summary: `Started ${wakeup.actionType}: ${wakeup.reason}.`,
    status: "started",
    metadata: {
      wakeupId: wakeup.id,
      actionType: wakeup.actionType,
      taskId: wakeup.taskId,
      attemptCount: wakeup.attemptCount
      }
    });

  const reconciliation = await reconcileTransactionEvidence({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    context: context.transactionContext,
    trigger: { type: "heartbeat" }
  });
  if (reconciliation.appliedWrites.length > 0) {
    const reconciledContext = await buildProactiveAgentContext(wakeup.transactionId);
    if (!reconciledContext) {
      await completeAgentWakeup({
        id: wakeup.id,
        status: "skipped",
        payload: { skippedReason: "missing_transaction_context_after_reconciliation" }
      });
      return { status: "skipped", reason: "missing_transaction_context_after_reconciliation" };
    }
    await refreshTransactionMemory({
      teamId: reconciledContext.tcProfile.teamId,
      transactionId: reconciledContext.transactionId,
      context: reconciledContext.transactionContext,
      reason: "heartbeat_reconciliation",
      sourceReference: wakeup.id
    });
    context = await buildProactiveAgentContext(wakeup.transactionId);
    if (!context) {
      await completeAgentWakeup({
        id: wakeup.id,
        status: "skipped",
        payload: { skippedReason: "missing_transaction_context_after_reconciliation" }
      });
      return { status: "skipped", reason: "missing_transaction_context_after_reconciliation" };
    }
  }

  const decision = await decideProactiveAction({ context });
  const decisionRecord = await createAgentDecision({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    intent: "proactive_review",
    action: decision.action,
    confidence: decision.confidence,
    requiresApproval: decision.requiresApproval,
    rationale: decision.rationale,
    contextSummary: {
      wakeup: {
        id: wakeup.id,
        actionType: wakeup.actionType,
        taskId: wakeup.taskId,
        reason: wakeup.reason
      },
      transaction: context.transactionContext.transaction,
      nextMilestone: context.transactionContext.nextMilestone
    },
    toolPlan: {
      transactionWrites: decision.transactionWrites,
      response: decision.response
        ? {
            subject: decision.response.subject,
            to: decision.response.to,
            cc: decision.response.cc,
            labels: decision.response.labels
          }
        : undefined,
      nextWakeup: decision.nextWakeup
    }
  });

  await createAgentActivityEvent({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    agentDecisionId: decisionRecord.id,
    sourceType: "decision",
    eventType: "proactive_decision_created",
    title: `Selected proactive ${decision.action}`,
    summary: decision.rationale,
    status: "completed",
    metadata: {
      wakeupId: wakeup.id,
      confidence: decision.confidence,
      requiresApproval: decision.requiresApproval,
      taskId: decision.taskId
    }
  });

  const toolResults: unknown[] = [];
  const writeResults =
    decision.transactionWrites.length > 0
      ? await executeTransactionWrites({
          teamId: context.tcProfile.teamId,
          agentDecisionId: decisionRecord.id,
          writes: decision.transactionWrites
        })
      : [];
  if (writeResults.length > 0) {
    toolResults.push({ tool: "transactionWrites", result: writeResults });
  }

  const response = decision.response;
  let executionStatus = "executed";
  let policyResult = "allowed";

  if (response) {
    await createAgentActivityEvent({
      teamId: context.tcProfile.teamId,
      transactionId: context.transactionId,
      agentDecisionId: decisionRecord.id,
      sourceType: "email",
      eventType: "proactive_response_composed",
      title: "Composed proactive response",
      summary: `Composed "${response.subject}" for ${response.to.join(", ")}.`,
      status: "completed",
      metadata: {
        wakeupId: wakeup.id,
        subject: response.subject,
        to: response.to,
        cc: response.cc ?? [],
        labels: response.labels,
        bodyPreview: safeBodyPreview(response.body)
      }
    });

    const needsApproval =
      decision.action === "draft_external_email" ||
      decision.requiresApproval ||
      !responseIsRealtorOnly({
        realtorEmail: context.tcProfile.escalationEmail,
        to: response.to
      });

    if (needsApproval) {
      policyResult = "approval_required";
      const approval = await createApproval({
        transactionId: context.transactionId,
        agentDecisionId: decisionRecord.id,
        taskId: decision.taskId,
        proposedSubject: response.subject,
        proposedBody: response.body,
        proposedTo: response.to,
        proposedCc: response.cc ?? []
      });
      const request = approvalRequestEmail({
        proposedSubject: response.subject,
        proposedBody: response.body,
        proposedTo: response.to
      });
      const requestMessage = await sendTcEmail({
        inboxId: context.tcProfile.inboxId,
        to: [context.tcProfile.escalationEmail],
        subject: request.subject,
        text: request.text,
        labels: ["approval_request", "proactive", decision.action]
      });
      const requestMetadata = extractAgentMailMessageMetadata(requestMessage);
      await updateApprovalRequestMetadata({
        id: approval.id,
        requestMessageId: requestMetadata.messageId,
        requestThreadId: requestMetadata.threadId
      });
      await createAgentActivityEvent({
        teamId: context.tcProfile.teamId,
        transactionId: context.transactionId,
        agentDecisionId: decisionRecord.id,
        sourceType: "approval",
        eventType: "proactive_approval_request_sent",
        title: "Sent proactive approval request",
        summary: `Asked the realtor to approve "${response.subject}".`,
        status: "waiting",
        metadata: {
          wakeupId: wakeup.id,
          approvalId: approval.id,
          taskId: decision.taskId,
          subject: request.subject,
          requestMessageId: requestMetadata.messageId,
          requestThreadId: requestMetadata.threadId,
          bodyPreview: safeBodyPreview(request.text)
        }
      });
      executionStatus = "waiting_approval";
      toolResults.push({ tool: "createApproval", result: "created", approvalId: approval.id });
    } else {
      await sendTcEmail({
        inboxId: context.tcProfile.inboxId,
        to: response.to,
        cc: response.cc,
        subject: response.subject,
        text: response.body,
        labels: response.labels ?? ["proactive"]
      });
      await createAgentActivityEvent({
        teamId: context.tcProfile.teamId,
        transactionId: context.transactionId,
        agentDecisionId: decisionRecord.id,
        sourceType: "email",
        eventType: "proactive_email_sent",
        title: "Sent proactive email",
        summary: `Sent "${response.subject}" to ${response.to.join(", ")}.`,
        status: "sent",
        metadata: {
          wakeupId: wakeup.id,
          subject: response.subject,
          to: response.to,
          cc: response.cc ?? [],
          labels: response.labels,
          bodyPreview: safeBodyPreview(response.body)
        }
      });
      const transition = await transitionOutboundTaskToWaitingResponse({
        teamId: context.tcProfile.teamId,
        transactionId: context.transactionId,
        taskId: decision.taskId,
        recipientEmails: response.to,
        today: getTemporalContext().today,
        agentDecisionId: decisionRecord.id,
        outboundSubject: response.subject
      });
      toolResults.push({ tool: "sendResponse", result: "sent" });
      toolResults.push({ tool: "outboundTaskTransition", result: transition });
    }
  } else {
    toolResults.push({ tool: "sendResponse", result: "skipped", reason: "no response needed" });
  }

  if (decision.nextWakeup) {
    const scheduled = await scheduleAgentWakeup({
      teamId: context.tcProfile.teamId,
      transactionId: context.transactionId,
      taskId: decision.nextWakeup.taskId,
      actionType: decision.nextWakeup.actionType,
      reason: decision.nextWakeup.reason,
      wakeAt: decision.nextWakeup.wakeAt,
      dedupeKey: decision.nextWakeup.dedupeKey,
      payload: decision.nextWakeup.payload,
      preconditions: decision.nextWakeup.preconditions
    });
    toolResults.push({
      tool: "scheduleWakeup",
      result: "scheduled",
      wakeupId: scheduled.id,
      actionType: scheduled.actionType,
      wakeAt: scheduled.wakeAt
    });
  } else {
    const heartbeat = await scheduleNextHeartbeat({ context });
    if (heartbeat) {
      toolResults.push({
        tool: "scheduleHeartbeat",
        result: "scheduled",
        wakeupId: heartbeat.id,
        wakeAt: heartbeat.wakeAt
      });
    } else {
      const cancelled = await cancelScheduledWakeups({
        teamId: context.tcProfile.teamId,
        transactionId: context.transactionId,
        actionType: "transaction_heartbeat",
        reason: "Transaction is closed or terminated."
      });
      toolResults.push({
        tool: "scheduleHeartbeat",
        result: "cancelled",
        count: cancelled.length
      });
    }
  }

  await updateAgentDecisionExecution({
    decisionId: decisionRecord.id,
    policyResult,
    toolResults,
    status: executionStatus
  });

  await createAuditEvent({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    actor: "tc_agent",
    eventType: "proactive_wakeup_executed",
    payload: {
      wakeupId: wakeup.id,
      decisionId: decisionRecord.id,
      action: decision.action,
      status: executionStatus,
      toolResults
    }
  });

  await completeAgentWakeup({
    id: wakeup.id,
    status: decision.action === "noop" ? "skipped" : "completed",
    payload: {
      decisionId: decisionRecord.id,
      executionStatus
    }
  });

  await createAgentActivityEvent({
    teamId: context.tcProfile.teamId,
    transactionId: context.transactionId,
    agentDecisionId: decisionRecord.id,
    sourceType: "system",
    eventType: "proactive_wakeup_completed",
    title: "Completed proactive wakeup",
    summary: `Proactive wakeup finished with ${executionStatus}.`,
    status: decision.action === "noop" ? "ignored" : "completed",
    metadata: {
      wakeupId: wakeup.id,
      actionType: wakeup.actionType,
      action: decision.action,
      policyResult,
      toolResults
    }
  });

  const refreshedContext = await buildProactiveAgentContext(wakeup.transactionId);
  if (refreshedContext) {
    await refreshTransactionMemory({
      teamId: refreshedContext.tcProfile.teamId,
      transactionId: refreshedContext.transactionId,
      context: refreshedContext.transactionContext,
      reason: `proactive_wakeup_${executionStatus}`,
      sourceReference: decisionRecord.id
    });
  }

  return {
    status: executionStatus,
    action: decision.action,
    decisionId: decisionRecord.id,
    dedupeKey: wakeupDedupeKey({
      transactionId: wakeup.transactionId,
      actionType: wakeup.actionType,
      taskId: wakeup.taskId
    })
  };
}

function retryAtForWakeup(wakeup: AgentWakeup, now: Date) {
  const next = new Date(now);
  next.setUTCMinutes(next.getUTCMinutes() + Math.max(1, wakeup.attemptCount) * 30);
  return next.toISOString();
}

export async function processDueAgentWakeups(input: {
  now?: Date;
  limit?: number;
  workerId?: string;
} = {}) {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `proactive-dispatcher-${process.pid}`;
  const wakeups = await claimDueAgentWakeups({
    now: now.toISOString(),
    limit: input.limit ?? 10,
    workerId
  });
  const results: Array<{
    wakeupId: string;
    status: string;
    actionType: string;
    error?: string;
  }> = [];

  for (const wakeup of wakeups) {
    try {
      const execution = await executeAgentWakeup(wakeup);
      results.push({
        wakeupId: wakeup.id,
        status: execution.status,
        actionType: wakeup.actionType
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown proactive wakeup error";
      const failed = await failAgentWakeup({
        id: wakeup.id,
        error: message,
        retryAt: retryAtForWakeup(wakeup, now)
      });
      await createAgentActivityEvent({
        teamId: wakeup.teamId,
        transactionId: wakeup.transactionId,
        sourceType: "system",
        eventType: "proactive_wakeup_failed",
        title: failed?.status === "failed" ? "Failed proactive wakeup" : "Rescheduled proactive wakeup",
        summary:
          failed?.status === "failed"
            ? `Proactive wakeup failed permanently: ${message}.`
            : `Proactive wakeup failed and will retry: ${message}.`,
        status: "failed",
        metadata: {
          wakeupId: wakeup.id,
          actionType: wakeup.actionType,
          attemptCount: wakeup.attemptCount,
          finalStatus: failed?.status,
          retryAt: failed?.wakeAt,
          error: message
        }
      });
      results.push({
        wakeupId: wakeup.id,
        status: failed?.status ?? "failed",
        actionType: wakeup.actionType,
        error: message
      });
    }
  }

  return {
    claimed: wakeups.length,
    results
  };
}
