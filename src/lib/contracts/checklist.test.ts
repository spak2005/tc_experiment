import { describe, expect, it } from "vitest";
import { buildExpectedDocumentChecklist } from "@/lib/contracts/checklist";
import type { ContractFacts, ExtractedValue } from "@/lib/contracts/facts";

function extracted(value: string | number | boolean | null): ExtractedValue {
  return {
    value,
    confidence: 0.95,
    sourceReference: "test",
    needsConfirmation: false
  };
}

describe("buildExpectedDocumentChecklist", () => {
  it("adds lender, appraisal, and HOA documents for financed HOA deals", () => {
    const facts: ContractFacts = {
      contractVersion: "TREC_20_18",
      cashOrFinanced: extracted("financed"),
      hoaRequired: extracted(true),
      addenda: [],
      contacts: [],
      expectedDocuments: [],
      signatureStatus: "appears_executed",
      missingRequiredFacts: []
    };

    const keys = buildExpectedDocumentChecklist(facts).map((document) => document.key);

    expect(keys).toContain("lender_status_update");
    expect(keys).toContain("appraisal");
    expect(keys).toContain("hoa_resale_certificate");
  });

  it("marks the executed contract as already received", () => {
    const facts: ContractFacts = {
      contractVersion: "TREC_20_18",
      addenda: [],
      contacts: [],
      expectedDocuments: [],
      signatureStatus: "appears_executed",
      missingRequiredFacts: []
    };

    expect(buildExpectedDocumentChecklist(facts)[0]).toMatchObject({
      key: "executed_contract",
      status: "received"
    });
  });
});
