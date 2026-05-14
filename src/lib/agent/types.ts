import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";
import type { TemporalContext } from "@/lib/time/clock";
import type { TransactionWrite } from "@/lib/transaction-writes/schemas";

export type AgentIntent =
  | "new_contract"
  | "status_question"
  | "transaction_update"
  | "document_delivery"
  | "missing_info_response"
  | "deadline_issue"
  | "external_party_reply"
  | "unknown"
  | "noise";

export type AgentAction =
  | "process_contract"
  | "answer_status"
  | "record_update"
  | "ask_for_info"
  | "ask_which_transaction"
  | "create_blocker"
  | "draft_external_email"
  | "escalate_to_realtor"
  | "noop";

export type InboundDealEvent =
  | "confirmation"
  | "document_received"
  | "question"
  | "delay_or_blocker"
  | "contact_update"
  | "deadline_change"
  | "approval_reply"
  | "noise"
  | "unknown";

export interface TransactionMatchCandidate {
  id: string;
  property_address: string | null;
  status: string;
  phase: string | null;
  effective_date: string | null;
  closing_date: string | null;
  updated_at: string;
  latest_facts?: unknown;
  party_emails: string[];
  party_names: string[];
  thread_ids: string[];
  recent_subjects: string[];
}

export interface DealMatchResult {
  transactionId?: string;
  confidence: number;
  reasons: string[];
  ambiguous: boolean;
  candidates: Array<{
    transactionId: string;
    confidence: number;
    reasons: string[];
    propertyAddress?: string;
  }>;
}

export interface TransactionContext {
  transaction: Record<string, unknown>;
  facts?: Record<string, unknown>;
  canonicalFacts: Array<Record<string, unknown>>;
  recentChanges: Array<Record<string, unknown>>;
  milestones: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  memory?: Record<string, unknown>;
  recentDecisions: Array<Record<string, unknown>>;
  nextMilestone?: Record<string, unknown>;
  missingItems: string[];
}

export interface AgentContextPack {
  inbound: NormalizedInboundEmail;
  emailText: string;
  temporalContext: TemporalContext;
  tcProfile: {
    id: string;
    teamId: string;
    displayName: string;
    inboxAddress: string;
    inboxId: string;
    escalationEmail: string;
  };
  match: DealMatchResult;
  transactionContext?: TransactionContext;
  contractRouting?: unknown;
}

export interface AgentToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentDecision {
  intent: AgentIntent;
  action: AgentAction;
  confidence: number;
  transactionId?: string;
  matchConfidence?: number;
  requiresApproval: boolean;
  rationale: string;
  inboundEvent: InboundDealEvent;
  response?: {
    subject?: string;
    body: string;
    to?: string[];
    cc?: string[];
    labels?: string[];
  };
  toolCalls: AgentToolCall[];
  transactionWrites: TransactionWrite[];
}

export interface PolicyResult {
  result: "allowed" | "approval_required" | "blocked";
  reasons: string[];
}
