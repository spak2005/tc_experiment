import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTcEmailOnce } from "@/lib/agentmail/service";

const mocks = vi.hoisted(() => ({
  beginOutboundEmailAction: vi.fn(),
  markOutboundEmailFailed: vi.fn(),
  markOutboundEmailSent: vi.fn(),
  send: vi.fn()
}));

vi.mock("@/lib/agentmail/client", () => ({
  getAgentMailClient: () => ({
    inboxes: {
      messages: {
        send: mocks.send,
        reply: vi.fn()
      },
      create: vi.fn(),
      drafts: {
        create: vi.fn()
      }
    }
  })
}));

vi.mock("@/lib/config/env", () => ({
  getEnv: () => ({ AGENTMAIL_DOMAIN: "example.com" })
}));

vi.mock("@/lib/db/repositories", () => ({
  beginOutboundEmailAction: mocks.beginOutboundEmailAction,
  markOutboundEmailFailed: mocks.markOutboundEmailFailed,
  markOutboundEmailSent: mocks.markOutboundEmailSent
}));

const action = {
  id: "action-1",
  idempotency_key: "key-1",
  status: "sending",
  send_kind: "send",
  inbox_id: "inbox-1",
  message_id: null,
  to_addresses: ["agent@example.com"],
  cc_addresses: [],
  bcc_addresses: [],
  subject: "Subject",
  text_body: "Body",
  html_body: null,
  labels: [],
  provider_message_id: null,
  provider_thread_id: null,
  last_error: null
};

describe("sendTcEmailOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markOutboundEmailFailed.mockResolvedValue(null);
    mocks.markOutboundEmailSent.mockResolvedValue(null);
  });

  it("does not call AgentMail again when the action was already sent", async () => {
    mocks.beginOutboundEmailAction.mockResolvedValue({
      acquired: false,
      action: {
        ...action,
        status: "sent",
        provider_message_id: "message-1",
        provider_thread_id: "thread-1"
      }
    });

    const result = await sendTcEmailOnce({
      idempotencyKey: "key-1",
      inboxId: "inbox-1",
      to: ["agent@example.com"],
      subject: "Subject",
      text: "Body"
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(result).toEqual({ messageId: "message-1", threadId: "thread-1" });
  });

  it("marks the action failed when AgentMail send fails", async () => {
    mocks.beginOutboundEmailAction.mockResolvedValue({
      acquired: true,
      action
    });
    mocks.send.mockRejectedValueOnce(new Error("AgentMail down"));

    await expect(
      sendTcEmailOnce({
        idempotencyKey: "key-1",
        inboxId: "inbox-1",
        to: ["agent@example.com"],
        subject: "Subject",
        text: "Body"
      })
    ).rejects.toThrow("AgentMail down");

    expect(mocks.markOutboundEmailFailed).toHaveBeenCalledWith({
      idempotencyKey: "key-1",
      error: "AgentMail down"
    });
  });
});
