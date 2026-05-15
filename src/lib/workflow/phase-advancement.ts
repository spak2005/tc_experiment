import type { TransactionContext } from "@/lib/agent/types";
import type { ReconciliationAppliedWrite } from "@/lib/workflow/evidence-types";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function resolvePhaseAdvancement(input: {
  transactionId: string;
  context: TransactionContext;
}): ReconciliationAppliedWrite | undefined {
  const status = stringValue(input.context.transaction.status);
  if (status === "closed" || status === "terminated") {
    return undefined;
  }

  const currentPhase = stringValue(input.context.transaction.phase);
  const nextMilestone = input.context.milestones.find((milestone) => !milestone.completed_at);
  const nextPhase = stringValue(nextMilestone?.phase) ?? "post_closing";

  if (!nextPhase || nextPhase === currentPhase) {
    return undefined;
  }

  return {
    reason: `Advanced phase to ${nextPhase}.`,
    write: {
      name: "updateTransactionCore",
      input: {
        transactionId: input.transactionId,
        phase: nextPhase as never
      },
      source: {
        sourceType: "system",
        sourceReference: "evidence_reconciliation",
        confidence: 0.9,
        rationale: "Phase advanced to the earliest open milestone phase."
      }
    }
  };
}
