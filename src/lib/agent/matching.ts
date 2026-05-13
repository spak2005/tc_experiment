import type {
  DealMatchResult,
  TransactionMatchCandidate
} from "@/lib/agent/types";
import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";

function normalize(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function emailDomain(address: string) {
  return normalize(address).split("@")[1] ?? "";
}

function includesMeaningful(text: string, value?: string | null) {
  const normalized = normalize(value);

  return normalized.length >= 5 && text.includes(normalized);
}

function propertyTokenScore(text: string, propertyAddress?: string | null) {
  const normalized = normalize(propertyAddress);

  if (!normalized) return 0;
  if (text.includes(normalized)) return 0.55;

  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 || /^\d{2,}$/.test(token));
  const matched = tokens.filter((token) => text.includes(token)).length;

  if (tokens.length === 0) return 0;

  const ratio = matched / tokens.length;
  if (ratio >= 0.75) return 0.5;
  if (ratio >= 0.5) return 0.15;

  return 0;
}

function scoreCandidate(input: {
  inbound: NormalizedInboundEmail;
  emailText: string;
  escalationEmail: string;
  candidate: TransactionMatchCandidate;
  onlyOpenCandidate: boolean;
}) {
  const text = normalize(input.emailText);
  const from = normalize(input.inbound.from);
  const fromDomain = emailDomain(input.inbound.from);
  const reasons: string[] = [];
  let score = 0;

  if (input.inbound.threadId && input.candidate.thread_ids.includes(input.inbound.threadId)) {
    score += 0.55;
    reasons.push("same AgentMail thread");
  }

  if (input.candidate.party_emails.includes(from)) {
    score += 0.3;
    reasons.push("sender is a known party on this transaction");
  }

  const matchingPartyDomain = input.candidate.party_emails.some(
    (email) => emailDomain(email) === fromDomain && fromDomain.length > 0
  );
  if (!input.candidate.party_emails.includes(from) && matchingPartyDomain) {
    score += 0.1;
    reasons.push("sender domain matches a known party");
  }

  if (normalize(input.escalationEmail) === from) {
    score += input.onlyOpenCandidate ? 0.35 : 0.2;
    reasons.push("sender is the realtor who owns this TC");
  }

  const propertyScore = propertyTokenScore(text, input.candidate.property_address);
  if (propertyScore > 0) {
    score += propertyScore;
    reasons.push("email references the property");
  }

  const partyNameHits = input.candidate.party_names.filter((name) =>
    includesMeaningful(text, name)
  ).length;
  if (partyNameHits > 0) {
    score += Math.min(0.25, partyNameHits * 0.1);
    reasons.push("email references known transaction parties");
  }

  if (
    input.candidate.recent_subjects.some(
      (subject) => subject.length >= 5 && normalize(input.inbound.subject).includes(subject)
    )
  ) {
    score += 0.1;
    reasons.push("subject resembles recent transaction email");
  }

  if (score === 0 && input.onlyOpenCandidate && normalize(input.escalationEmail) === from) {
    score = 0.45;
    reasons.push("only active transaction for this realtor");
  }

  return {
    transactionId: input.candidate.id,
    confidence: Math.min(1, Number(score.toFixed(3))),
    reasons,
    propertyAddress: input.candidate.property_address ?? undefined
  };
}

export function matchInboundToTransaction(input: {
  inbound: NormalizedInboundEmail;
  emailText: string;
  escalationEmail: string;
  candidates: TransactionMatchCandidate[];
}): DealMatchResult {
  if (input.candidates.length === 0) {
    return {
      confidence: 0,
      reasons: ["no active transactions available"],
      ambiguous: false,
      candidates: []
    };
  }

  const scored = input.candidates
    .map((candidate) =>
      scoreCandidate({
        inbound: input.inbound,
        emailText: input.emailText,
        escalationEmail: input.escalationEmail,
        candidate,
        onlyOpenCandidate: input.candidates.length === 1
      })
    )
    .sort((left, right) => right.confidence - left.confidence);

  const [best, second] = scored;
  const ambiguous =
    Boolean(second) &&
    best.confidence >= 0.2 &&
    Math.abs(best.confidence - second.confidence) < 0.15;
  const transactionId = best.confidence >= 0.45 && !ambiguous ? best.transactionId : undefined;

  return {
    transactionId,
    confidence: best.confidence,
    reasons: best.reasons,
    ambiguous,
    candidates: scored.slice(0, 5)
  };
}
