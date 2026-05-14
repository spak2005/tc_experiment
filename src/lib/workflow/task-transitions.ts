import { addDays, parseDateOnly, toDateOnly } from "@/lib/milestones/date-rules";

export const DEFAULT_STALE_AFTER_DAYS = 2;

export function readStaleAfterDays(metadata?: Record<string, unknown> | null): number {
  const value = metadata?.staleAfterDays;

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  return DEFAULT_STALE_AFTER_DAYS;
}

export function resolveTaskFollowUpDate(input: {
  today: string;
  metadata?: Record<string, unknown> | null;
  staleAfterDaysOverride?: number;
}): string | undefined {
  const today = parseDateOnly(input.today);

  if (!today) return undefined;

  const offset =
    typeof input.staleAfterDaysOverride === "number" && input.staleAfterDaysOverride > 0
      ? Math.floor(input.staleAfterDaysOverride)
      : readStaleAfterDays(input.metadata);

  return toDateOnly(addDays(today, offset));
}
