export interface NormalizedInboundEmail {
  eventId: string;
  inboxId: string;
  messageId: string;
  threadId?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
  }>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return asString(record.email) ?? asString(record.address) ?? [];
    }
    return [];
  });
}

export function normalizeAgentMailInbound(
  event: Record<string, unknown>
): NormalizedInboundEmail {
  const message = (event.message ?? event.data ?? event) as Record<string, unknown>;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  return {
    eventId: asString(event.id) ?? asString(event.event_id) ?? crypto.randomUUID(),
    inboxId:
      asString(message.inboxId) ??
      asString(message.inbox_id) ??
      asString(event.inboxId) ??
      asString(event.inbox_id) ??
      "",
    messageId:
      asString(message.messageId) ??
      asString(message.message_id) ??
      asString(event.messageId) ??
      asString(event.message_id) ??
      "",
    threadId: asString(message.threadId) ?? asString(message.thread_id),
    from:
      asString(message.from) ??
      asString((message.from as Record<string, unknown> | undefined)?.email) ??
      "",
    to: asStringArray(message.to),
    cc: asStringArray(message.cc),
    subject: asString(message.subject) ?? "(no subject)",
    text: asString(message.text),
    html: asString(message.html),
    attachments: attachments.flatMap((attachment) => {
      if (!attachment || typeof attachment !== "object") {
        return [];
      }

      const record = attachment as Record<string, unknown>;
      const id =
        asString(record.id) ??
        asString(record.attachmentId) ??
        asString(record.attachment_id);

      if (!id) {
        return [];
      }

      return [
        {
          id,
          filename: asString(record.filename) ?? "attachment",
          contentType:
            asString(record.contentType) ??
            asString(record.content_type) ??
            "application/octet-stream"
        }
      ];
    })
  };
}
