import { describe, expect, it } from "vitest";
import { transactionMapEmail } from "@/lib/email/templates";

const baseInput = {
  propertyAddress: "123 Main St",
  effectiveDate: "2026-06-01",
  closingDate: "2026-06-30",
  milestones: [
    {
      title: "Closing date",
      dueDate: "2026-06-30",
      sourceReference: "Paragraph 9A",
      riskLevel: "critical"
    }
  ],
  missingItems: []
};

describe("transactionMapEmail", () => {
  it("includes the calendar CTA when a calendar URL is provided", () => {
    const email = transactionMapEmail({
      ...baseInput,
      calendarUrl: "https://tc.example.com/calendar/transactions/token-1"
    });

    expect(email.text).toContain("Add these deadlines to Google Calendar:");
    expect(email.text).toContain("https://tc.example.com/calendar/transactions/token-1");
  });

  it("omits the calendar CTA when no calendar URL is provided", () => {
    const email = transactionMapEmail(baseInput);

    expect(email.text).not.toContain("Add these deadlines to Google Calendar:");
  });
});
