import { describe, expect, it } from "vitest";
import type { ContractFacts } from "@/lib/contracts/facts";
import { validateContractFacts } from "@/lib/contracts/validate";

function extracted(value: string | number | boolean | null, confidence = 0.95) {
  return {
    value,
    confidence,
    sourceReference: "test",
    evidence: "test",
    needsConfirmation: value === null || confidence < 0.8
  };
}

describe("validateContractFacts", () => {
  it("requires confirmation for missing critical facts", () => {
    const facts: ContractFacts = {
      contractVersion: "TREC_20_18",
      effectiveDate: extracted(null, 0),
      closingDate: extracted("2026-06-15"),
      cashOrFinanced: extracted("financed"),
      earnestMoneyAmount: extracted("5000"),
      optionPeriodDays: extracted(7),
      titleCompany: extracted("Austin Title"),
      addenda: [],
      signatureStatus: "appears_executed",
      missingRequiredFacts: []
    };

    expect(validateContractFacts(facts)).toMatchObject({
      status: "needs_info",
      requiredClarifications: ["Confirm the Effective Date."]
    });
  });

  it("blocks contracts that appear to be missing signatures", () => {
    const facts: ContractFacts = {
      contractVersion: "TREC_20_18",
      effectiveDate: extracted("2026-05-10"),
      closingDate: extracted("2026-06-15"),
      cashOrFinanced: extracted("cash"),
      earnestMoneyAmount: extracted("5000"),
      optionPeriodDays: extracted(7),
      titleCompany: extracted("Austin Title"),
      addenda: [],
      signatureStatus: "missing_signature",
      missingRequiredFacts: []
    };

    expect(validateContractFacts(facts).status).toBe("blocked_invalid_contract");
  });
});
