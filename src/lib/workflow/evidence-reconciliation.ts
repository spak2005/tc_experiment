import type { TransactionContext } from "@/lib/agent/types";
import { createAgentActivityEvent } from "@/lib/db/repositories";
import { executeTransactionWrites } from "@/lib/transaction-writes/executor";
import { classifyEvidenceDocuments } from "@/lib/workflow/document-reconciliation";
import type {
  EvidenceTrigger,
  ReconciliationAppliedWrite,
  ReconciliationResult
} from "@/lib/workflow/evidence-types";
import { normalizeEvidence } from "@/lib/workflow/evidence-normalizer";
import {
  resolveCompletionEvidence,
  resolveDocumentEvidence
} from "@/lib/workflow/evidence-resolver";
import { resolvePhaseAdvancement } from "@/lib/workflow/phase-advancement";

async function logReconciliationActivity(input: {
  userId: string;
  transactionId: string;
  eventType: string;
  title: string;
  summary: string;
  status: "started" | "completed" | "ignored" | "failed";
  metadata?: Record<string, unknown>;
}) {
  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    sourceType: "system",
    eventType: input.eventType,
    title: input.title,
    summary: input.summary,
    status: input.status,
    metadata: input.metadata
  });
}

export async function reconcileTransactionEvidence(input: {
  userId: string;
  transactionId: string;
  context: TransactionContext;
  trigger: EvidenceTrigger;
  now?: Date;
}): Promise<ReconciliationResult> {
  const nowIso = (input.now ?? new Date()).toISOString();
  await logReconciliationActivity({
    userId: input.userId,
    transactionId: input.transactionId,
    eventType: "evidence_reconciliation_started",
    title: "Started evidence reconciliation",
    summary: `Reconciling ${input.trigger.type} evidence.`,
    status: "started",
    metadata: { triggerType: input.trigger.type }
  });

  const evidence = normalizeEvidence(input.trigger);
  const classifications = await classifyEvidenceDocuments({
    context: input.context,
    documents: input.trigger.documents ?? [],
    emailText: input.trigger.emailText
  });
  for (const classification of classifications) {
    await logReconciliationActivity({
      userId: input.userId,
      transactionId: input.transactionId,
      eventType: "document_classified",
      title: "Classified document evidence",
      summary: `${classification.filename} classified with ${classification.confidence} confidence.`,
      status: classification.satisfiesExpectedDocument ? "completed" : "ignored",
      metadata: { classification }
    });
  }

  const completion = resolveCompletionEvidence({
    transactionId: input.transactionId,
    context: input.context,
    evidence,
    nowIso
  });
  const documents = resolveDocumentEvidence({
    transactionId: input.transactionId,
    classifications,
    nowIso
  });
  const phaseWrite = resolvePhaseAdvancement({
    transactionId: input.transactionId,
    context: input.context
  });
  const appliedWrites: ReconciliationAppliedWrite[] = [
    ...completion.writes,
    ...documents.writes,
    ...(phaseWrite ? [phaseWrite] : [])
  ];
  const skipped = [
    ...completion.skipped.map((reason) => ({ reason })),
    ...documents.skipped.map((reason) => ({ reason }))
  ];

  for (const item of evidence) {
    await logReconciliationActivity({
      userId: input.userId,
      transactionId: input.transactionId,
      eventType: item.type === "negative_or_blocker" ? "reconciliation_skipped" : "evidence_matched",
      title: item.type === "negative_or_blocker" ? "Skipped evidence" : "Matched evidence",
      summary: item.text.slice(0, 200),
      status: item.type === "negative_or_blocker" ? "ignored" : "completed",
      metadata: { evidence: item }
    });
  }

  if (appliedWrites.length > 0) {
    await executeTransactionWrites({
      userId: input.userId,
      writes: appliedWrites.map((write) => write.write)
    });
    for (const applied of appliedWrites) {
      await logReconciliationActivity({
        userId: input.userId,
        transactionId: input.transactionId,
        eventType:
          applied.write.name === "updateTransactionCore" ? "phase_advanced" : "reconciliation_write_applied",
        title:
          applied.write.name === "updateTransactionCore"
            ? "Advanced transaction phase"
            : "Applied reconciliation write",
        summary: applied.reason,
        status: "completed",
        metadata: {
          writeName: applied.write.name,
          write: applied.write
        }
      });
    }
  }

  for (const skippedItem of skipped) {
    await logReconciliationActivity({
      userId: input.userId,
      transactionId: input.transactionId,
      eventType: "reconciliation_skipped",
      title: "Skipped reconciliation",
      summary: skippedItem.reason,
      status: "ignored",
      metadata: skippedItem
    });
  }

  return {
    evidence,
    classifications,
    appliedWrites,
    skipped
  };
}
