import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";
import { replyTcEmail, sendTcEmail } from "@/lib/agentmail/service";
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
import { buildStatusAnswer, isStatusQuestion } from "@/lib/workflow/status-responder";
import { createOpeningTasks, createTasksForMilestone } from "@/lib/workflow/tasks";

function isoDateOrUndefined(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

async function respondToInbound(input: {
  inboxId: string;
  messageId?: string;
  to: string[];
  subject: string;
  text: string;
  labels: string[];
}) {
  if (input.messageId) {
    return replyTcEmail({
      inboxId: input.inboxId,
      messageId: input.messageId,
      to: input.to,
      text: input.text,
      labels: input.labels
    });
  }

  return sendTcEmail({
    inboxId: input.inboxId,
    to: input.to,
    subject: input.subject,
    text: input.text,
    labels: input.labels
  });
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

  const emailText = [inbound.subject, inbound.text, inbound.html].filter(Boolean).join("\n\n");

  if (inbound.attachments.length === 0 && isStatusQuestion(emailText)) {
    const answer = await buildStatusAnswer(tcProfile.team_id);

    await createMessage({
      transactionId: answer.transactionId,
      agentMailMessageId: inbound.messageId || inbound.eventId,
      threadId: inbound.threadId,
      from: inbound.from,
      to: inbound.to,
      cc: inbound.cc,
      subject: inbound.subject,
      receivedAt: new Date(),
      summary: "Inbound status question received by TC inbox."
    });
    await respondToInbound({
      inboxId: inbound.inboxId,
      messageId: inbound.messageId,
      to: [tcProfile.escalation_email],
      subject: `Re: ${inbound.subject}`,
      text: answer.text,
      labels: ["status_answer"]
    });
    await createAuditEvent({
      teamId: tcProfile.team_id,
      transactionId: answer.transactionId,
      actor: "tc_agent",
      eventType: "status_question_answered",
      payload: { subject: inbound.subject }
    });
    await markWebhookEventProcessed(input.webhookEventId);

    return {
      status: "status_answered",
      transactionId: answer.transactionId
    };
  }

  const transaction = await createTransaction({
    teamId: tcProfile.team_id,
    tcProfileId: tcProfile.id,
    status: "intake_processing"
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

    await respondToInbound({
      inboxId: inbound.inboxId,
      messageId: inbound.messageId,
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

  await createAuditEvent({
    teamId: tcProfile.team_id,
    transactionId: transaction.id,
    actor: "tc_agent",
    eventType: "contract_pdf_extraction_started",
    payload: {
      filename: pdfAttachment.filename
    }
  });

  try {
    facts = await extractContractFactsFromPdf({
      filename: pdfAttachment.filename,
      pdf: pdfAttachment.body,
      emailContext: emailText
    });
    extractionMode = "anthropic_pdf";
    await markStoredAttachmentProcessed(pdfAttachment, "approved");
    await createAuditEvent({
      teamId: tcProfile.team_id,
      transactionId: transaction.id,
      actor: "tc_agent",
      eventType: "contract_pdf_extraction_completed",
      payload: {
        filename: pdfAttachment.filename,
        contractVersion: facts.contractVersion
      }
    });
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

  await respondToInbound({
    inboxId: inbound.inboxId,
    messageId: inbound.messageId,
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
