import type { AgentActivityRun } from "@/lib/agent/activity";
import type { DiagnosticsTrigger } from "./types";

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function addIdentifier(
  identifiers: Record<string, string>,
  key: string,
  value: unknown
) {
  const normalized = stringValue(value);
  if (normalized) identifiers[key] = normalized;
}

function compactDetails(details: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null)
  );
}

export function normalizeDiagnosticsTrigger(run: AgentActivityRun): DiagnosticsTrigger {
  const workflowType = String(run.workflowType || "unknown");
  const metadata = run.metadata ?? {};
  const identifiers: Record<string, string> = {};

  if (workflowType === "inbound_email") {
    addIdentifier(identifiers, "webhookEventId", metadata.webhookEventId);
    addIdentifier(identifiers, "messageId", metadata.messageId);
    addIdentifier(identifiers, "threadId", metadata.threadId);
    addIdentifier(identifiers, "inboxId", metadata.inboxId);

    return {
      kind: "inbound_email",
      label: "Inbound email",
      workflowType,
      identifiers,
      details: compactDetails({
        from: metadata.from,
        subject: metadata.subject,
        technicalType: metadata.technicalType
      })
    };
  }

  if (workflowType === "approval_reply") {
    addIdentifier(identifiers, "approvalId", metadata.approvalId);
    addIdentifier(identifiers, "messageId", metadata.messageId);
    addIdentifier(identifiers, "threadId", metadata.threadId);

    return {
      kind: "approval_reply",
      label: "Approval reply",
      workflowType,
      identifiers,
      details: compactDetails({
        action: metadata.action,
        subject: metadata.subject,
        technicalType: metadata.technicalType
      })
    };
  }

  if (workflowType === "agent_wakeup") {
    addIdentifier(identifiers, "wakeupId", metadata.wakeupId);
    addIdentifier(identifiers, "taskId", metadata.taskId);

    return {
      kind: "agent_wakeup",
      label: "Agent wakeup",
      workflowType,
      identifiers,
      details: compactDetails({
        actionType: metadata.actionType,
        reason: metadata.reason,
        technicalType: metadata.technicalType
      })
    };
  }

  if (workflowType === "deadline_monitor") {
    addIdentifier(identifiers, "milestoneId", metadata.milestoneId);
    addIdentifier(identifiers, "taskId", metadata.taskId);

    return {
      kind: "deadline_monitor",
      label:
        metadata.kind === "stale_response"
          ? "Stale-response escalation"
          : "Deadline escalation",
      workflowType,
      identifiers,
      details: compactDetails({
        kind: metadata.kind,
        title: metadata.title,
        dueDate: metadata.dueDate,
        followUpDueDate: metadata.followUpDueDate,
        riskLevel: metadata.riskLevel,
        technicalType: metadata.technicalType
      })
    };
  }

  if (workflowType === "legacy_activity") {
    return {
      kind: "legacy_activity",
      label: "Legacy activity",
      workflowType,
      identifiers,
      details: compactDetails({
        technicalType: metadata.technicalType
      })
    };
  }

  return {
    kind: "unknown",
    label: run.title || "Unknown workflow",
    workflowType,
    identifiers,
    details: compactDetails({
      technicalType: metadata.technicalType
    })
  };
}

