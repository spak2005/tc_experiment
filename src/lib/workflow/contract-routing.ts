import type { ContractFacts, ExtractedValue } from "@/lib/contracts/facts";
import { getStringFact } from "@/lib/contracts/facts";
import type { TransactionMatchCandidate } from "@/lib/agent/types";

export type ContractRoutingAction =
  | "create_transaction"
  | "update_transaction"
  | "ask_for_identity"
  | "ask_which_transaction"
  | "no_transaction_action";

export interface StableContractIdentity {
  normalizedPropertyAddress?: string;
  buyerNames: string[];
  sellerNames: string[];
}

export interface ContractRoutingDecision {
  action: ContractRoutingAction;
  transactionId?: string;
  confidence: number;
  reasons: string[];
  stableIdentity: StableContractIdentity;
  candidates: Array<{
    transactionId: string;
    confidence: number;
    reasons: string[];
    propertyAddress?: string;
  }>;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(court)\b/g, "ct")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(trail)\b/g, "trl")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value?: string | null) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => !["and", "or", "the", "trust", "llc"].includes(token))
    .join(" ");
}

function splitNames(fact?: ExtractedValue) {
  const value = getStringFact(fact);

  if (!value) return [];

  return value
    .split(/\s+(?:and|&)\s+|,|;/i)
    .map(normalizeName)
    .filter((name) => name.length >= 3);
}

function factsFromUnknown(value: unknown): Partial<ContractFacts> {
  if (!value || typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  const facts = record.facts && typeof record.facts === "object" ? record.facts : record;

  return facts as Partial<ContractFacts>;
}

export function buildStableContractIdentity(
  facts: Partial<ContractFacts>
): StableContractIdentity {
  return {
    normalizedPropertyAddress: normalizeText(getStringFact(facts.propertyAddress)),
    buyerNames: splitNames(facts.buyerNames),
    sellerNames: splitNames(facts.sellerNames)
  };
}

function nameOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;

  const matches = left.filter((leftName) =>
    right.some((rightName) => leftName === rightName || leftName.includes(rightName) || rightName.includes(leftName))
  );

  return matches.length / Math.max(left.length, right.length);
}

function scoreStableCandidate(input: {
  identity: StableContractIdentity;
  candidate: TransactionMatchCandidate;
}) {
  const candidateFacts = factsFromUnknown(input.candidate.latest_facts);
  const candidateIdentity = buildStableContractIdentity({
    ...candidateFacts,
    propertyAddress:
      candidateFacts.propertyAddress ??
      ({
        value: input.candidate.property_address,
        confidence: 1,
        needsConfirmation: false
      } satisfies ExtractedValue)
  });
  const reasons: string[] = [];
  let score = 0;

  if (
    input.identity.normalizedPropertyAddress &&
    candidateIdentity.normalizedPropertyAddress &&
    input.identity.normalizedPropertyAddress === candidateIdentity.normalizedPropertyAddress
  ) {
    score += 0.65;
    reasons.push("same property address");
  }

  const buyerOverlap = nameOverlap(input.identity.buyerNames, candidateIdentity.buyerNames);
  if (buyerOverlap > 0) {
    score += buyerOverlap >= 0.5 ? 0.2 : 0.1;
    reasons.push("buyer names overlap");
  }

  const sellerOverlap = nameOverlap(input.identity.sellerNames, candidateIdentity.sellerNames);
  if (sellerOverlap > 0) {
    score += sellerOverlap >= 0.5 ? 0.2 : 0.1;
    reasons.push("seller names overlap");
  }

  return {
    transactionId: input.candidate.id,
    confidence: Math.min(1, Number(score.toFixed(3))),
    reasons,
    propertyAddress: input.candidate.property_address ?? undefined
  };
}

function hasEnoughIdentity(identity: StableContractIdentity) {
  return Boolean(identity.normalizedPropertyAddress);
}

export function routeContractIntake(input: {
  facts: ContractFacts;
  candidates: TransactionMatchCandidate[];
  documentUsability: "usable" | "needs_clarification" | "unusable";
}): ContractRoutingDecision {
  const stableIdentity = buildStableContractIdentity(input.facts);

  if (input.documentUsability === "unusable") {
    return {
      action: "no_transaction_action",
      confidence: 0,
      reasons: ["document is not usable enough to open or update a transaction"],
      stableIdentity,
      candidates: []
    };
  }

  if (!hasEnoughIdentity(stableIdentity)) {
    return {
      action: "ask_for_identity",
      confidence: 0,
      reasons: ["contract identity is missing a property address"],
      stableIdentity,
      candidates: []
    };
  }

  const scored = input.candidates
    .map((candidate) => scoreStableCandidate({ identity: stableIdentity, candidate }))
    .filter((candidate) => candidate.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence);
  const [best, second] = scored;

  if (best && second && best.confidence >= 0.65 && second.confidence >= 0.65) {
    return {
      action: "ask_which_transaction",
      confidence: best.confidence,
      reasons: ["stable identity matched multiple active transactions"],
      stableIdentity,
      candidates: scored.slice(0, 5)
    };
  }

  if (best && best.confidence >= 0.65) {
    return {
      action: "update_transaction",
      transactionId: best.transactionId,
      confidence: best.confidence,
      reasons: best.reasons,
      stableIdentity,
      candidates: scored.slice(0, 5)
    };
  }

  return {
    action: "create_transaction",
    confidence: 0.8,
    reasons: ["contract has stable identity and no matching active transaction"],
    stableIdentity,
    candidates: scored.slice(0, 5)
  };
}
