import type { TransactionContext } from "@/lib/agent/types";
import type {
  DocumentClassification,
  EvidenceItem,
  ReconciliationAppliedWrite
} from "@/lib/workflow/evidence-types";

const unsafePatterns = [
  /\bterminate\b/i,
  /\bterminated\b/i,
  /\bcancel\b/i,
  /\bamendment\b/i,
  /\bwaive\b/i,
  /\bwaiver\b/i
];

function textIncludesAny(text: string, values: string[]) {
  const normalized = text.toLowerCase();
  return values.some((value) => value.trim().length > 0 && normalized.includes(value.toLowerCase()));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function isUnsafeEvidence(text: string) {
  return unsafePatterns.some((pattern) => pattern.test(text));
}

export function shouldSkipCompletionEvidence(item: EvidenceItem) {
  return Boolean(item.negated) || item.type === "negative_or_blocker" || isUnsafeEvidence(item.text);
}

function signalValues(record: Record<string, unknown>) {
  const metadata = recordValue(record.metadata);
  return [
    ...stringArray(metadata.completionSignals),
    ...stringArray(metadata.expectedEvidence),
    stringValue(record.title),
    stringValue(record.name)
  ].filter((value): value is string => typeof value === "string");
}

export function resolveCompletionEvidence(input: {
  transactionId: string;
  context: TransactionContext;
  evidence: EvidenceItem[];
  nowIso: string;
}): { writes: ReconciliationAppliedWrite[]; skipped: string[] } {
  const writes: ReconciliationAppliedWrite[] = [];
  const skipped: string[] = [];
  const completedTaskIds = new Set<string>();
  const completedMilestoneIds = new Set<string>();
  const positive = input.evidence.filter(
    (item) => item.type === "party_confirmation" && !shouldSkipCompletionEvidence(item)
  );

  for (const item of input.evidence) {
    if (shouldSkipCompletionEvidence(item)) {
      skipped.push(`Skipped unsafe or negated evidence: ${item.text.slice(0, 120)}`);
    }
  }

  if (positive.length === 0) {
    return { writes, skipped };
  }

  const positiveText = positive.map((item) => item.text).join(" ");

  for (const task of input.context.tasks) {
    if (task.status === "complete" || task.status === "cancelled") continue;
    const signals = signalValues(task);
    if (!textIncludesAny(positiveText, signals)) continue;
    const taskId = stringValue(task.id);
    if (taskId) completedTaskIds.add(taskId);

    writes.push({
      reason: `Evidence matched task "${task.title}".`,
      write: {
        name: "updateTasks",
        input: {
          transactionId: input.transactionId,
          tasks: [
            {
              id: taskId,
              status: "complete",
              metadata: {
                reconciledAt: input.nowIso,
                reconciliationEvidence: positiveText.slice(0, 500)
              }
            }
          ]
        },
        source: {
          sourceType: "system",
          sourceReference: "evidence_reconciliation",
          confidence: 0.82,
          rationale: `Routine evidence matched task completion signals for ${task.title}.`
        }
      }
    });
  }

  for (const milestone of input.context.milestones) {
    if (milestone.completed_at) continue;
    const signals = signalValues(milestone);
    if (!textIncludesAny(positiveText, signals)) continue;
    const milestoneId = stringValue(milestone.id);
    if (milestoneId) completedMilestoneIds.add(milestoneId);

    writes.push({
      reason: `Evidence matched milestone "${milestone.title}".`,
      write: {
        name: "upsertMilestones",
        input: {
          transactionId: input.transactionId,
          milestones: [
            {
              key: String(milestone.key),
              title: String(milestone.title),
              phase: milestone.phase as never,
              dueDate: (milestone.due_date as string | null | undefined) ?? undefined,
              sourceType: "manual_override",
              sourceReference: "evidence_reconciliation",
              riskLevel: (milestone.risk_level as never) ?? "normal",
              completedAt: input.nowIso,
              metadata: {
                ...recordValue(milestone.metadata),
                reconciledAt: input.nowIso,
                reconciliationEvidence: positiveText.slice(0, 500)
              }
            }
          ]
        },
        source: {
          sourceType: "system",
          sourceReference: "evidence_reconciliation",
          confidence: 0.82,
          rationale: `Routine evidence matched milestone completion signals for ${milestone.title}.`
        }
      }
    });
  }

  for (const blocker of input.context.blockers) {
    const blockerId = stringValue(blocker.id);
    const taskId = stringValue(blocker.task_id);
    const deadlineId = stringValue(blocker.deadline_id);
    if (
      !blockerId ||
      (!taskId || !completedTaskIds.has(taskId)) &&
        (!deadlineId || !completedMilestoneIds.has(deadlineId))
    ) {
      continue;
    }

    writes.push({
      reason: `Resolved blocker "${blocker.title}" because linked evidence was completed.`,
      write: {
        name: "upsertBlocker",
        input: {
          transactionId: input.transactionId,
          id: blockerId,
          title: String(blocker.title),
          details: String(blocker.details),
          riskLevel: (blocker.risk_level as never) ?? "watch",
          responsiblePartyRole: stringValue(blocker.responsible_party_role) as never,
          deadlineId: deadlineId,
          taskId: taskId,
          resolved: true
        },
        source: {
          sourceType: "system",
          sourceReference: "evidence_reconciliation",
          confidence: 0.82,
          rationale: "Routine evidence completed the blocker-linked task or milestone."
        }
      }
    });
  }

  return { writes, skipped };
}

export function resolveDocumentEvidence(input: {
  transactionId: string;
  classifications: DocumentClassification[];
  nowIso: string;
}): { writes: ReconciliationAppliedWrite[]; skipped: string[] } {
  const writes: ReconciliationAppliedWrite[] = [];
  const skipped: string[] = [];

  for (const classification of input.classifications) {
    if (
      !classification.satisfiesExpectedDocument ||
      !classification.matchedDocumentId ||
      classification.confidence < 0.75
    ) {
      skipped.push(`Skipped low-confidence document classification for ${classification.filename}.`);
      continue;
    }

    writes.push({
      reason: `Document ${classification.filename} matched expected document ${classification.matchedDocumentName}.`,
      write: {
        name: "updateDocuments",
        input: {
          transactionId: input.transactionId,
          documents: [
            {
              id: classification.matchedDocumentId,
              status: "received",
              metadata: {
                classification,
                receivedAt: input.nowIso,
                storedDocumentId: classification.documentId
              }
            }
          ]
        },
        source: {
          sourceType: "system",
          sourceReference: "evidence_reconciliation",
          confidence: classification.confidence,
          rationale: classification.rationale
        }
      }
    });

    if (classification.documentId) {
      writes.push({
        reason: `Stored classification metadata for ${classification.filename}.`,
        write: {
          name: "updateDocuments",
          input: {
            transactionId: input.transactionId,
            documents: [
              {
                id: classification.documentId,
                status: "received",
                metadata: {
                  classification,
                  linkedExpectedDocumentId: classification.matchedDocumentId,
                  receivedAt: input.nowIso
                }
              }
            ]
          },
          source: {
            sourceType: "system",
            sourceReference: "evidence_reconciliation",
            confidence: classification.confidence,
            rationale: "Stored classification metadata on the raw received document."
          }
        }
      });
    }
  }

  return { writes, skipped };
}
