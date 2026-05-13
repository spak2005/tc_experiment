import { describe, expect, it } from "vitest";
import { matchInboundToTransaction } from "@/lib/agent/matching";
import type { NormalizedInboundEmail } from "@/lib/agentmail/inbound";

const baseInbound: NormalizedInboundEmail = {
  eventId: "event-1",
  inboxId: "tc@example.com",
  messageId: "message-1",
  from: "agent@example.com",
  to: ["tc@example.com"],
  cc: [],
  subject: "Question",
  text: "What is the next deadline?",
  attachments: []
};

const candidate = {
  id: "tx-1",
  property_address: "123 Main Street, Austin, TX",
  status: "needs_info",
  phase: "opening_file",
  effective_date: null,
  closing_date: null,
  updated_at: "2026-05-12T00:00:00Z",
  party_emails: ["buyer@example.com"],
  party_names: ["Jane Buyer"],
  thread_ids: ["thread-1"],
  recent_subjects: ["opening file"]
};

describe("matchInboundToTransaction", () => {
  it("matches a new thread from the realtor when there is one active deal", () => {
    const result = matchInboundToTransaction({
      inbound: baseInbound,
      emailText: "Is everything good, what's the next deadline?",
      escalationEmail: "agent@example.com",
      candidates: [candidate]
    });

    expect(result.transactionId).toBe("tx-1");
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
    expect(result.reasons).toContain("sender is the realtor who owns this TC");
  });

  it("uses property references to match across unrelated threads", () => {
    const result = matchInboundToTransaction({
      inbound: {
        ...baseInbound,
        from: "escrow@titleco.com",
        subject: "123 Main Street"
      },
      emailText: "The title commitment for 123 Main Street is attached.",
      escalationEmail: "agent@example.com",
      candidates: [
        candidate,
        {
          ...candidate,
          id: "tx-2",
          property_address: "789 Oak Avenue, Austin, TX",
          thread_ids: []
        }
      ]
    });

    expect(result.transactionId).toBe("tx-1");
    expect(result.reasons).toContain("email references the property");
  });

  it("does not select a deal when the best matches are ambiguous", () => {
    const result = matchInboundToTransaction({
      inbound: {
        ...baseInbound,
        from: "agent@example.com"
      },
      emailText: "Can you check this one?",
      escalationEmail: "agent@example.com",
      candidates: [
        candidate,
        {
          ...candidate,
          id: "tx-2",
          property_address: "789 Oak Avenue, Austin, TX",
          thread_ids: []
        }
      ]
    });

    expect(result.transactionId).toBeUndefined();
    expect(result.ambiguous).toBe(true);
  });
});
