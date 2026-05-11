import { processAgentMailInbound } from "@/lib/workflow/intake";
import { inngest } from "@/lib/inngest/client";
import { events } from "@/lib/inngest/events";

export const processInboundEmail = inngest.createFunction(
  { id: "process-agentmail-inbound-email" },
  { event: events.agentMailInboundReceived },
  async ({ event, step }) => {
    return step.run("process inbound email", async () =>
      processAgentMailInbound({
        webhookEventId: event.data.webhookEventId,
        agentMailEvent: event.data.agentMailEvent
      })
    );
  }
);

export const functions = [processInboundEmail];
