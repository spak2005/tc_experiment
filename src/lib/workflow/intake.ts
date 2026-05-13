import type { AgentContextPack } from "@/lib/agent/types";
import { buildAgentContextPack, getTransactionContext } from "@/lib/agent/context";
import { assessContractDocument } from "@/lib/agent/document-assessment";
import { decideNextAction } from "@/lib/agent/decision";
import { executeAgentDecision } from "@/lib/agent/executor";
import { evaluateActionPolicy } from "@/lib/agent/policy";
import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";
import { getStringFact } from "@/lib/contracts/facts";
import {
  createAgentDecision,
  createAuditEvent,
  createMessage,
  createTransaction,
  findTcProfileByInbox,
  insertMilestones,
  insertTasks,
  markWebhookEventProcessed,
  saveExtractedContractFacts,
  updateTransactionFromFacts,
  upsertTransactionMemory
} from "@/lib/db/repositories";
import {
  isPdfAttachment,
  markStoredAttachmentProcessed,
  storeIncomingAttachment,
  type StoredAttachment
} from "@/lib/documents/attachments";
import { generateTexasMilestones } from "@/lib/milestones/engine";
import { createOpeningTasks, createTasksForMilestone } from "@/lib/workflow/tasks";

function isoDateOrUndefined(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function normalizeEmail(value?: string | null) {
  return (value ?? "").toLowerCase().trim();
}

function isFromTcInbox(input: {
  from: string;
  inboxAddress: string;
  inboxId?: string | null;
}) {
  const from = normalizeEmail(input.from);

  return (
    from.length > 0 &&
    (from === normalizeEmail(input.inboxAddress) || from === normalizeEmail(input.inboxId))
  );
}

async function withTransactionContext(input: {
  context: AgentContextPack;
  transactionId: string;
  confidence: number;
  reasons: string[];
}) {
  const transactionContext = await getTransactionContext(input.transactionId);

  return {
    ...input.context,
    match: {
      transactionId: input.transactionId,
      confidence: input.confidence,
      reasons: input.reasons,
      ambiguous: false,
      candidates: input.context.match.candidates
    },
    transactionContext
  } satisfies AgentContextPack;
}

function documentStatusForUsability(usability: string) {
  if (usability === "usable") return "approved";
  if (usability === "unusable") return "rejected";
  return "needs_correction";
}

async function persistContractAssessment(input: {
  context: AgentContextPack;
  transactionId: string;
  attachment: StoredAttachment;
  assessment: Awaited<ReturnType<typeof assessContractDocument>>;
}) {
  const propertyAddress = getStringFact(input.assessment.facts.propertyAddress);
  const effectiveDate = isoDateOrUndefined(getStringFact(input.assessment.facts.effectiveDate));
  const closingDate = isoDateOrUndefined(getStringFact(input.assessment.facts.closingDate));
  const transactionStatus =
    input.assessment.usability === "unusable"
      ? "blocked_invalid_contract"
      : input.assessment.validationStatus === "ready_for_review"
        ? "needs_agent_confirmation"
        : "needs_info";

  await markStoredAttachmentProcessed(
    input.attachment,
    documentStatusForUsability(input.assessment.usability)
  );
  await updateTransactionFromFacts({
    transactionId: input.transactionId,
    propertyAddress,
    effectiveDate,
    closingDate,
    status: transactionStatus,
    phase: "opening_file"
  });
  await saveExtractedContractFacts({
    transactionId: input.transactionId,
    contractVersion: input.assessment.facts.contractVersion,
    facts: input.assessment.facts,
    validationStatus: input.assessment.validationStatus
  });

  if (input.assessment.usability !== "unusable") {
    const milestones = generateTexasMilestones(input.assessment.facts);
    const tasks = [
      ...createOpeningTasks(),
      ...milestones.flatMap((milestone) => createTasksForMilestone(milestone))
    ];

    await insertMilestones(input.transactionId, milestones);
    await insertTasks(input.transactionId, tasks);
  }

  await upsertTransactionMemory({
    transactionId: input.transactionId,
    summary: [
      propertyAddress ? `Property: ${propertyAddress}` : "Property not confirmed",
      `Document: ${input.assessment.kind}`,
      `Status: ${transactionStatus}`,
      input.assessment.missingItems.length > 0
        ? `Open questions: ${input.assessment.missingItems.join(" ")}`
        : "No critical opening questions."
    ].join("\n"),
    openQuestions: input.assessment.intakeGaps,
    knownContext: {
      documentAssessment: {
        filename: input.assessment.filename,
        kind: input.assessment.kind,
        usability: input.assessment.usability,
        findings: input.assessment.findings
      }
    },
    lastInboundAt: new Date()
  });
  await createAuditEvent({
    teamId: input.context.tcProfile.teamId,
    transactionId: input.transactionId,
    actor: "tc_agent",
    eventType: "contract_document_assessed",
    payload: {
      filename: input.assessment.filename,
      kind: input.assessment.kind,
      usability: input.assessment.usability,
      validationStatus: input.assessment.validationStatus,
      missingItems: input.assessment.missingItems,
      extractionMode: input.assessment.extractionMode
    }
  });
}

async function storeInboundAttachments(input: {
  context: AgentContextPack;
  transactionId: string;
}) {
  const storedAttachments: StoredAttachment[] = [];

  for (const attachment of input.context.inbound.attachments) {
    const storedAttachment = await storeIncomingAttachment({
      teamId: input.context.tcProfile.teamId,
      transactionId: input.transactionId,
      inboxId: input.context.inbound.inboxId,
      messageId: input.context.inbound.messageId,
      attachment
    });
    storedAttachments.push(storedAttachment);
  }

  return storedAttachments;
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

  if (
    isFromTcInbox({
      from: inbound.from,
      inboxAddress: tcProfile.inbox_address,
      inboxId: tcProfile.agentmail_inbox_id
    })
  ) {
    await markWebhookEventProcessed(input.webhookEventId);

    return { status: "ignored", reason: "self_authored_email" };
  }

  let context = await buildAgentContextPack({ inbound, tcProfile });
  let transactionId = context.match.transactionId;

  if (inbound.attachments.length > 0 && !transactionId && !context.match.ambiguous) {
    const transaction = await createTransaction({
      teamId: tcProfile.team_id,
      tcProfileId: tcProfile.id,
      status: "intake_processing"
    });
    transactionId = transaction.id;
    context = await withTransactionContext({
      context,
      transactionId,
      confidence: 0.7,
      reasons: ["new attachment intake opened a transaction file"]
    });
  }

  await createMessage({
    transactionId,
    agentMailMessageId: inbound.messageId || inbound.eventId,
    threadId: inbound.threadId,
    from: inbound.from,
    to: inbound.to,
    cc: inbound.cc,
    subject: inbound.subject,
    receivedAt: new Date(),
    summary: transactionId
      ? "Inbound email attached to transaction context."
      : "Inbound email received without a confident transaction match."
  });

  let documentAssessment: Awaited<ReturnType<typeof assessContractDocument>> | undefined;

  if (transactionId && inbound.attachments.length > 0) {
    const storedAttachments = await storeInboundAttachments({ context, transactionId });
    const pdfAttachment = storedAttachments.find((attachment) => isPdfAttachment(attachment));

    if (pdfAttachment) {
      await createAuditEvent({
        teamId: context.tcProfile.teamId,
        transactionId,
        actor: "tc_agent",
        eventType: "contract_pdf_received",
        payload: {
          filename: pdfAttachment.filename,
          blobKey: pdfAttachment.blobKey
        }
      });
      documentAssessment = await assessContractDocument({
        attachment: pdfAttachment,
        emailText: context.emailText
      });
      await persistContractAssessment({
        context,
        transactionId,
        attachment: pdfAttachment,
        assessment: documentAssessment
      });
      context = await withTransactionContext({
        context,
        transactionId,
        confidence: Math.max(context.match.confidence, 0.8),
        reasons: [...context.match.reasons, "contract document assessed"]
      });
    } else {
      await createAuditEvent({
        teamId: context.tcProfile.teamId,
        transactionId,
        actor: "tc_agent",
        eventType: "contract_pdf_missing",
        payload: { attachmentCount: inbound.attachments.length }
      });
    }
  }

  let decision = await decideNextAction({ context, documentAssessment });
  if (transactionId && !decision.transactionId) {
    decision = {
      ...decision,
      transactionId,
      matchConfidence: context.match.confidence
    };
  }
  const decisionRecord = await createAgentDecision({
    teamId: context.tcProfile.teamId,
    transactionId: decision.transactionId,
    inboundMessageId: inbound.messageId || inbound.eventId,
    inboundThreadId: inbound.threadId,
    intent: decision.intent,
    action: decision.action,
    confidence: decision.confidence,
    matchConfidence: decision.matchConfidence ?? context.match.confidence,
    requiresApproval: decision.requiresApproval,
    rationale: decision.rationale,
    contextSummary: {
      match: context.match,
      hasTransactionContext: Boolean(context.transactionContext),
      documentAssessment: documentAssessment
        ? {
            kind: documentAssessment.kind,
            usability: documentAssessment.usability,
            missingItems: documentAssessment.missingItems
          }
        : undefined
    },
    toolPlan: decision.toolCalls
  });
  const policy = evaluateActionPolicy(decision, context);
  const execution = await executeAgentDecision({
    context,
    decision,
    decisionId: decisionRecord.id,
    policy
  });

  await markWebhookEventProcessed(input.webhookEventId);

  return {
    status: execution.status,
    transactionId: decision.transactionId,
    intent: decision.intent,
    action: decision.action,
    policy: policy.result
  };
}
