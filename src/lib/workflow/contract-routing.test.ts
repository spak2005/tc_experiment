import { describe, expect, it } from "vitest";
import type { ContractFacts } from "@/lib/contracts/facts";
import { routeContractIntake } from "@/lib/workflow/contract-routing";
import type { TransactionMatchCandidate } from "@/lib/agent/types";

function fact(value: string | number | boolean | null) {
  return {
    value,
    confidence: 0.95,
    needsConfirmation: false
  };
}

const baseFacts: ContractFacts = {
  contractVersion: "TREC_20_18",
  propertyAddress: fact("123 Main Street, Austin, TX"),
  buyerNames: fact("Jane Buyer and John Buyer"),
  sellerNames: fact("Sam Seller"),
  closingDate: fact("2026-06-30"),
  salesPrice: fact(500000),
  addenda: [],
  contacts: [],
  expectedDocuments: [],
  signatureStatus: "appears_executed",
  missingRequiredFacts: []
};

const candidate: TransactionMatchCandidate = {
  id: "tx-1",
  property_address: "123 Main St Austin TX",
  status: "needs_info",
  phase: "opening_file",
  effective_date: null,
  closing_date: "2026-06-15",
  updated_at: "2026-05-13T00:00:00Z",
  latest_facts: {
    ...baseFacts,
    closingDate: fact("2026-06-15"),
    salesPrice: fact(475000)
  },
  party_emails: [],
  party_names: [],
  thread_ids: [],
  recent_subjects: []
};

describe("routeContractIntake", () => {
  it("updates an existing transaction when stable identity matches", () => {
    const result = routeContractIntake({
      facts: baseFacts,
      candidates: [candidate],
      documentUsability: "usable"
    });

    expect(result.action).toBe("update_transaction");
    expect(result.transactionId).toBe("tx-1");
    expect(result.reasons).toContain("same property address");
  });

  it("creates a transaction when stable identity has no match", () => {
    const result = routeContractIntake({
      facts: baseFacts,
      candidates: [
        {
          ...candidate,
          id: "tx-2",
          property_address: "789 Oak Ave, Austin, TX",
          latest_facts: {
            ...baseFacts,
            propertyAddress: fact("789 Oak Ave, Austin, TX")
          }
        }
      ],
      documentUsability: "needs_clarification"
    });

    expect(result.action).toBe("create_transaction");
  });

  it("asks for identity when the contract has no property address", () => {
    const result = routeContractIntake({
      facts: {
        ...baseFacts,
        propertyAddress: fact(null)
      },
      candidates: [],
      documentUsability: "usable"
    });

    expect(result.action).toBe("ask_for_identity");
  });

  it("does not open a transaction for unusable documents", () => {
    const result = routeContractIntake({
      facts: baseFacts,
      candidates: [],
      documentUsability: "unusable"
    });

    expect(result.action).toBe("no_transaction_action");
  });

  it("asks which transaction when stable identity matches multiple files", () => {
    const result = routeContractIntake({
      facts: baseFacts,
      candidates: [
        candidate,
        {
          ...candidate,
          id: "tx-2"
        }
      ],
      documentUsability: "usable"
    });

    expect(result.action).toBe("ask_which_transaction");
  });
});
