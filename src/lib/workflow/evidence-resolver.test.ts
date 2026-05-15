import { describe, expect, it } from "vitest";
import type { TransactionContext } from "@/lib/agent/types";
import {
  resolveCompletionEvidence,
  resolveDocumentEvidence
} from "@/lib/workflow/evidence-resolver";

function context(): TransactionContext {
  return {
    transaction: { id: "tx-1" },
    canonicalFacts: [],
    recentChanges: [],
    milestones: [
      {
        key: "earnest_money_due",
        title: "Earnest money due",
        phase: "earnest_money_and_option",
        due_date: "2026-05-15",
        risk_level: "urgent",
        completed_at: null,
        metadata: {
          completionSignals: ["title confirms receipt", "earnest money"]
        }
      }
    ],
    tasks: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Earnest money due",
        status: "waiting_response",
        metadata: {
          completionSignals: ["title confirms receipt", "earnest money"]
        }
      }
    ],
    documents: [],
    messages: [],
    blockers: [],
    recentDecisions: [],
    missingItems: []
  };
}

describe("resolveCompletionEvidence", () => {
  it("completes matching tasks and milestones from routine confirmation", () => {
    const result = resolveCompletionEvidence({
      transactionId: "tx-1",
      context: context(),
      nowIso: "2026-05-14T15:00:00.000Z",
      evidence: [
        {
          type: "party_confirmation",
          text: "We have earnest money.",
          source: "email",
          confidence: 0.8
        }
      ]
    });

    expect(result.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          write: expect.objectContaining({ name: "updateTasks" })
        }),
        expect.objectContaining({
          write: expect.objectContaining({ name: "upsertMilestones" })
        })
      ])
    );
  });

  it("skips negated evidence", () => {
    const result = resolveCompletionEvidence({
      transactionId: "tx-1",
      context: context(),
      nowIso: "2026-05-14T15:00:00.000Z",
      evidence: [
        {
          type: "negative_or_blocker",
          text: "We do not have earnest money yet.",
          source: "email",
          confidence: 0.8,
          negated: true
        }
      ]
    });

    expect(result.writes).toHaveLength(0);
    expect(result.skipped[0]).toContain("Skipped unsafe or negated evidence");
  });

  it("skips unsafe high-impact evidence", () => {
    const result = resolveCompletionEvidence({
      transactionId: "tx-1",
      context: context(),
      nowIso: "2026-05-14T15:00:00.000Z",
      evidence: [
        {
          type: "party_confirmation",
          text: "The buyer wants to terminate and waive the deadline.",
          source: "email",
          confidence: 0.8
        }
      ]
    });

    expect(result.writes).toHaveLength(0);
    expect(result.skipped[0]).toContain("Skipped unsafe or negated evidence");
  });
});

describe("resolveDocumentEvidence", () => {
  it("marks high-confidence expected document matches as received", () => {
    const result = resolveDocumentEvidence({
      transactionId: "tx-1",
      nowIso: "2026-05-14T15:00:00.000Z",
      classifications: [
        {
          documentId: "stored-1",
          filename: "upload.pdf",
          categoryKey: "survey_or_t47",
          categoryLabel: "Survey / T-47",
          matchedDocumentId: "22222222-2222-4222-8222-222222222222",
          matchedDocumentName: "Survey / T-47",
          satisfiesExpectedDocument: true,
          confidence: 0.88,
          rationale: "Matched survey.",
          mode: "llm"
        }
      ]
    });

    expect(result.writes[0].write).toMatchObject({
      name: "updateDocuments",
      input: {
        documents: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            status: "received"
          }
        ]
      }
    });
  });
});
