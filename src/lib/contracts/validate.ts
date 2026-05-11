import type { ContractFacts } from "@/lib/contracts/facts";
import { needsFactConfirmation } from "@/lib/contracts/facts";

export type ContractValidationStatus =
  | "ready_for_review"
  | "needs_info"
  | "blocked_invalid_contract";

export interface ContractValidationResult {
  status: ContractValidationStatus;
  issues: string[];
  requiredClarifications: string[];
}

export function validateContractFacts(facts: ContractFacts): ContractValidationResult {
  const issues: string[] = [];
  const requiredClarifications: string[] = [];

  if (facts.signatureStatus === "missing_signature") {
    issues.push("The contract appears to be missing one or more signatures.");
  }

  if (needsFactConfirmation(facts.effectiveDate)) {
    requiredClarifications.push("Confirm the Effective Date.");
  }

  if (needsFactConfirmation(facts.closingDate)) {
    requiredClarifications.push("Confirm the Closing Date.");
  }

  if (needsFactConfirmation(facts.cashOrFinanced)) {
    requiredClarifications.push("Confirm whether this is cash or financed.");
  }

  if (needsFactConfirmation(facts.earnestMoneyAmount)) {
    requiredClarifications.push("Confirm the earnest money amount.");
  }

  if (needsFactConfirmation(facts.optionPeriodDays)) {
    requiredClarifications.push("Confirm the option period length.");
  }

  if (needsFactConfirmation(facts.titleCompany)) {
    requiredClarifications.push("Provide the title company or escrow officer.");
  }

  if (issues.length > 0) {
    return {
      status: "blocked_invalid_contract",
      issues,
      requiredClarifications
    };
  }

  if (requiredClarifications.length > 0) {
    return {
      status: "needs_info",
      issues,
      requiredClarifications
    };
  }

  return {
    status: "ready_for_review",
    issues,
    requiredClarifications
  };
}
