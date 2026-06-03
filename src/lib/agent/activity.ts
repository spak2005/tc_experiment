export type AgentActivitySource =
  | "email"
  | "document"
  | "storage"
  | "extraction"
  | "matching"
  | "decision"
  | "policy"
  | "tool"
  | "approval"
  | "deadline"
  | "system";

export type AgentActivityStatus =
  | "received"
  | "started"
  | "completed"
  | "waiting"
  | "blocked"
  | "failed"
  | "sent"
  | "ignored";

export type AgentActivityWorkflowType =
  | "inbound_email"
  | "approval_reply"
  | "agent_wakeup"
  | "deadline_monitor"
  | "legacy_activity";

export interface AgentActivityRun {
  id: string;
  userId: string;
  transactionId?: string;
  transaction?: {
    id: string;
    propertyAddress?: string;
    status?: string;
  };
  workflowType: AgentActivityWorkflowType | string;
  title: string;
  summary: string;
  status: AgentActivityStatus;
  metadata: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}

export interface AgentActivityEvent {
  id: string;
  userId: string;
  transactionId?: string;
  transaction?: {
    id: string;
    propertyAddress?: string;
    status?: string;
  };
  activityRunId?: string;
  activityRun?: AgentActivityRun;
  agentDecisionId?: string;
  sourceType: AgentActivitySource;
  eventType: string;
  title: string;
  summary: string;
  status: AgentActivityStatus;
  metadata: Record<string, unknown>;
  occurredAt: string;
  isSynthetic?: boolean;
  debugSource?: string;
}

export interface CreateAgentActivityEventInput {
  userId: string;
  transactionId?: string;
  activityRunId?: string;
  agentDecisionId?: string;
  sourceType: AgentActivitySource;
  eventType: string;
  title: string;
  summary?: string;
  status: AgentActivityStatus;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface CreateAgentActivityRunInput {
  userId: string;
  transactionId?: string;
  workflowType: AgentActivityWorkflowType | string;
  title: string;
  summary?: string;
  status?: AgentActivityStatus;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
}

export interface UpdateAgentActivityRunInput {
  id: string;
  transactionId?: string;
  title?: string;
  summary?: string;
  status?: AgentActivityStatus;
  metadata?: Record<string, unknown>;
  completedAt?: Date;
}

export function safeBodyPreview(value: string, maxLength = 500) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function activityStatusForPolicyResult(result: string): AgentActivityStatus {
  if (result === "blocked") return "blocked";
  if (result === "approval_required") return "waiting";
  return "completed";
}

export function activityStatusForExecutionStatus(status: string): AgentActivityStatus {
  if (status === "blocked") return "blocked";
  if (status === "waiting_approval") return "waiting";
  return "completed";
}
