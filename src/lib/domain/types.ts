export type ID = string;

export type Market = "TX";

export type TransactionSide = "buyer" | "listing" | "dual" | "unknown";

export type TransactionStatus =
  | "intake_processing"
  | "needs_agent_confirmation"
  | "needs_info"
  | "blocked_invalid_contract"
  | "active"
  | "terminated"
  | "closed";

export type TransactionPhase =
  | "opening_file"
  | "earnest_money_and_option"
  | "inspection_option_period"
  | "title_survey_disclosures"
  | "financing_appraisal"
  | "compliance_da"
  | "closing_prep"
  | "closing_funding"
  | "post_closing";

export type PartyRole =
  | "buyer"
  | "seller"
  | "buyer_agent"
  | "listing_agent"
  | "title"
  | "lender"
  | "inspector"
  | "appraiser"
  | "surveyor"
  | "attorney"
  | "hoa"
  | "broker_compliance"
  | "vendor"
  | "agent_client";

export type DocumentStatus =
  | "needed"
  | "requested"
  | "received"
  | "under_review"
  | "needs_correction"
  | "submitted"
  | "approved"
  | "rejected"
  | "not_applicable";

export type TaskStatus =
  | "not_started"
  | "drafted"
  | "waiting_approval"
  | "sent"
  | "waiting_response"
  | "received"
  | "needs_correction"
  | "blocked"
  | "complete"
  | "cancelled";

export type MilestoneSourceType =
  | "anchor_offset"
  | "explicit_date"
  | "derived_event"
  | "manual_override"
  | "amendment_override";

export type RiskLevel = "normal" | "watch" | "urgent" | "critical";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type TransactionFactSourceType =
  | "contract_extraction"
  | "email"
  | "agent"
  | "system"
  | "manual";

export type TransactionChangeType =
  | "created"
  | "updated"
  | "completed"
  | "resolved"
  | "skipped"
  | "blocked"
  | "approval_required";

export type TransactionChangeTargetType =
  | "transaction"
  | "transaction_fact"
  | "party"
  | "milestone"
  | "task"
  | "document"
  | "blocker"
  | "memory";

export type TransactionWriteApprovalStatus =
  | "applied"
  | "approval_required"
  | "blocked"
  | "skipped";

export type AgentWakeupActionType =
  | "transaction_dispatch"
  | "transaction_heartbeat"
  | "task_follow_up";

export type AgentWakeupStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "skipped";

export interface AgentWakeup {
  id: ID;
  userId: ID;
  transactionId: ID;
  taskId?: ID;
  actionType: AgentWakeupActionType;
  reason: string;
  status: AgentWakeupStatus;
  dedupeKey: string;
  wakeAt: string;
  payload: Record<string, unknown>;
  preconditions: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  lockedAt?: string;
  lockedBy?: string;
  lastError?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: ID;
  authUserId: ID;
  name: string;
  email: string;
  phone?: string;
  brokerage?: string;
  market: Market;
  createdAt: Date;
}

export interface TcProfile {
  id: ID;
  userId: ID;
  displayName: string;
  inboxAddress: string;
  agentMailPodId?: string;
  agentMailInboxId?: string;
  escalationEmail: string;
  market: Market;
  defaultSide: TransactionSide;
  createdAt: Date;
}

export interface Transaction {
  id: ID;
  userId: ID;
  tcProfileId: ID;
  propertyAddress?: string;
  market: Market;
  side: TransactionSide;
  status: TransactionStatus;
  phase?: TransactionPhase;
  currentRisk: RiskLevel;
  effectiveDate?: string;
  closingDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Party {
  id: ID;
  transactionId: ID;
  role: PartyRole;
  name?: string;
  email?: string;
  phone?: string;
  organization?: string;
  confidence?: number;
  source?: string;
}

export interface DocumentRecord {
  id: ID;
  transactionId: ID;
  type: string;
  name: string;
  status: DocumentStatus;
  blobKey?: string;
  sourceMessageId?: string;
  ownerRole?: PartyRole | "tc" | "agent";
  dueDate?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Milestone {
  id: ID;
  transactionId: ID;
  key: string;
  title: string;
  phase: TransactionPhase;
  dueDate?: string;
  sourceType: MilestoneSourceType;
  sourceReference?: string;
  riskLevel: RiskLevel;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: ID;
  transactionId: ID;
  milestoneId?: ID;
  title: string;
  ownerRole: PartyRole | "tc" | "agent";
  status: TaskStatus;
  dueDate?: string;
  followUpDueDate?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Message {
  id: ID;
  transactionId?: ID;
  agentMailMessageId: string;
  threadId?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  receivedAt?: Date;
  sentAt?: Date;
  summary?: string;
}

export interface Approval {
  id: ID;
  transactionId: ID;
  status: ApprovalStatus;
  proposedSubject: string;
  proposedBody: string;
  proposedTo: string[];
  proposedCc: string[];
  expiresAt?: Date;
  createdAt: Date;
}

export interface Blocker {
  id: ID;
  transactionId: ID;
  title: string;
  details: string;
  riskLevel: RiskLevel;
  responsiblePartyRole?: PartyRole;
  deadlineId?: ID;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface AuditEvent {
  id: ID;
  transactionId?: ID;
  teamId: ID;
  actor: "system" | "tc_agent" | "agent" | "external_party";
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface TransactionFact {
  transactionId: ID;
  key: string;
  value: unknown;
  confidence: number;
  sourceType: TransactionFactSourceType;
  sourceReference?: string;
  needsConfirmation: boolean;
  updatedAt: Date;
}

export interface TransactionChangeEvent {
  id: ID;
  transactionId: ID;
  agentDecisionId?: ID;
  changeType: TransactionChangeType;
  targetType: TransactionChangeTargetType;
  targetId?: string;
  fieldKey: string;
  previousValue?: unknown;
  newValue?: unknown;
  sourceType: TransactionFactSourceType;
  sourceReference?: string;
  confidence: number;
  approvalStatus: TransactionWriteApprovalStatus;
  createdAt: Date;
}
