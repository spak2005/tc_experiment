import { describe, expect, it, vi } from "vitest";
import type { ProactiveAgentContext } from "@/lib/agent/proactive-context";
import { decideProactiveAction } from "@/lib/agent/proactive-planner";

vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => {
    throw new Error("LLM unavailable in planner tests");
  },
  getAnthropicModel: () => "test-model"
}));

function context(overrides: Partial<ProactiveAgentContext> = {}): ProactiveAgentContext {
  return {
    temporalContext: {
      today: "2026-05-14",
      now: "2026-05-14T15:00:00.000Z",
      timezone: "America/Chicago",
      businessDay: true
    },
    tcProfile: {
      id: "tc-1",
      teamId: "team-1",
      displayName: "Your TC",
      inboxAddress: "tc@example.com",
      inboxId: "inbox-1",
      escalationEmail: "agent@example.com"
    },
    transactionId: "11111111-1111-4111-8111-111111111111",
    parties: [],
    transactionContext: {
      transaction: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "active",
        phase: "opening_file",
        property_address: "123 Main St"
      },
      canonicalFacts: [],
      recentChanges: [],
      milestones: [],
      tasks: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Send opening email to title",
          owner_role: "tc",
          status: "not_started",
          metadata: {
            outreachKind: "opening_title_email",
            recipientRole: "title",
            requiredContactRoles: ["title"]
          }
        }
      ],
      documents: [],
      messages: [],
      blockers: [],
      dealMemory: {
        dealBrief: "",
        activeQuestionsAndWarnings: []
      },
      recentDecisions: [],
      missingItems: []
    },
    ...overrides
  };
}

describe("decideProactiveAction fallback", () => {
  it("drafts title outreach for approval when the title contact exists", async () => {
    const decision = await decideProactiveAction({
      context: context({
        parties: [
          {
            id: "party-1",
            role: "title",
            name: "Taylor Title",
            email: "title@example.com",
            phone: null,
            organization: "Title Co",
            confidence: "0.900",
            source: "contract"
          }
        ]
      })
    });

    expect(decision).toMatchObject({
      action: "draft_external_email",
      requiresApproval: true,
      taskId: "22222222-2222-4222-8222-222222222222",
      response: {
        to: ["title@example.com"],
        subject: "New contract: 123 Main St"
      }
    });
  });

  it("asks the realtor when the title contact is missing", async () => {
    const decision = await decideProactiveAction({ context: context() });

    expect(decision).toMatchObject({
      action: "send_realtor_email",
      requiresApproval: false,
      taskId: "22222222-2222-4222-8222-222222222222",
      response: {
        to: ["agent@example.com"]
      }
    });
    expect(decision.response?.body).toContain("title");
    expect(decision.transactionWrites[0]).toMatchObject({
      name: "updateTasks",
      input: {
        tasks: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            status: "blocked"
          }
        ]
      }
    });
  });
});
