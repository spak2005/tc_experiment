const federalHolidayMonthDays = new Set([
  "01-01",
  "06-19",
  "07-04",
  "11-11",
  "12-25"
]);

export function parseDateOnly(value: string | number | boolean | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function subtractBusinessDays(date: Date, days: number): Date {
  let current = new Date(date);
  let remaining = days;

  while (remaining > 0) {
    current = addDays(current, -1);

    if (!isWeekendOrHoliday(current)) {
      remaining -= 1;
    }
  }

  return current;
}

export function isWeekendOrHoliday(date: Date): boolean {
  const day = date.getUTCDay();
  const monthDay = date.toISOString().slice(5, 10);

  return day === 0 || day === 6 || federalHolidayMonthDays.has(monthDay);
}

export function extendIfWeekendOrHoliday(date: Date): Date {
  let next = new Date(date);

  while (isWeekendOrHoliday(next)) {
    next = addDays(next, 1);
  }

  return next;
}
