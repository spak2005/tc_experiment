import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { requireEnv } from "@/lib/config/env";
import { recordWebhookEvent } from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest/client";
import { events } from "@/lib/inngest/events";

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getMessageScopedEventId(event: Record<string, unknown>) {
  const message = (event.message ?? event.data ?? event) as Record<string, unknown>;
  const inboxId =
    asString(message.inboxId) ??
    asString(message.inbox_id) ??
    asString(event.inboxId) ??
    asString(event.inbox_id) ??
    "unknown-inbox";
  const messageId =
    asString(message.messageId) ??
    asString(message.message_id) ??
    asString(event.messageId) ??
    asString(event.message_id);

  if (messageId) {
    return `${inboxId}:message:${messageId}`;
  }

  return String(event.id ?? event.event_id ?? crypto.randomUUID());
}

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  const webhook = new Webhook(requireEnv("AGENTMAIL_WEBHOOK_SECRET"));

  let event: Record<string, unknown>;

  try {
    event = webhook.verify(payload, headers) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const eventId = getMessageScopedEventId(event);

  const stored = await recordWebhookEvent({
    provider: "agentmail",
    externalId: eventId,
    payload: event
  });

  if (stored.inserted) {
    await inngest.send({
      name: events.agentMailInboundReceived,
      data: {
        webhookEventId: stored.id,
        agentMailEvent: event
      }
    });
  }

  return NextResponse.json({ ok: true });
}
