import type {
  AgentActivityEvent,
  AgentActivitySource,
  AgentActivityStatus
} from "@/lib/agent/activity";

export interface LegacyMessageActivity {
  from_address: string;
  to_addresses?: string[];
  subject: string;
  received_at: string | null;
  sent_at: string | null;
  summary: string | null;
}

export interface LegacyDocumentActivity {
  type: string;
  name: string;
  status: string;
  blob_key: string | null;
  created_at?: string | null;
}

export interface LegacyAgentDecisionActivity {
  intent: string;
  action: string;
  confidence: string;
  match_confidence: string | null;
  requires_approval: boolean;
  policy_result: string;
  rationale: string;
  context_summary: unknown;
  tool_plan: unknown;
  tool_results: unknown;
  status: string;
  created_at: string;
  executed_at: string | null;
}

export interface LegacyApprovalActivity {
  id: string;
  proposed_subject: string;
  status?: string;
  created_at: string;
}

export interface LegacyAuditActivity {
  actor: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

function syntheticEvent(input: {
  id: string;
  sourceType: AgentActivitySource;
  eventType: string;
  title: string;
  summary: string;
  status: AgentActivityStatus;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  debugSource: string;
}): AgentActivityEvent {
  return {
    id: `synthetic:${input.debugSource}:${input.id}`,
    teamId: "legacy",
    sourceType: input.sourceType,
    eventType: input.eventType,
    title: input.title,
    summary: input.summary,
    status: input.status,
    metadata: input.metadata ?? {},
    occurredAt: input.occurredAt,
    isSynthetic: true,
    debugSource: input.debugSource
  };
}

function titleize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decisionStatus(status: string): AgentActivityStatus {
  if (status === "blocked") return "blocked";
  if (status === "waiting_approval") return "waiting";
  if (status === "executed") return "completed";
  return "started";
}

function documentStatus(status: string): AgentActivityStatus {
  if (status === "rejected") return "blocked";
  if (status === "needs_correction") return "waiting";
  if (status === "approved") return "completed";
  return "started";
}

function auditStatus(eventType: string): AgentActivityStatus {
  if (eventType.includes("missing") || eventType.includes("blocked")) return "blocked";
  if (eventType.includes("escalated")) return "sent";
  return "completed";
}

export function mapLegacyMessageToActivity(
  message: LegacyMessageActivity,
  index: number
): AgentActivityEvent | undefined {
  const occurredAt = message.received_at ?? message.sent_at;
  if (!occurredAt) return undefined;

  const inbound = Boolean(message.received_at);
  const recipients = message.to_addresses ?? [];

  return syntheticEvent({
    id: `${occurredAt}:${index}`,
    sourceType: "email",
    eventType: inbound ? "email_received" : "email_sent",
    title: inbound ? "Received email" : "Sent email",
    summary: inbound
      ? `Received "${message.subject}" from ${message.from_address}.`
      : `Sent "${message.subject}"${recipients.length ? ` to ${recipients.join(", ")}` : ""}.`,
    status: inbound ? "received" : "sent",
    metadata: {
      subject: message.subject,
      from: message.from_address,
      to: recipients,
      summary: message.summary
    },
    occurredAt,
    debugSource: "message"
  });
}

export function mapLegacyDocumentToActivity(
  document: LegacyDocumentActivity,
  index: number
): AgentActivityEvent | undefined {
  if (!document.created_at) return undefined;

  return syntheticEvent({
    id: `${document.created_at}:${index}`,
    sourceType: "document",
    eventType: "document_recorded",
    title: "Document recorded",
    summary: `${document.name} is tracked as ${document.type} with status ${document.status}.`,
    status: documentStatus(document.status),
    metadata: {
      filename: document.name,
      type: document.type,
      status: document.status,
      blobKey: document.blob_key
    },
    occurredAt: document.created_at,
    debugSource: "document"
  });
}

export function mapLegacyDecisionToActivity(
  decision: LegacyAgentDecisionActivity,
  index: number
): AgentActivityEvent {
  return syntheticEvent({
    id: `${decision.created_at}:${index}`,
    sourceType: "decision",
    eventType: "agent_decision",
    title: `Decided: ${decision.intent} -> ${decision.action}`,
    summary: decision.rationale || `Agent selected ${decision.action} for ${decision.intent}.`,
    status: decisionStatus(decision.status),
    metadata: {
      intent: decision.intent,
      action: decision.action,
      confidence: decision.confidence,
      matchConfidence: decision.match_confidence,
      requiresApproval: decision.requires_approval,
      policyResult: decision.policy_result,
      status: decision.status,
      executedAt: decision.executed_at,
      context: decision.context_summary,
      toolPlan: decision.tool_plan,
      toolResults: decision.tool_results
    },
    occurredAt: decision.created_at,
    debugSource: "agent_decision"
  });
}

export function mapLegacyApprovalToActivity(
  approval: LegacyApprovalActivity,
  index: number
): AgentActivityEvent {
  const status = approval.status ?? "pending";

  return syntheticEvent({
    id: `${approval.id}:${index}`,
    sourceType: "approval",
    eventType: "approval_created",
    title: status === "pending" ? "Waiting for approval" : `Approval ${status}`,
    summary: `Approval ${status} for "${approval.proposed_subject}".`,
    status: status === "pending" ? "waiting" : "completed",
    metadata: {
      approvalId: approval.id,
      subject: approval.proposed_subject,
      status
    },
    occurredAt: approval.created_at,
    debugSource: "approval"
  });
}

export function mapLegacyAuditToActivity(
  audit: LegacyAuditActivity,
  index: number
): AgentActivityEvent {
  return syntheticEvent({
    id: `${audit.created_at}:${index}`,
    sourceType: "system",
    eventType: audit.event_type,
    title: titleize(audit.event_type),
    summary: `${audit.actor} recorded ${titleize(audit.event_type).toLowerCase()}.`,
    status: auditStatus(audit.event_type),
    metadata: {
      actor: audit.actor,
      payload: audit.payload
    },
    occurredAt: audit.created_at,
    debugSource: "audit_event"
  });
}

export function mapLegacyRecordsToActivity(input: {
  messages: LegacyMessageActivity[];
  documents: LegacyDocumentActivity[];
  agentDecisions: LegacyAgentDecisionActivity[];
  approvals: LegacyApprovalActivity[];
  auditEvents: LegacyAuditActivity[];
}) {
  return [
    ...input.messages.flatMap((message, index) =>
      mapLegacyMessageToActivity(message, index) ?? []
    ),
    ...input.documents.flatMap((document, index) =>
      mapLegacyDocumentToActivity(document, index) ?? []
    ),
    ...input.agentDecisions.map(mapLegacyDecisionToActivity),
    ...input.approvals.map(mapLegacyApprovalToActivity),
    ...input.auditEvents.map(mapLegacyAuditToActivity)
  ];
}
