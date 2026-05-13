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
