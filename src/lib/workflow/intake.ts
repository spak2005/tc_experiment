import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";
import { getTcAttachment, sendTcEmail } from "@/lib/agentmail/service";
import { extractTexasContractFacts } from "@/lib/contracts/extract";
import { validateContractFacts } from "@/lib/contracts/validate";
import {
  createAuditEvent,
  createDocumentRecord,
  createMessage,
  createTransaction,
  findTcProfileByInbox,
  insertMilestones,
  insertTasks,
  markWebhookEventProcessed,
  saveExtractedContractFacts
} from "@/lib/db/repositories";
import { intakeConfirmationEmail } from "@/lib/email/templates";
import { generateTexasMilestones } from "@/lib/milestones/engine";
import { storePrivateDocument } from "@/lib/storage/blob";
import { createOpeningTasks, createTasksForMilestone } from "@/lib/workflow/tasks";

export async function processAgentMailInbound(input: {
  webhookEventId: string;
  agentMailEvent: Record<string, unknown>;
}) {
  const inbound = normalizeAgentMailInbound(input.agentMailEvent);
  const tcProfile = await findTcProfileByInbox(inbound.inboxId);

  if (!tcProfile) {
    return { status: "ignored", reason: "unknown_inbox" };
  }

  const emailText = [inbound.subject, inbound.text, inbound.html].filter(Boolean).join("\n\n");
  const facts = extractTexasContractFacts(emailText);
  const validation = validateContractFacts(facts);
  const transaction = await createTransaction({
    teamId: tcProfile.team_id,
    tcProfileId: tcProfile.id,
    propertyAddress:
      typeof facts.propertyAddress?.value === "string" ? facts.propertyAddress.value : undefined,
    effectiveDate:
      typeof facts.effectiveDate?.value === "string" ? facts.effectiveDate.value : undefined,
    closingDate:
      typeof facts.closingDate?.value === "string" ? facts.closingDate.value : undefined,
    status: validation.status === "ready_for_review" ? "needs_agent_confirmation" : "needs_info"
  });

  await createMessage({
    transactionId: transaction.id,
    agentMailMessageId: inbound.messageId || inbound.eventId,
    threadId: inbound.threadId,
    from: inbound.from,
    to: inbound.to,
    cc: inbound.cc,
    subject: inbound.subject,
    receivedAt: new Date(),
    summary: "Inbound intake email received by TC inbox."
  });

  await saveExtractedContractFacts({
    transactionId: transaction.id,
    contractVersion: facts.contractVersion,
    facts,
    validationStatus: validation.status
  });

  for (const attachment of inbound.attachments) {
    const remoteAttachment = await getTcAttachment({
      inboxId: inbound.inboxId,
      messageId: inbound.messageId,
      attachmentId: attachment.id
    });
    const looseAttachment = remoteAttachment as {
      arrayBuffer?: () => Promise<ArrayBuffer>;
      bytes?: () => Promise<Uint8Array>;
    };
    const body = looseAttachment.arrayBuffer
      ? await looseAttachment.arrayBuffer()
      : looseAttachment.bytes
        ? Buffer.from(await looseAttachment.bytes())
        : "";
    const stored = await storePrivateDocument({
      teamId: tcProfile.team_id,
      transactionId: transaction.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      body
    });

    await createDocumentRecord({
      transactionId: transaction.id,
      type: attachment.contentType === "application/pdf" ? "contract" : "attachment",
      name: attachment.filename,
      status: "received",
      blobKey: stored.key,
      sourceMessageId: inbound.messageId
    });
  }

  const milestones = generateTexasMilestones(facts);
  const tasks = [
    ...createOpeningTasks(),
    ...milestones.flatMap((milestone) => createTasksForMilestone(milestone))
  ];

  await insertMilestones(transaction.id, milestones);
  await insertTasks(transaction.id, tasks);

  await createAuditEvent({
    teamId: tcProfile.team_id,
    transactionId: transaction.id,
    actor: "tc_agent",
    eventType: "transaction_intake_processed",
    payload: {
      validationStatus: validation.status,
      missingItems: validation.requiredClarifications
    }
  });

  const confirmation = intakeConfirmationEmail({
    agentName: "there",
    propertyAddress:
      typeof facts.propertyAddress?.value === "string" ? facts.propertyAddress.value : undefined,
    missingItems: validation.requiredClarifications
  });

  await sendTcEmail({
    inboxId: inbound.inboxId,
    to: [tcProfile.escalation_email],
    subject: confirmation.subject,
    text: confirmation.text,
    labels: ["intake", validation.status]
  });

  await markWebhookEventProcessed(input.webhookEventId);

  return {
    status: "processed",
    transactionId: transaction.id,
    validationStatus: validation.status
  };
}
