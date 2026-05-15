import { describe, expect, it } from "vitest";
import { normalizeEvidence } from "@/lib/workflow/evidence-normalizer";

describe("normalizeEvidence", () => {
  it("normalizes party confirmations from inbound email text", () => {
    const [item] = normalizeEvidence({
      type: "inbound_email",
      subject: "Earnest money",
      emailText: "We have earnest money.",
      from: "title@example.com"
    });

    expect(item).toMatchObject({
      type: "party_confirmation",
      source: "email",
      confidence: 0.7
    });
  });

  it("normalizes negative blocker language without confirmation", () => {
    const items = normalizeEvidence({
      type: "inbound_email",
      subject: "Earnest money",
      emailText: "We do not have earnest money yet.",
      from: "title@example.com"
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "negative_or_blocker",
      negated: true
    });
  });

  it("normalizes stored attachments as document evidence", () => {
    const items = normalizeEvidence({
      type: "document_stored",
      documents: [
        {
          documentId: "doc-1",
          filename: "survey.pdf",
          contentType: "application/pdf"
        }
      ]
    });

    expect(items).toEqual([
      expect.objectContaining({
        type: "document_received",
        documentId: "doc-1",
        filename: "survey.pdf"
      })
    ]);
  });
});
