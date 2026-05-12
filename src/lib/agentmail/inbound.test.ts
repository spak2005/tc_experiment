import { describe, expect, it } from "vitest";
import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";

describe("normalizeAgentMailInbound", () => {
  it("normalizes AgentMail snake_case attachment fields", () => {
    const inbound = normalizeAgentMailInbound({
      event_id: "evt_123",
      message: {
        inbox_id: "inbox_123",
        message_id: "msg_123",
        thread_id: "thread_123",
        from: "agent@example.com",
        to: ["tc@agentmail.to"],
        subject: "Executed contract",
        text: "Attached",
        attachments: [
          {
            attachment_id: "att_123",
            filename: "contract.pdf",
            content_type: "application/pdf"
          }
        ]
      }
    });

    expect(inbound).toMatchObject({
      eventId: "evt_123",
      inboxId: "inbox_123",
      messageId: "msg_123",
      attachments: [
        {
          id: "att_123",
          filename: "contract.pdf",
          contentType: "application/pdf"
        }
      ]
    });
  });
});
