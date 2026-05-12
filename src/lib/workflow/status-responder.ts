import {
  findLatestOpenTransaction,
  getTransactionStatusSummary
} from "@/lib/db/repositories";

const statusQuestionPatterns = [
  /\bnext deadline\b/i,
  /\bwhat'?s next\b/i,
  /\beverything good\b/i,
  /\bwhere (are we|is this|is the deal)\b/i,
  /\bstatus\b/i,
  /\bdeadline\b/i,
  /\bwhat do we need\b/i
];

export function isStatusQuestion(text: string) {
  return statusQuestionPatterns.some((pattern) => pattern.test(text));
}

export async function buildStatusAnswer(teamId: string) {
  const latest = await findLatestOpenTransaction(teamId);

  if (!latest) {
    return {
      transactionId: undefined,
      text:
        "I do not have an active transaction file yet. Forward the executed contract PDF and I will open the file."
    };
  }

  const summary = await getTransactionStatusSummary(latest.id);
  const transaction = summary.transaction ?? latest;
  const next = summary.nextMilestone;
  const blockers = summary.blockers;
  const property = transaction.property_address ?? "the current transaction";
  const nextLine = next
    ? `${next.title}${next.due_date ? ` due ${next.due_date}` : " is event-triggered"}`
    : "No upcoming milestone is available yet.";
  const blockerLine =
    blockers.length > 0
      ? `\n\nOpen blockers:\n${blockers.map((blocker) => `- ${blocker.title} (${blocker.risk_level})`).join("\n")}`
      : "\n\nI do not see open blockers right now.";

  return {
    transactionId: latest.id,
    text: `Current file: ${property}\nStatus: ${transaction.status}${transaction.phase ? ` (${transaction.phase})` : ""}\nNext deadline: ${nextLine}${blockerLine}`
  };
}
