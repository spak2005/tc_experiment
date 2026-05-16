import { getTransactionContext } from "@/lib/agent/context";
import type { TransactionContext } from "@/lib/agent/types";
import {
  findTcProfileByTransaction,
  getTransactionParties
} from "@/lib/db/repositories";
import { getTemporalContext, type TemporalContext } from "@/lib/time/clock";

export interface ProactiveParty {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  confidence: string | null;
  source: string | null;
}

export interface ProactiveAgentContext {
  temporalContext: TemporalContext;
  tcProfile: {
    id: string;
    userId: string;
    displayName: string;
    inboxAddress: string;
    inboxId: string;
    escalationEmail: string;
  };
  transactionId: string;
  transactionContext: TransactionContext;
  parties: ProactiveParty[];
}

export async function buildProactiveAgentContext(
  transactionId: string
): Promise<ProactiveAgentContext | undefined> {
  const [tcProfile, transactionContext, parties] = await Promise.all([
    findTcProfileByTransaction(transactionId),
    getTransactionContext(transactionId),
    getTransactionParties(transactionId)
  ]);

  if (!tcProfile || !transactionContext) {
    return undefined;
  }

  return {
    temporalContext: getTemporalContext(),
    tcProfile: {
      id: tcProfile.id,
      userId: tcProfile.user_id,
      displayName: tcProfile.display_name,
      inboxAddress: tcProfile.inbox_address,
      inboxId: tcProfile.agentmail_inbox_id ?? tcProfile.inbox_address,
      escalationEmail: tcProfile.escalation_email
    },
    transactionId,
    transactionContext,
    parties
  };
}
