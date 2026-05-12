import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";
import { sendTcEmail } from "@/lib/agentmail/service";
import { extractContractFactsFromPdf } from "@/lib/contracts/anthropic-extract";
import { extractTexasContractFacts } from "@/lib/contracts/extract";
import { getStringFact } from "@/lib/contracts/facts";
import { validateContractFacts } from "@/lib/contracts/validate";
import {
  createAuditEvent,
  createMessage,
  createTransaction,
  findTcProfileByInbox,
  insertMilestones,
  insertTasks,
  markWebhookEventProcessed,
  saveExtractedContractFacts,
  updateTransactionFromFacts
} from "@/lib/db/repositories";
import {
  intakeConfirmationEmail,
  transactionMapEmail
} from "@/lib/email/templates";
import {
  isPdfAttachment,
  markStoredAttachmentProcessed,
  storeIncomingAttachment
} from "@/lib/documents/attachments";
import { generateTexasMilestones } from "@/lib/milestones/engine";
import { createOpeningTasks, createTasksForMilestone } from "@/lib/workflow/tasks";

function isoDateOrUndefined(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export async function processAgentMailInbound(input: {
  webhookEventId: string;
  agentMailEvent: Record<string, unknown>;
}) {
  const inbound = normalizeAgentMailInbound(input.agentMailEvent);
  const tcProfile = await findTcProfileByInbox(inbound.inboxId);

  if (!tcProfile) {
    return { status: "ignored", reason: "unknown_inbox" };
  }

  const transaction = await createTransaction({
    teamId: tcProfile.team_id,
    tcProfileId: tcProfile.id,
    status: "intake_processing"
  });
  const emailText = [inbound.subject, inbound.text, inbound.html].filter(Boolean).join("\n\n");

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

  const storedAttachments = [];

  for (const attachment of inbound.attachments) {
    const storedAttachment = await storeIncomingAttachment({
      teamId: tcProfile.team_id,
      transactionId: transaction.id,
      inboxId: inbound.inboxId,
      messageId: inbound.messageId,
      attachment
    });
    storedAttachments.push(storedAttachment);
  }

  const pdfAttachment = storedAttachments.find((attachment) =>
    isPdfAttachment(attachment)
  );

  if (!pdfAttachment) {
    const confirmation = intakeConfirmationEmail({
      agentName: "there",
      missingItems: ["Forward the executed contract PDF."]
    });

    await sendTcEmail({
      inboxId: inbound.inboxId,
      to: [tcProfile.escalation_email],
      subject: confirmation.subject,
      text: confirmation.text,
      labels: ["intake", "missing_pdf"]
    });
    await createAuditEvent({
      teamId: tcProfile.team_id,
      transactionId: transaction.id,
      actor: "tc_agent",
      eventType: "contract_pdf_missing",
      payload: { attachmentCount: inbound.attachments.length }
    });
    await markWebhookEventProcessed(input.webhookEventId);

    return {
      status: "needs_pdf",
      transactionId: transaction.id
    };
  }

  await createAuditEvent({
    teamId: tcProfile.team_id,
    transactionId: transaction.id,
    actor: "tc_agent",
    eventType: "contract_pdf_received",
    payload: {
      filename: pdfAttachment.filename,
      blobKey: pdfAttachment.blobKey
    }
  });

  let facts = extractTexasContractFacts(emailText);
  let extractionMode: "anthropic_pdf" | "email_fallback" = "email_fallback";

  try {
    facts = await extractContractFactsFromPdf({
      filename: pdfAttachment.filename,
      pdf: pdfAttachment.body,
      emailContext: emailText
    });
    extractionMode = "anthropic_pdf";
    await markStoredAttachmentProcessed(pdfAttachment, "approved");
  } catch (error) {
    await markStoredAttachmentProcessed(pdfAttachment, "needs_correction");
    await createAuditEvent({
      teamId: tcProfile.team_id,
      transactionId: transaction.id,
      actor: "tc_agent",
      eventType: "contract_pdf_extraction_failed",
      payload: {
        error: error instanceof Error ? error.message : "Unknown extraction error"
      }
    });
  }

  const validation = validateContractFacts(facts);
  const transactionStatus =
    validation.status === "ready_for_review" ? "needs_agent_confirmation" : "needs_info";
  const propertyAddress = getStringFact(facts.propertyAddress);
  const effectiveDate = isoDateOrUndefined(getStringFact(facts.effectiveDate));
  const closingDate = isoDateOrUndefined(getStringFact(facts.closingDate));
  const milestones = generateTexasMilestones(facts);
  const tasks = [
    ...createOpeningTasks(),
    ...milestones.flatMap((milestone) => createTasksForMilestone(milestone))
  ];

  await updateTransactionFromFacts({
    transactionId: transaction.id,
    propertyAddress,
    effectiveDate,
    closingDate,
    status: transactionStatus,
    phase: "opening_file"
  });
  await saveExtractedContractFacts({
    transactionId: transaction.id,
    contractVersion: facts.contractVersion,
    facts,
    validationStatus: validation.status
  });
  await insertMilestones(transaction.id, milestones);
  await insertTasks(transaction.id, tasks);

  await createAuditEvent({
    teamId: tcProfile.team_id,
    transactionId: transaction.id,
    actor: "tc_agent",
    eventType: "transaction_intake_processed",
    payload: {
      validationStatus: validation.status,
      missingItems: validation.requiredClarifications,
      extractionMode
    }
  });

  const transactionMap = transactionMapEmail({
    propertyAddress,
    effectiveDate,
    closingDate,
    milestones,
    missingItems: validation.requiredClarifications
  });

  await sendTcEmail({
    inboxId: inbound.inboxId,
    to: [tcProfile.escalation_email],
    subject: transactionMap.subject,
    text: transactionMap.text,
    labels: ["transaction_map", validation.status, extractionMode]
  });

  await markWebhookEventProcessed(input.webhookEventId);

  return {
    status: "processed",
    transactionId: transaction.id,
    validationStatus: validation.status
  };
}
