import type { TransactionWrite } from "@/lib/transaction-writes/schemas";

export type EvidenceTriggerType = "inbound_email" | "document_stored" | "heartbeat";

export type EvidenceItemType =
  | "party_confirmation"
  | "document_received"
  | "contact_update"
  | "negative_or_blocker";

export interface EvidenceDocumentInput {
  documentId?: string;
  filename: string;
  contentType?: string;
  blobKey?: string;
  body?: Buffer;
}

export interface EvidenceTrigger {
  type: EvidenceTriggerType;
  emailText?: string;
  subject?: string;
  from?: string;
  threadId?: string;
  documents?: EvidenceDocumentInput[];
}

export interface EvidenceItem {
  type: EvidenceItemType;
  text: string;
  source: "email" | "document" | "heartbeat";
  documentId?: string;
  filename?: string;
  confidence: number;
  negated?: boolean;
  matchedKey?: string;
  matchedLabel?: string;
}

export interface DocumentClassification {
  documentId?: string;
  filename: string;
  categoryKey?: string;
  categoryLabel?: string;
  matchedDocumentId?: string;
  matchedDocumentName?: string;
  satisfiesExpectedDocument: boolean;
  confidence: number;
  rationale: string;
  mode: "deterministic" | "llm" | "unclassified";
}

export interface ReconciliationAppliedWrite {
  reason: string;
  write: TransactionWrite;
}

export interface ReconciliationResult {
  evidence: EvidenceItem[];
  classifications: DocumentClassification[];
  appliedWrites: ReconciliationAppliedWrite[];
  skipped: Array<{
    reason: string;
    evidence?: EvidenceItem;
    classification?: DocumentClassification;
  }>;
}
