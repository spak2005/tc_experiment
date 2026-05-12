import { describe, expect, it } from "vitest";
import type { ContractFacts } from "@/lib/contracts/facts";
import { generateTexasMilestones } from "@/lib/milestones/engine";

function extracted(value: string | number | boolean | null) {
  return {
    value,
    confidence: 0.95,
    sourceReference: "test",
    evidence: "test",
    needsConfirmation: false
  };
}

describe("generateTexasMilestones", () => {
  it("generates core Texas transaction deadlines from contract anchors", () => {
    const facts: ContractFacts = {
      contractVersion: "TREC_20_18",
      effectiveDate: extracted("2026-05-11"),
      closingDate: extracted("2026-06-15"),
      cashOrFinanced: extracted("financed"),
      earnestMoneyAmount: extracted("5000"),
      optionPeriodDays: extracted(7),
      titleCompany: extracted("Austin Title"),
      addenda: [],
      signatureStatus: "appears_executed",
      missingRequiredFacts: []
    };

    const milestones = generateTexasMilestones(facts);
    const byKey = Object.fromEntries(milestones.map((item) => [item.key, item]));

    expect(byKey.earnest_money_due.dueDate).toBe("2026-05-14");
    expect(byKey.option_period_expires.dueDate).toBe("2026-05-18");
    expect(byKey.buyer_approval_due).toBeDefined();
    expect(byKey.closing_date.dueDate).toBe("2026-06-15");
  });
});
