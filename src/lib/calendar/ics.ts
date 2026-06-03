export interface CalendarFeedTransaction {
  id: string;
  propertyAddress?: string;
}

export interface CalendarFeedEventMilestone {
  id: string;
  key: string;
  title: string;
  phase: string;
  dueDate?: string;
  sourceReference?: string;
  riskLevel: string;
}

export interface BuildTransactionCalendarInput {
  transaction: CalendarFeedTransaction;
  milestones: CalendarFeedEventMilestone[];
  generatedAt?: Date;
}

function formatDateOnly(date: string) {
  return date.replaceAll("-", "");
}

function nextDateOnly(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function formatTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string) {
  if (line.length <= 75) return line;

  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
  }
  chunks.push(remaining);
  return chunks.join("\r\n ");
}

function line(name: string, value: string) {
  return foldLine(`${name}:${value}`);
}

function eventDescription(input: {
  property: string;
  milestone: CalendarFeedEventMilestone;
}) {
  return [
    `Property: ${input.property}`,
    `Phase: ${input.milestone.phase}`,
    `Risk: ${input.milestone.riskLevel}`,
    input.milestone.sourceReference ? `Source: ${input.milestone.sourceReference}` : undefined,
    "Stephanie is monitoring this deadline and will escalate if it is at risk."
  ]
    .filter(Boolean)
    .join("\n");
}

function eventAlarm(trigger: string) {
  return [
    "BEGIN:VALARM",
    `TRIGGER:${trigger}`,
    "ACTION:DISPLAY",
    line("DESCRIPTION", escapeText("Transaction deadline reminder")),
    "END:VALARM"
  ];
}

export function buildTransactionCalendarIcs(input: BuildTransactionCalendarInput) {
  const generatedAt = formatTimestamp(input.generatedAt ?? new Date());
  const property = input.transaction.propertyAddress ?? "Transaction";
  const datedMilestones = input.milestones.filter((milestone) => milestone.dueDate);
  const calendarName = `${property} deadlines`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stephanie TC//Transaction Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", escapeText(calendarName))
  ];

  for (const milestone of datedMilestones) {
    const dueDate = milestone.dueDate as string;
    const uid = `${input.transaction.id}-${milestone.key || milestone.id}@stephanie-tc`;
    lines.push(
      "BEGIN:VEVENT",
      line("UID", uid),
      `DTSTAMP:${generatedAt}`,
      `DTSTART;VALUE=DATE:${formatDateOnly(dueDate)}`,
      `DTEND;VALUE=DATE:${formatDateOnly(nextDateOnly(dueDate))}`,
      line("SUMMARY", escapeText(milestone.title)),
      line("DESCRIPTION", escapeText(eventDescription({ property, milestone }))),
      "TRANSP:TRANSPARENT"
    );

    if (milestone.riskLevel === "urgent" || milestone.riskLevel === "critical") {
      lines.push(...eventAlarm("-P3D"));
    }
    lines.push(...eventAlarm("-P1D"), "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
