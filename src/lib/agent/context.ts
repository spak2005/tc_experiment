import type { AgentContextPack, TransactionContext } from "@/lib/agent/types";
import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";
import {
  findTransactionMatchCandidates,
  getTransactionContextData
} from "@/lib/db/repositories";
import { matchInboundToTransaction } from "@/lib/agent/matching";
import { buildDealMemory } from "@/lib/agent/memory";
import { getTemporalContext } from "@/lib/time/clock";

export function buildInboundEmailText(inbound: Pick<NormalizedInboundEmail, "subject" | "text" | "html">) {
  return [inbound.subject, inbound.text, inbound.html].filter(Boolean).join("\n\n");
}

function firstOpenMilestone(milestones: Array<Record<string, unknown>>) {
  return milestones.find((milestone) => !milestone.completed_at);
}

function deriveMissingItems(input: {
  transaction: Record<string, unknown>;
  facts?: Record<string, unknown>;
}) {
  const missing = new Set<string>();

  if (!input.transaction.property_address) {
    missing.add("Confirm the property address.");
  }
  if (!input.transaction.effective_date) {
    missing.add("Confirm the Effective Date.");
  }
  if (!input.transaction.closing_date) {
    missing.add("Confirm the Closing Date.");
  }

  const facts = input.facts?.facts;
  if (facts && typeof facts === "object") {
    const record = facts as Record<string, { value?: unknown } | undefined>;
    if (!record.financingType?.value) {
      missing.add("Confirm whether this is cash or financed.");
    }
    if (!record.earnestMoneyAmount?.value) {
      missing.add("Confirm the earnest money amount.");
    }
    if (!record.optionPeriodDays?.value) {
      missing.add("Confirm the option period length.");
    }
    if (!record.titleCompany?.value) {
      missing.add("Provide the title company or escrow officer.");
    }
  }

  return [...missing];
}

export async function getTransactionContext(
  transactionId: string
): Promise<TransactionContext | undefined> {
  const data = await getTransactionContextData(transactionId);

  if (!data.transaction) {
    return undefined;
  }

  return {
    transaction: data.transaction,
    facts: data.facts ? { ...data.facts } : undefined,
    canonicalFacts: data.canonicalFacts,
    recentChanges: data.recentChanges,
    milestones: data.milestones,
    tasks: data.tasks,
    documents: data.documents,
    messages: data.messages,
    blockers: data.blockers,
    memory: data.memory ? { ...data.memory } : undefined,
    dealMemory: buildDealMemory(data.memory ? { ...data.memory } : undefined),
    recentDecisions: data.recentDecisions,
    nextMilestone: firstOpenMilestone(data.milestones),
    missingItems: deriveMissingItems({
      transaction: data.transaction,
      facts: data.facts ? { ...data.facts } : undefined
    })
  };
}

export async function buildAgentContextPack(input: {
  inbound: NormalizedInboundEmail;
  tcProfile: {
    id: string;
    team_id: string;
    display_name: string;
    inbox_address: string;
    agentmail_inbox_id: string | null;
    escalation_email: string;
  };
}): Promise<AgentContextPack> {
  const emailText = buildInboundEmailText(input.inbound);
  const candidates = await findTransactionMatchCandidates(input.tcProfile.team_id);
  const match = matchInboundToTransaction({
    inbound: input.inbound,
    emailText,
    escalationEmail: input.tcProfile.escalation_email,
    candidates
  });
  const transactionContext = match.transactionId
    ? await getTransactionContext(match.transactionId)
    : undefined;

  return {
    inbound: input.inbound,
    emailText,
    temporalContext: getTemporalContext(),
    tcProfile: {
      id: input.tcProfile.id,
      teamId: input.tcProfile.team_id,
      displayName: input.tcProfile.display_name,
      inboxAddress: input.tcProfile.inbox_address,
      inboxId: input.tcProfile.agentmail_inbox_id ?? input.tcProfile.inbox_address,
      escalationEmail: input.tcProfile.escalation_email
    },
    match,
    transactionContext
  };
}
