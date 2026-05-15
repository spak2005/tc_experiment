import { describe, expect, it } from "vitest";
import type { TransactionContext } from "@/lib/agent/types";
import { resolvePhaseAdvancement } from "@/lib/workflow/phase-advancement";

function context(overrides: Partial<TransactionContext> = {}): TransactionContext {
  return {
    transaction: {
      id: "tx-1",
      status: "active",
      phase: "opening_file"
    },
    canonicalFacts: [],
    recentChanges: [],
    milestones: [
      {
        key: "title_commitment_due",
        title: "Title commitment due",
        phase: "title_survey_disclosures",
        completed_at: null
      }
    ],
    tasks: [],
    documents: [],
    messages: [],
    blockers: [],
    dealMemory: {
      dealBrief: "",
      activeQuestionsAndWarnings: []
    },
    recentDecisions: [],
    missingItems: [],
    ...overrides
  };
}

describe("resolvePhaseAdvancement", () => {
  it("advances to the earliest open milestone phase", () => {
    const write = resolvePhaseAdvancement({
      transactionId: "tx-1",
      context: context()
    });

    expect(write?.write).toMatchObject({
      name: "updateTransactionCore",
      input: {
        phase: "title_survey_disclosures"
      }
    });
  });

  it("advances to post_closing when no open milestones remain", () => {
    const write = resolvePhaseAdvancement({
      transactionId: "tx-1",
      context: context({
        milestones: [
          {
            key: "closing_date",
            title: "Closing",
            phase: "closing_funding",
            completed_at: "2026-05-14T15:00:00.000Z"
          }
        ]
      })
    });

    expect(write?.write).toMatchObject({
      input: {
        phase: "post_closing"
      }
    });
  });

  it("does not advance closed transactions", () => {
    const write = resolvePhaseAdvancement({
      transactionId: "tx-1",
      context: context({
        transaction: {
          id: "tx-1",
          status: "closed",
          phase: "closing_funding"
        }
      })
    });

    expect(write).toBeUndefined();
  });
});
