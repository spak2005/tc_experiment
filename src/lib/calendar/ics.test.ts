import { describe, expect, it } from "vitest";
import { buildTransactionCalendarIcs } from "@/lib/calendar/ics";

const generatedAt = new Date("2026-06-03T12:34:56.000Z");

function buildIcs() {
  return buildTransactionCalendarIcs({
    generatedAt,
    transaction: {
      id: "tx-1",
      propertyAddress: "123 Main St"
    },
    milestones: [
      {
        id: "milestone-1",
        key: "option_period_expires",
        title: "Option period expires at 5:00 PM",
        phase: "inspection_option_period",
        dueDate: "2026-06-10",
        sourceReference: "Paragraph 5B",
        riskLevel: "critical"
      },
      {
        id: "milestone-2",
        key: "title_commitment_due",
        title: "Title commitment due",
        phase: "title_survey_disclosures",
        riskLevel: "watch"
      }
    ]
  });
}

describe("buildTransactionCalendarIcs", () => {
  it("emits a valid calendar with all-day deadline events", () => {
    const ics = buildIcs();

    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:tx-1-option_period_expires@stephanie-tc\r\n");
    expect(ics).toContain("DTSTAMP:20260603T123456Z\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260610\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260611\r\n");
    expect(ics).toContain("TRANSP:TRANSPARENT\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("skips milestones without due dates", () => {
    const ics = buildIcs();

    expect(ics).not.toContain("title_commitment_due");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("includes one-day alarms and extra alarms for urgent deadlines", () => {
    const ics = buildIcs();

    expect(ics).toContain("TRIGGER:-P1D\r\n");
    expect(ics).toContain("TRIGGER:-P3D\r\n");
  });

  it("escapes and folds calendar text", () => {
    const ics = buildTransactionCalendarIcs({
      generatedAt,
      transaction: {
        id: "tx-1",
        propertyAddress: "123 Main St, Unit 4"
      },
      milestones: [
        {
          id: "milestone-1",
          key: "long",
          title:
            "Seller disclosure due, including the very long backup packet with notes; review carefully",
          phase: "title_survey_disclosures",
          dueDate: "2026-06-12",
          riskLevel: "watch"
        }
      ]
    });

    expect(ics).toContain("123 Main St\\, Unit 4");
    expect(ics).toContain("notes\\; review carefully");
    expect(ics).toContain("\r\n ");
  });
});
