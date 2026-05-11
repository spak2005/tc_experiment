import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { requireEnv } from "@/lib/config/env";
import { recordWebhookEvent } from "@/lib/db/repositories";
import { inngest } from "@/lib/inngest/client";
import { events } from "@/lib/inngest/events";

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

  const eventId =
    String(event.id ?? event.event_id ?? event.message_id ?? crypto.randomUUID());

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
