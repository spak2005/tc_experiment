import { describe, expect, it, vi } from "vitest";
import { buildAgentContextPack } from "@/lib/agent/context";

vi.mock("@/lib/db/repositories", () => ({
  findTransactionMatchCandidates: vi.fn(async () => []),
  getTransactionContextData: vi.fn()
}));

describe("buildAgentContextPack", () => {
  it("includes temporal context for agent reasoning", async () => {
    const context = await buildAgentContextPack({
      inbound: {
        eventId: "event-1",
        inboxId: "tc@example.com",
        messageId: "message-1",
        from: "agent@example.com",
        to: ["tc@example.com"],
        cc: [],
        subject: "Status",
        text: "What is next?",
        attachments: []
      },
      tcProfile: {
        id: "tc-1",
        team_id: "team-1",
        display_name: "Maria's TC",
        inbox_address: "tc@example.com",
        agentmail_inbox_id: "tc@example.com",
        escalation_email: "agent@example.com"
      }
    });

    expect(context.temporalContext.timezone).toBe("America/Chicago");
    expect(context.temporalContext.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.temporalContext.now).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-\d{2}:\d{2}$/
    );
  });
});
