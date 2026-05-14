import { describe, expect, it } from "vitest";
import type { ContractFacts } from "@/lib/contracts/facts";
import { contractFactsSchema } from "@/lib/contracts/facts";
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
      contacts: [],
      expectedDocuments: [],
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
      contacts: [],
      expectedDocuments: [],
      signatureStatus: "missing_signature",
      missingRequiredFacts: []
    };

    expect(validateContractFacts(facts).status).toBe("blocked_invalid_contract");
  });

  it("accepts coordination payload facts", () => {
    const parsed = contractFactsSchema.parse({
      contractVersion: "TREC_20_18",
      propertyAddress: extracted("123 Main St"),
      titleCompany: extracted("Austin Title"),
      contacts: [
        {
          role: "title",
          name: "Tara Title",
          email: "tara@example.com",
          organization: "Austin Title",
          confidence: 0.9
        }
      ],
      expectedDocuments: [
        {
          key: "title_commitment",
          type: "title_commitment",
          name: "Title commitment",
          ownerRole: "title"
        }
      ],
      financing: {
        financingType: extracted("third_party"),
        loanOfficerEmail: extracted("loan@example.com")
      },
      titleEscrow: {
        escrowOfficerEmail: extracted("tara@example.com")
      },
      hoa: {
        required: extracted(true),
        resaleCertificateRequired: extracted(true)
      },
      disclosures: {
        sellerDisclosureRequired: extracted(true)
      },
      signatureStatus: "appears_executed"
    });

    expect(parsed.contacts[0].role).toBe("title");
    expect(parsed.expectedDocuments[0]).toMatchObject({
      status: "needed",
      confidence: 0.8
    });
  });
});
