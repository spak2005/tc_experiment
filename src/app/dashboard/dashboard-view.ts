export interface DashboardSummaryInput {
  transactions: Array<{ open_task_count: number }>;
  approvals: unknown[];
  blockers: unknown[];
}

export interface DocumentProgressInput {
  document_count: number;
  outstanding_document_count: number;
}

export function buildDashboardSummary(input: DashboardSummaryInput) {
  return {
    activeFiles: input.transactions.length,
    waitingOnYou: input.approvals.length + input.blockers.length,
    openTasks: input.transactions.reduce(
      (total, transaction) => total + transaction.open_task_count,
      0
    )
  };
}

export function documentProgressLabel(input: DocumentProgressInput) {
  const readyCount = Math.max(0, input.document_count - input.outstanding_document_count);

  return `${readyCount}/${input.document_count} ready`;
}

export function formatDashboardDate(value?: string | null) {
  if (!value) return "Pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago"
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago"
  }).format(new Date(value));
}

export function humanizeDashboardValue(value: string) {
  return value.replaceAll("_", " ");
}

export function pluralizeDashboardCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
