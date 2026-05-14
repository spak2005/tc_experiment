import type { AgentContextPack } from "@/lib/agent/types";
import {
  activityStatusForExecutionStatus,
  activityStatusForPolicyResult
} from "@/lib/agent/activity";
import { buildAgentContextPack, getTransactionContext } from "@/lib/agent/context";
import { assessContractDocument } from "@/lib/agent/document-assessment";
import { decideNextAction } from "@/lib/agent/decision";
import { executeAgentDecision } from "@/lib/agent/executor";
import { evaluateActionPolicy } from "@/lib/agent/policy";
import { normalizeAgentMailInbound } from "@/lib/agentmail/inbound";
import { executeApprovalReply } from "@/lib/approvals/executor";
import { buildExpectedDocumentChecklist } from "@/lib/contracts/checklist";
import { getStringFact, type ContractFacts, type ExtractedValue } from "@/lib/contracts/facts";
import {
  createAgentActivityEvent,
  createAgentDecision,
  createAuditEvent,
  createMessage,
  createTransaction,
  findPendingApprovalByReply,
  findTransactionMatchCandidates,
  findTcProfileByInbox,
  insertMilestones,
  insertTasks,
  markWebhookEventProcessed,
  saveExtractedContractFacts,
  updateTransactionFromFacts,
  upsertTransactionMemory
} from "@/lib/db/repositories";
import {
  fetchIncomingAttachment,
  isPdfAttachment,
  markStoredAttachmentProcessed,
  storeIncomingAttachment,
  type FetchedAttachment,
  type StoredAttachment
} from "@/lib/documents/attachments";
import { generateTexasMilestones } from "@/lib/milestones/engine";
import { executeTransactionWrites } from "@/lib/transaction-writes/executor";
import type { TransactionWrite } from "@/lib/transaction-writes/schemas";
import { routeContractIntake, type ContractRoutingDecision } from "@/lib/workflow/contract-routing";
import { scheduleAgentWakeup } from "@/lib/workflow/proactive-scheduling";
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

type ActivityContext = {
  teamId: string;
  transactionId?: string;
};

async function logActivity(
  context: ActivityContext,
  input: Omit<Parameters<typeof createAgentActivityEvent>[0], "teamId">
) {
  await createAgentActivityEvent({
    ...input,
    teamId: context.teamId,
    transactionId: input.transactionId ?? context.transactionId
  });
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

const contractFactKeys = [
  "propertyAddress",
  "buyerNames",
  "sellerNames",
  "salesPrice",
  "cashOrFinanced",
  "titleCompany",
  "earnestMoneyAmount",
  "optionFeeAmount",
  "optionPeriodDays",
  "effectiveDate",
  "closingDate",
  "surveySelection",
  "surveyDeadlineDays",
  "sellerDisclosureDeadlineDays",
  "titleObjectionDays",
  "hoaRequired"
] as const;

const operationalFactKeys = ["financing", "titleEscrow", "hoa", "disclosures"] as const;

function sourceConfidence(values: Array<{ confidence?: number } | undefined>) {
  const confidences = values
    .map((item) => item?.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");

  return confidences.length > 0 ? Math.min(...confidences) : 0.8;
}

function canonicalFactWrites(input: {
  transactionId: string;
  facts: ContractFacts;
  filename: string;
}): TransactionWrite[] {
  const writes: TransactionWrite[] = [];

  for (const key of contractFactKeys) {
    const fact = input.facts[key] as ExtractedValue | undefined;

    if (!fact) continue;

    writes.push({
      name: "upsertTransactionFact",
      input: {
        transactionId: input.transactionId,
        key,
        value: fact.value,
        needsConfirmation: fact.needsConfirmation
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: fact.sourceReference ?? input.filename,
        confidence: fact.confidence,
        rationale: fact.evidence
      }
    });
  }

  writes.push(
    {
      name: "upsertTransactionFact",
      input: {
        transactionId: input.transactionId,
        key: "contractVersion",
        value: input.facts.contractVersion
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: 0.9,
        rationale: "Contract version identified during document assessment."
      }
    },
    {
      name: "upsertTransactionFact",
      input: {
        transactionId: input.transactionId,
        key: "signatureStatus",
        value: input.facts.signatureStatus,
        needsConfirmation: input.facts.signatureStatus !== "appears_executed"
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: 0.85,
        rationale: "Signature status identified during document assessment."
      }
    }
  );

  if (input.facts.addenda.length > 0) {
    writes.push({
      name: "upsertTransactionFact",
      input: {
        transactionId: input.transactionId,
        key: "addenda",
        value: input.facts.addenda.map((item) => item.value),
        needsConfirmation: input.facts.addenda.some((item) => item.needsConfirmation)
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: Math.min(...input.facts.addenda.map((item) => item.confidence)),
        rationale: "Addenda identified during document assessment."
      }
    });
  }

  for (const key of operationalFactKeys) {
    const value = input.facts[key];

    if (!value) continue;

    writes.push({
      name: "upsertTransactionFact",
      input: {
        transactionId: input.transactionId,
        key,
        value
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: sourceConfidence(Object.values(value)),
        rationale: `${key} coordination details identified during contract assessment.`
      }
    });
  }

  const contacts = input.facts.contacts.filter(
    (contact) => contact.name || contact.email || contact.organization
  );
  if (contacts.length > 0) {
    writes.push({
      name: "upsertParties",
      input: {
        transactionId: input.transactionId,
        parties: contacts.map((contact) => ({
          role: contact.role,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          organization: contact.organization,
          confidence: contact.confidence,
          source: contact.sourceReference ?? "contract_extraction"
        }))
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: sourceConfidence(contacts),
        rationale: "Contacts were extracted from the contract and addenda."
      }
    });
  }

  const checklistByKey = new Map(
    [...buildExpectedDocumentChecklist(input.facts), ...input.facts.expectedDocuments].map(
      (document) => [document.key, document]
    )
  );
  const checklist = [...checklistByKey.values()];
  if (checklist.length > 0) {
    writes.push({
      name: "updateDocuments",
      input: {
        transactionId: input.transactionId,
        documents: checklist.map((document) => ({
          type: document.type,
          name: document.name,
          status: document.status,
          ownerRole: document.ownerRole,
          dueDate: document.dueDate,
          metadata: {
            key: document.key,
            sourceReference: document.sourceReference,
            evidence: document.evidence,
            confidence: document.confidence,
            needsConfirmation: document.needsConfirmation
          }
        }))
      },
      source: {
        sourceType: "contract_extraction",
        sourceReference: input.filename,
        confidence: sourceConfidence(checklist),
        rationale: "Expected document checklist was derived from the contract and addenda."
      }
    });
  }

  return writes;
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
    documentStatusForUsability(input.assessment.usability),
    {
      teamId: input.context.tcProfile.teamId,
      transactionId: input.transactionId
    }
  );
  await updateTransactionFromFacts({
    transactionId: input.transactionId,
    propertyAddress,
    effectiveDate,
    closingDate,
    status: transactionStatus,
    phase: "opening_file"
  });
  await logActivity(
    { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
    {
      sourceType: "system",
      eventType: "transaction_updated_from_facts",
      title: "Updated transaction from contract facts",
      summary: `Updated the transaction status to ${transactionStatus}.`,
      status: "completed",
      metadata: {
        propertyAddress,
        effectiveDate,
        closingDate,
        transactionStatus,
        phase: "opening_file"
      }
    }
  );
  await saveExtractedContractFacts({
    transactionId: input.transactionId,
    contractVersion: input.assessment.facts.contractVersion,
    facts: input.assessment.facts,
    validationStatus: input.assessment.validationStatus
  });
  await executeTransactionWrites({
    teamId: input.context.tcProfile.teamId,
    writes: canonicalFactWrites({
      transactionId: input.transactionId,
      facts: input.assessment.facts,
      filename: input.assessment.filename
    })
  });
  await logActivity(
    { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
    {
      sourceType: "extraction",
      eventType: "contract_facts_saved",
      title: "Saved extracted facts",
      summary: `Saved ${input.assessment.facts.contractVersion} facts with ${input.assessment.validationStatus} validation.`,
      status: "completed",
      metadata: {
        contractVersion: input.assessment.facts.contractVersion,
        validationStatus: input.assessment.validationStatus,
        missingItems: input.assessment.missingItems
      }
    }
  );

  await logActivity(
    { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
    {
      sourceType: "extraction",
      eventType: "contract_validation_completed",
      title: "Validated contract facts",
      summary:
        input.assessment.missingItems.length > 0
          ? `Validation needs ${input.assessment.missingItems.length} clarification item(s).`
          : "Validation found enough information for review.",
      status:
        input.assessment.validationStatus === "ready_for_review" ? "completed" : "waiting",
      metadata: {
        validationStatus: input.assessment.validationStatus,
        missingItems: input.assessment.missingItems,
        intakeGaps: input.assessment.intakeGaps
      }
    }
  );

  await logActivity(
    { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
    {
      sourceType: "extraction",
      eventType: "document_classified",
      title: "Classified contract document",
      summary: `${input.assessment.filename} was classified as ${input.assessment.kind} and ${input.assessment.usability}.`,
      status:
        input.assessment.usability === "usable"
          ? "completed"
          : input.assessment.usability === "unusable"
            ? "blocked"
            : "waiting",
      metadata: {
        filename: input.assessment.filename,
        kind: input.assessment.kind,
        usability: input.assessment.usability,
        findings: input.assessment.findings,
        signatureStatus: input.assessment.signatureStatus,
        extractionMode: input.assessment.extractionMode
      }
    }
  );

  if (input.assessment.usability !== "unusable") {
    const milestones = generateTexasMilestones(input.assessment.facts);
    const tasks = [
      ...createOpeningTasks(),
      ...milestones.flatMap((milestone) => createTasksForMilestone(milestone))
    ];

    await insertMilestones(input.transactionId, milestones);
    await logActivity(
      { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
      {
        sourceType: "system",
        eventType: "milestones_generated",
        title: "Generated milestones",
        summary: `Generated ${milestones.length} transaction milestone(s).`,
        status: "completed",
        metadata: {
          count: milestones.length,
          effectiveDate,
          closingDate,
          milestones: milestones.map((milestone) => ({
            key: milestone.key,
            title: milestone.title,
            dueDate: milestone.dueDate,
            phase: milestone.phase,
            riskLevel: milestone.riskLevel,
            sourceReference: milestone.sourceReference
          }))
        }
      }
    );
    await insertTasks(input.transactionId, tasks);
    await logActivity(
      { teamId: input.context.tcProfile.teamId, transactionId: input.transactionId },
      {
        sourceType: "system",
        eventType: "tasks_generated",
        title: "Generated tasks",
        summary: `Generated ${tasks.length} opening and milestone task(s).`,
        status: "completed",
        metadata: {
          count: tasks.length,
          tasks: tasks.map((task) => ({
            title: task.title,
            ownerRole: task.ownerRole,
            dueDate: task.dueDate,
            status: task.status
          }))
        }
      }
    );
    await scheduleAgentWakeup({
      teamId: input.context.tcProfile.teamId,
      transactionId: input.transactionId,
      actionType: "transaction_dispatch",
      wakeAt: new Date().toISOString(),
      reason: "Start newly generated opening and milestone tasks.",
      payload: {
        source: "contract_intake",
        milestoneCount: milestones.length,
        taskCount: tasks.length
      }
    });
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
  fetchedAttachments?: Record<string, FetchedAttachment>;
}) {
  const storedAttachments: StoredAttachment[] = [];

  for (const attachment of input.context.inbound.attachments) {
    const storedAttachment = await storeIncomingAttachment({
      teamId: input.context.tcProfile.teamId,
      transactionId: input.transactionId,
      inboxId: input.context.inbound.inboxId,
      messageId: input.context.inbound.messageId,
      attachment,
      fetched: input.fetchedAttachments?.[attachment.id]
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
    await createAgentActivityEvent({
      teamId: tcProfile.team_id,
      sourceType: "email",
      eventType: "self_authored_email_ignored",
      title: "Ignored self-authored email",
      summary: `Ignored "${inbound.subject}" because it was sent by the TC inbox.`,
      status: "ignored",
      metadata: {
        webhookEventId: input.webhookEventId,
        inboxId: inbound.inboxId,
        messageId: inbound.messageId,
        threadId: inbound.threadId,
        from: inbound.from,
        subject: inbound.subject
      }
    });
    await markWebhookEventProcessed(input.webhookEventId);

    return { status: "ignored", reason: "self_authored_email" };
  }

  const pendingApproval = await findPendingApprovalByReply({
    teamId: tcProfile.team_id,
    realtorEmail: inbound.from,
    threadId: inbound.threadId,
    messageId: inbound.messageId
  });

  if (pendingApproval) {
    await createAgentActivityEvent({
      teamId: tcProfile.team_id,
      transactionId: pendingApproval.transaction_id,
      agentDecisionId: pendingApproval.agent_decision_id ?? undefined,
      sourceType: "approval",
      eventType: "approval_reply_received",
      title: "Received approval reply",
      summary: `Received realtor reply for "${pendingApproval.proposed_subject}".`,
      status: "received",
      metadata: {
        webhookEventId: input.webhookEventId,
        approvalId: pendingApproval.id,
        inboxId: inbound.inboxId,
        messageId: inbound.messageId,
        threadId: inbound.threadId,
        from: inbound.from,
        subject: inbound.subject
      }
    });
    await createMessage({
      transactionId: pendingApproval.transaction_id,
      agentMailMessageId: inbound.messageId || inbound.eventId,
      threadId: inbound.threadId,
      from: inbound.from,
      to: inbound.to,
      cc: inbound.cc,
      subject: inbound.subject,
      receivedAt: new Date(),
      summary: "Inbound realtor reply to a pending approval request."
    });
    const approvalExecution = await executeApprovalReply({
      approval: pendingApproval,
      inbound
    });
    await createAgentActivityEvent({
      teamId: tcProfile.team_id,
      transactionId: pendingApproval.transaction_id,
      agentDecisionId: pendingApproval.agent_decision_id ?? undefined,
      sourceType: "approval",
      eventType: "approval_reply_completed",
      title: "Processed approval reply",
      summary: `Approval reply finished with status ${approvalExecution.status}.`,
      status:
        approvalExecution.status === "sent"
          ? "sent"
          : approvalExecution.status === "rejected"
            ? "blocked"
            : approvalExecution.status === "ignored"
              ? "ignored"
              : "waiting",
      metadata: {
        approvalId: pendingApproval.id,
        action: approvalExecution.action,
        status: approvalExecution.status
      }
    });
    await markWebhookEventProcessed(input.webhookEventId);

    return {
      status: approvalExecution.status,
      transactionId: pendingApproval.transaction_id,
      approvalId: pendingApproval.id,
      action: approvalExecution.action
    };
  }

  let context = await buildAgentContextPack({ inbound, tcProfile });
  let transactionId = context.match.transactionId;
  const activityContext: ActivityContext = {
    teamId: tcProfile.team_id,
    transactionId
  };

  await logActivity(activityContext, {
    sourceType: "email",
    eventType: "inbound_email_received",
    title: "Received inbound email",
    summary: `Received "${inbound.subject}" from ${inbound.from || "unknown sender"}.`,
    status: "received",
    metadata: {
      webhookEventId: input.webhookEventId,
      inboxId: inbound.inboxId,
      messageId: inbound.messageId,
      threadId: inbound.threadId,
      from: inbound.from,
      to: inbound.to,
      cc: inbound.cc,
      subject: inbound.subject,
      attachmentCount: inbound.attachments.length,
      attachmentNames: inbound.attachments.map((attachment) => attachment.filename)
    }
  });

  await logActivity(activityContext, {
    sourceType: "system",
    eventType: "tc_profile_resolved",
    title: "Resolved TC inbox",
    summary: `Matched inbound inbox to ${tcProfile.display_name}.`,
    status: "completed",
    metadata: {
      tcProfileId: tcProfile.id,
      inboxAddress: tcProfile.inbox_address,
      inboxId: tcProfile.agentmail_inbox_id,
      escalationEmail: tcProfile.escalation_email
    }
  });

  await logActivity(activityContext, {
    sourceType: "matching",
    eventType: context.match.ambiguous
      ? "transaction_match_ambiguous"
      : "transaction_match_completed",
    title: context.match.transactionId ? "Matched transaction" : "Checked transaction match",
    summary: context.match.transactionId
      ? `Matched this email to the transaction with confidence ${context.match.confidence}.`
      : context.match.ambiguous
        ? "Found multiple plausible transactions; the agent needs clarification."
        : "No confident existing transaction match was found.",
    status: context.match.ambiguous ? "waiting" : "completed",
    metadata: {
      match: context.match
    }
  });

  let documentAssessment: Awaited<ReturnType<typeof assessContractDocument>> | undefined;
  let contractRouting: ContractRoutingDecision | undefined;
  let shouldPersistContractAssessment = false;
  const fetchedAttachments: Record<string, FetchedAttachment> = {};

  if (inbound.attachments.length > 0) {
    for (const attachment of inbound.attachments) {
      await logActivity(activityContext, {
        sourceType: "document",
        eventType: "inbound_attachment_found",
        title: "Found inbound attachment",
        summary: `Found ${attachment.filename} on the inbound email.`,
        status: "received",
        metadata: {
          attachmentId: attachment.id,
          filename: attachment.filename,
          contentType: attachment.contentType,
          isPdf: isPdfAttachment(attachment)
        }
      });
    }
    const pdfAttachment = inbound.attachments.find((attachment) => isPdfAttachment(attachment));

    if (pdfAttachment) {
      const fetchedPdf = await fetchIncomingAttachment({
        teamId: context.tcProfile.teamId,
        transactionId,
        inboxId: context.inbound.inboxId,
        messageId: context.inbound.messageId,
        attachment: pdfAttachment
      });
      fetchedAttachments[pdfAttachment.id] = fetchedPdf;
      await logActivity(activityContext, {
        sourceType: "document",
        eventType: "contract_pdf_selected",
        title: "Selected contract PDF",
        summary: `Selected ${pdfAttachment.filename} for contract assessment.`,
        status: "completed",
        metadata: {
          filename: pdfAttachment.filename,
          contentType: pdfAttachment.contentType
        }
      });
      await logActivity(activityContext, {
        sourceType: "extraction",
        eventType: "contract_extraction_started",
        title: "Started contract extraction",
        summary: `Started extracting contract facts from ${pdfAttachment.filename}.`,
        status: "started",
        metadata: {
          filename: pdfAttachment.filename
        }
      });
      documentAssessment = await assessContractDocument({
        attachment: fetchedPdf,
        emailText: context.emailText,
        temporalContext: context.temporalContext
      });
      await logActivity(activityContext, {
        sourceType: "extraction",
        eventType: "contract_extraction_completed",
        title:
          documentAssessment.extractionMode === "anthropic_pdf"
            ? "Extracted contract facts from PDF"
            : "Used fallback contract extraction",
        summary:
          documentAssessment.extractionMode === "anthropic_pdf"
            ? `Extracted facts from ${pdfAttachment.filename} with Anthropic PDF mode.`
            : `Could not use PDF extraction for ${pdfAttachment.filename}; used fallback assessment.`,
        status:
          documentAssessment.extractionMode === "anthropic_pdf" ? "completed" : "failed",
        metadata: {
          filename: pdfAttachment.filename,
          extractionMode: documentAssessment.extractionMode,
          contractVersion: documentAssessment.facts.contractVersion,
          missingItems: documentAssessment.missingItems,
          findings: documentAssessment.findings
        }
      });

      const candidates = await findTransactionMatchCandidates(context.tcProfile.teamId);
      contractRouting = routeContractIntake({
        facts: documentAssessment.facts,
        candidates,
        documentUsability: documentAssessment.usability
      });
      context = {
        ...context,
        contractRouting
      };
      await logActivity(activityContext, {
        sourceType: "matching",
        eventType: `contract_routing_${contractRouting.action}`,
        title: "Routed contract intake",
        summary: contractRouting.reasons.join(" "),
        status:
          contractRouting.action === "create_transaction" ||
          contractRouting.action === "update_transaction"
            ? "completed"
            : "waiting",
        metadata: {
          action: contractRouting.action,
          confidence: contractRouting.confidence,
          stableIdentity: contractRouting.stableIdentity,
          candidates: contractRouting.candidates,
          reasons: contractRouting.reasons
        }
      });

      if (contractRouting.action === "update_transaction") {
        transactionId = contractRouting.transactionId;
        activityContext.transactionId = transactionId;
        shouldPersistContractAssessment = true;
      } else if (contractRouting.action === "create_transaction") {
        const transaction = await createTransaction({
          teamId: tcProfile.team_id,
          tcProfileId: tcProfile.id,
          propertyAddress: getStringFact(documentAssessment.facts.propertyAddress),
          effectiveDate: isoDateOrUndefined(getStringFact(documentAssessment.facts.effectiveDate)),
          closingDate: isoDateOrUndefined(getStringFact(documentAssessment.facts.closingDate)),
          status: "intake_processing"
        });
        transactionId = transaction.id;
        activityContext.transactionId = transactionId;
        shouldPersistContractAssessment = true;
        await logActivity(activityContext, {
          sourceType: "system",
          eventType: "transaction_created",
          title: "Opened transaction file",
          summary: "Created a new transaction file for a unique contract.",
          status: "completed",
          metadata: {
            transactionId,
            routing: contractRouting
          }
        });
      } else if (contractRouting.action === "no_transaction_action" && context.match.transactionId) {
        transactionId = context.match.transactionId;
        activityContext.transactionId = transactionId;
      } else {
        transactionId = undefined;
        activityContext.transactionId = undefined;
        context = {
          ...context,
          match: {
            transactionId: undefined,
            confidence: contractRouting.confidence,
            reasons: contractRouting.reasons,
            ambiguous: contractRouting.action === "ask_which_transaction",
            candidates: contractRouting.candidates
          }
        };
      }

      if (transactionId) {
        const storedAttachments = await storeInboundAttachments({
          context,
          transactionId,
          fetchedAttachments
        });
        const storedPdfAttachment = storedAttachments.find(
          (attachment) => attachment.filename === pdfAttachment.filename && isPdfAttachment(attachment)
        );

        if (storedPdfAttachment && shouldPersistContractAssessment) {
          await createAuditEvent({
            teamId: context.tcProfile.teamId,
            transactionId,
            actor: "tc_agent",
            eventType: "contract_pdf_received",
            payload: {
              filename: storedPdfAttachment.filename,
              blobKey: storedPdfAttachment.blobKey
            }
          });
          await persistContractAssessment({
            context,
            transactionId,
            attachment: storedPdfAttachment,
            assessment: documentAssessment
          });
        } else if (storedPdfAttachment) {
          await logActivity(activityContext, {
            sourceType: "document",
            eventType: "matched_pdf_stored_without_contract_intake",
            title: "Stored matched PDF",
            summary: `${storedPdfAttachment.filename} was stored on the matched transaction without changing contract facts.`,
            status: "completed",
            metadata: {
              filename: storedPdfAttachment.filename,
              documentId: storedPdfAttachment.documentId,
              documentKind: documentAssessment.kind,
              usability: documentAssessment.usability
            }
          });
        }
      }

      if (transactionId) {
        context = await withTransactionContext({
          context,
          transactionId,
          confidence: Math.max(context.match.confidence, contractRouting.confidence),
          reasons: [...context.match.reasons, ...contractRouting.reasons]
        });
      }
    } else {
      await logActivity(activityContext, {
        sourceType: "document",
        eventType: "contract_pdf_missing",
        title: "No contract PDF found",
        summary: "The inbound email had attachments, but none looked like a PDF contract.",
        status: "blocked",
        metadata: {
          attachmentCount: inbound.attachments.length,
          attachmentNames: inbound.attachments.map((attachment) => attachment.filename)
        }
      });
      await createAuditEvent({
        teamId: context.tcProfile.teamId,
        transactionId,
        actor: "tc_agent",
        eventType: "contract_pdf_missing",
        payload: { attachmentCount: inbound.attachments.length }
      });

      if (transactionId) {
        const storedAttachments = await storeInboundAttachments({
          context,
          transactionId,
          fetchedAttachments
        });
        await logActivity(activityContext, {
          sourceType: "document",
          eventType: "non_contract_attachments_stored",
          title: "Stored non-contract attachments",
          summary: `Stored ${storedAttachments.length} attachment(s) on the matched transaction.`,
          status: "completed",
          metadata: {
            count: storedAttachments.length,
            attachmentNames: storedAttachments.map((attachment) => attachment.filename)
          }
        });
      }
    }
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
      : "Inbound email received without a transaction action."
  });
  await logActivity(activityContext, {
    sourceType: "email",
    eventType: "message_persisted",
    title: "Saved inbound message",
    summary: transactionId
      ? "Saved the inbound email on this transaction."
      : "Saved the inbound email without a transaction action.",
    status: "completed",
    metadata: {
      agentMailMessageId: inbound.messageId || inbound.eventId,
      threadId: inbound.threadId,
      transactionId
    }
  });

  await logActivity(activityContext, {
    sourceType: "decision",
    eventType: "decision_requested",
    title: "Requested agent decision",
    summary: "Asked the agent to choose the next operational action.",
    status: "started",
    metadata: {
      hasTransactionContext: Boolean(context.transactionContext),
      hasDocumentAssessment: Boolean(documentAssessment),
      match: context.match
    }
  });
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
      inboundEvent: decision.inboundEvent,
      hasTransactionContext: Boolean(context.transactionContext),
      documentAssessment: documentAssessment
        ? {
            kind: documentAssessment.kind,
            usability: documentAssessment.usability,
            missingItems: documentAssessment.missingItems
          }
        : undefined
    },
    toolPlan: {
      toolCalls: decision.toolCalls,
      inboundEvent: decision.inboundEvent,
      transactionWrites: decision.transactionWrites
    }
  });
  await logActivity(activityContext, {
    agentDecisionId: decisionRecord.id,
    sourceType: "decision",
    eventType: "decision_created",
    title: `Selected ${decision.intent} -> ${decision.action}`,
    summary: decision.rationale || `Selected ${decision.action} for ${decision.intent}.`,
    status: "completed",
    metadata: {
      decisionId: decisionRecord.id,
      intent: decision.intent,
      action: decision.action,
      inboundEvent: decision.inboundEvent,
      confidence: decision.confidence,
      matchConfidence: decision.matchConfidence ?? context.match.confidence,
      requiresApproval: decision.requiresApproval,
      rationale: decision.rationale,
      response: decision.response
        ? {
            subject: decision.response.subject,
            to: decision.response.to,
            cc: decision.response.cc,
            labels: decision.response.labels
          }
        : undefined,
      toolPlan: decision.toolCalls,
      transactionWrites: decision.transactionWrites
    }
  });
  const policy = evaluateActionPolicy(decision, context);
  await logActivity(activityContext, {
    agentDecisionId: decisionRecord.id,
    sourceType: "policy",
    eventType: "policy_evaluated",
    title: `Policy ${policy.result}`,
    summary: policy.reasons.join(" "),
    status: activityStatusForPolicyResult(policy.result),
    metadata: {
      decisionId: decisionRecord.id,
      result: policy.result,
      reasons: policy.reasons
    }
  });
  await logActivity(activityContext, {
    agentDecisionId: decisionRecord.id,
    sourceType: "tool",
    eventType: "decision_execution_started",
    title: "Started decision execution",
    summary: `Started executing ${decision.action}.`,
    status: "started",
    metadata: {
      decisionId: decisionRecord.id,
      intent: decision.intent,
      action: decision.action,
      policy: policy.result
    }
  });
  const execution = await executeAgentDecision({
    context,
    decision,
    decisionId: decisionRecord.id,
    policy,
    documentAssessment
  });
  await logActivity(activityContext, {
    agentDecisionId: decisionRecord.id,
    sourceType: "tool",
    eventType: "decision_execution_completed",
    title: "Finished decision execution",
    summary: `Decision execution finished with status ${execution.status}.`,
    status: activityStatusForExecutionStatus(execution.status),
    metadata: {
      decisionId: decisionRecord.id,
      executionStatus: execution.status,
      toolResults: execution.toolResults
    }
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
