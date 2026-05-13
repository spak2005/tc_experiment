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

export interface AgentActivityEvent {
  id: string;
  teamId: string;
  transactionId?: string;
  transaction?: {
    id: string;
    propertyAddress?: string;
    status?: string;
  };
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
  teamId: string;
  transactionId?: string;
  agentDecisionId?: string;
  sourceType: AgentActivitySource;
  eventType: string;
  title: string;
  summary?: string;
  status: AgentActivityStatus;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
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
