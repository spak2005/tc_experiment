import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTransactionWrites } from "@/lib/transaction-writes/executor";

const mocks = vi.hoisted(() => ({
  appendTransactionMemory: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createTransactionChangeEvent: vi.fn(),
  getTransactionCore: vi.fn(),
  getTransactionFact: vi.fn(),
  updateTransactionCoreFields: vi.fn(),
  updateDocumentRecord: vi.fn(),
  upsertBlockerRecord: vi.fn(),
  upsertMilestoneRecord: vi.fn(),
  upsertParty: vi.fn(),
  upsertTaskRecord: vi.fn(),
  upsertTransactionFact: vi.fn()
}));

vi.mock("@/lib/db/repositories", () => mocks);

const transactionId = "11111111-1111-4111-8111-111111111111";
const source = {
  sourceType: "email",
  sourceReference: "message-1",
  confidence: 0.9,
  rationale: "Realtor confirmed it."
} as const;

describe("executeTransactionWrites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentActivityEvent.mockResolvedValue({});
    mocks.createTransactionChangeEvent.mockResolvedValue({ id: "change-1" });
  });

  it("updates core transaction fields and records a change", async () => {
    mocks.getTransactionCore.mockResolvedValue({
      id: transactionId,
      property_address: "123 Main St",
      side: "unknown",
      status: "needs_info",
      phase: "opening_file",
      current_risk: "normal",
      effective_date: "2026-05-01",
      closing_date: "2026-06-15"
    });
    mocks.updateTransactionCoreFields.mockResolvedValue({ id: transactionId });

    const results = await executeTransactionWrites({
      teamId: "team-1",
      agentDecisionId: "decision-1",
      writes: [
        {
          name: "updateTransactionCore",
          input: { transactionId, closingDate: "2026-06-30" },
          source
        }
      ]
    });

    expect(results[0]).toMatchObject({
      status: "applied",
      fieldKey: "closingDate",
      previousValue: "2026-06-15",
      newValue: "2026-06-30"
    });
    expect(mocks.updateTransactionCoreFields).toHaveBeenCalledWith({
      transactionId,
      closingDate: "2026-06-30"
    });
    expect(mocks.createTransactionChangeEvent).toHaveBeenCalled();
  });

  it("requires approval for high-impact status changes", async () => {
    mocks.getTransactionCore.mockResolvedValue({
      id: transactionId,
      property_address: "123 Main St",
      side: "unknown",
      status: "active",
      phase: "opening_file",
      current_risk: "normal",
      effective_date: "2026-05-01",
      closing_date: "2026-06-15"
    });

    const results = await executeTransactionWrites({
      teamId: "team-1",
      writes: [
        {
          name: "updateTransactionCore",
          input: { transactionId, status: "terminated" },
          source
        }
      ]
    });

    expect(results[0].status).toBe("approval_required");
    expect(mocks.updateTransactionCoreFields).not.toHaveBeenCalled();
  });

  it("marks lower-confidence conflicting facts approval-required", async () => {
    mocks.getTransactionFact.mockResolvedValue({
      value: "ABC Title",
      confidence: "0.950"
    });

    const results = await executeTransactionWrites({
      teamId: "team-1",
      writes: [
        {
          name: "upsertTransactionFact",
          input: { transactionId, key: "titleCompany", value: "XYZ Title" },
          source: { ...source, confidence: 0.7 }
        }
      ]
    });

    expect(results[0].status).toBe("approval_required");
    expect(mocks.upsertTransactionFact).not.toHaveBeenCalled();
  });

  it("upserts parties and avoids direct database access outside the repository", async () => {
    mocks.upsertParty.mockResolvedValue({ id: "party-1", inserted: true });

    const results = await executeTransactionWrites({
      teamId: "team-1",
      writes: [
        {
          name: "upsertParties",
          input: {
            transactionId,
            parties: [{ role: "title", name: "Sarah Escrow", email: "sarah@example.com" }]
          },
          source
        }
      ]
    });

    expect(results[0]).toMatchObject({ status: "applied", targetType: "party" });
    expect(mocks.upsertParty).toHaveBeenCalledTimes(1);
  });
});
