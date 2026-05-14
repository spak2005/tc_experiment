import { describe, expect, it } from "vitest";
import { transactionWriteSchema } from "@/lib/transaction-writes/schemas";

const transactionId = "11111111-1111-4111-8111-111111111111";
const source = {
  sourceType: "email",
  sourceReference: "message-1",
  confidence: 0.9,
  rationale: "Realtor confirmed it."
} as const;

describe("transactionWriteSchema", () => {
  it("accepts valid writes for every transaction write tool", () => {
    const writes = [
      {
        name: "updateTransactionCore",
        input: { transactionId, closingDate: "2026-06-30" },
        source
      },
      {
        name: "upsertTransactionFact",
        input: { transactionId, key: "titleCompany", value: "ABC Title" },
        source
      },
      {
        name: "upsertParties",
        input: {
          transactionId,
          parties: [{ role: "title", name: "Sarah Escrow", email: "sarah@example.com" }]
        },
        source
      },
      {
        name: "upsertMilestones",
        input: {
          transactionId,
          milestones: [
            {
              key: "closing_date",
              title: "Closing date",
              phase: "closing_funding",
              dueDate: "2026-06-30",
              sourceType: "explicit_date",
              riskLevel: "critical",
              metadata: { expectedEvidence: ["funding confirmation"] }
            }
          ]
        },
        source
      },
      {
        name: "updateTasks",
        input: {
          transactionId,
          tasks: [
            {
              title: "Confirm title receipt",
              ownerRole: "title",
              status: "waiting_response",
              followUpDueDate: "2026-06-01",
              metadata: { staleAfterDays: 1 }
            }
          ]
        },
        source
      },
      {
        name: "updateDocuments",
        input: {
          transactionId,
          documents: [
            {
              name: "Contract.pdf",
              type: "contract",
              ownerRole: "agent",
              dueDate: "2026-05-14",
              status: "approved",
              metadata: { expectedEvidence: ["executed pdf"] }
            }
          ]
        },
        source
      },
      {
        name: "upsertBlocker",
        input: {
          transactionId,
          title: "Missing title company",
          details: "Need escrow officer contact.",
          riskLevel: "watch",
          taskId: transactionId
        },
        source
      },
      {
        name: "appendTransactionMemory",
        input: {
          transactionId,
          summary: "Realtor confirmed title contact."
        },
        source
      }
    ];

    for (const write of writes) {
      expect(transactionWriteSchema.safeParse(write).success).toBe(true);
    }
  });

  it("rejects unknown tools, bad dates, invalid confidence, and missing transaction ids", () => {
    expect(
      transactionWriteSchema.safeParse({
        name: "runSql",
        input: { transactionId },
        source
      }).success
    ).toBe(false);
    expect(
      transactionWriteSchema.safeParse({
        name: "updateTransactionCore",
        input: { transactionId, closingDate: "06/30/2026" },
        source
      }).success
    ).toBe(false);
    expect(
      transactionWriteSchema.safeParse({
        name: "upsertTransactionFact",
        input: { transactionId, key: "titleCompany", value: "ABC Title" },
        source: { ...source, confidence: 2 }
      }).success
    ).toBe(false);
    expect(
      transactionWriteSchema.safeParse({
        name: "upsertTransactionFact",
        input: { key: "titleCompany", value: "ABC Title" },
        source
      }).success
    ).toBe(false);
  });
});
