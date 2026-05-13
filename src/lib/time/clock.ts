import { isWeekendOrHoliday, parseDateOnly } from "@/lib/milestones/date-rules";

export const DEFAULT_TIMEZONE = "America/Chicago";

export interface TemporalContext {
  now: string;
  today: string;
  timezone: string;
  businessDay: boolean;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function offsetForZonedParts(date: Date, parts: ZonedParts) {
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const offsetMinutes = Math.round((zonedAsUtc - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);

  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function formatZonedIso(date: Date, timezone: string) {
  const parts = getZonedParts(date, timezone);
  const offset = offsetForZonedParts(date, parts);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute
  )}:${pad(parts.second)}${offset}`;
}

function formatDateOnly(parts: ZonedParts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getTemporalContext(input?: {
  now?: Date;
  timezone?: string;
}): TemporalContext {
  const timezone = input?.timezone ?? DEFAULT_TIMEZONE;
  const now = input?.now ?? new Date();
  const parts = getZonedParts(now, timezone);
  const today = formatDateOnly(parts);
  const todayDate = parseDateOnly(today);

  return {
    now: formatZonedIso(now, timezone),
    today,
    timezone,
    businessDay: todayDate ? !isWeekendOrHoliday(todayDate) : false
  };
}

export function formatTemporalContextLine(context: TemporalContext): string {
  return `Current date: ${context.today}. Timezone: ${context.timezone}.`;
}
