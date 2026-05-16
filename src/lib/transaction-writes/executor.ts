import { appendTransactionMemory, createAgentActivityEvent } from "@/lib/db/repositories";
import {
  createTransactionChangeEvent,
  getTransactionCore,
  getTransactionFact,
  updateTransactionCoreFields,
  updateDocumentRecord,
  upsertBlockerRecord,
  upsertMilestoneRecord,
  upsertParty,
  upsertTaskRecord,
  upsertTransactionFact
} from "@/lib/db/repositories";
import {
  transactionWritesSchema,
  type TransactionWrite,
  type TransactionWriteResult
} from "@/lib/transaction-writes/schemas";

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function coreValue(row: Awaited<ReturnType<typeof getTransactionCore>>, field: string) {
  if (!row) return undefined;

  const fieldMap: Record<string, keyof NonNullable<typeof row>> = {
    propertyAddress: "property_address",
    side: "side",
    status: "status",
    phase: "phase",
    currentRisk: "current_risk",
    effectiveDate: "effective_date",
    closingDate: "closing_date"
  };
  const key = fieldMap[field];

  return key ? row[key] : undefined;
}

function highImpactCoreUpdate(field: string, value: unknown) {
  return field === "status" && (value === "terminated" || value === "closed");
}

async function recordWriteResult(input: {
  userId: string;
  transactionId: string;
  agentDecisionId?: string;
  result: TransactionWriteResult;
  write: TransactionWrite;
}) {
  await createTransactionChangeEvent({
    transactionId: input.transactionId,
    agentDecisionId: input.agentDecisionId,
    changeType:
      input.result.status === "applied"
        ? "updated"
        : input.result.status === "approval_required"
          ? "approval_required"
          : input.result.status,
    targetType: input.result.targetType,
    targetId: input.result.targetId,
    fieldKey: input.result.fieldKey,
    previousValue: input.result.previousValue,
    newValue: input.result.newValue,
    sourceType: input.write.source.sourceType,
    sourceReference: input.write.source.sourceReference,
    confidence: input.write.source.confidence,
    approvalStatus: input.result.status
  });

  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    agentDecisionId: input.agentDecisionId,
    sourceType: "tool",
    eventType: `transaction_write_${input.result.status}`,
    title: `Transaction write ${input.result.status}`,
    summary: input.result.message,
    status:
      input.result.status === "applied"
        ? "completed"
        : input.result.status === "approval_required"
          ? "waiting"
          : input.result.status === "blocked"
            ? "blocked"
            : "ignored",
    metadata: {
      tool: input.result.name,
      targetType: input.result.targetType,
      targetId: input.result.targetId,
      fieldKey: input.result.fieldKey,
      previousValue: input.result.previousValue,
      newValue: input.result.newValue,
      source: input.write.source
    }
  });
}

function result(input: TransactionWriteResult): TransactionWriteResult {
  return input;
}

async function executeCoreWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "updateTransactionCore" }>;
}) {
  const { transactionId, ...fields } = input.write.input;
  const current = await getTransactionCore(transactionId);
  const results: TransactionWriteResult[] = [];

  if (!current) {
    const blocked = result({
      name: input.write.name,
      status: "blocked",
      targetType: "transaction",
      targetId: transactionId,
      fieldKey: "transaction",
      message: "Transaction was not found."
    });
    await recordWriteResult({ ...input, transactionId, result: blocked });
    return [blocked];
  }

  for (const [fieldKey, newValue] of Object.entries(fields)) {
    if (newValue === undefined) continue;

    const previousValue = coreValue(current, fieldKey);

    if (jsonEqual(previousValue, newValue)) {
      const skipped = result({
        name: input.write.name,
        status: "skipped",
        targetType: "transaction",
        targetId: transactionId,
        fieldKey,
        previousValue,
        newValue,
        message: `${fieldKey} already matched the proposed value.`
      });
      await recordWriteResult({ ...input, transactionId, result: skipped });
      results.push(skipped);
      continue;
    }

    if (highImpactCoreUpdate(fieldKey, newValue)) {
      const approvalRequired = result({
        name: input.write.name,
        status: "approval_required",
        targetType: "transaction",
        targetId: transactionId,
        fieldKey,
        previousValue,
        newValue,
        message: `${fieldKey} update requires approval because it is high-impact.`
      });
      await recordWriteResult({ ...input, transactionId, result: approvalRequired });
      results.push(approvalRequired);
      continue;
    }

    await updateTransactionCoreFields({
      transactionId,
      [fieldKey]: newValue
    });
    const applied = result({
      name: input.write.name,
      status: "applied",
      targetType: "transaction",
      targetId: transactionId,
      fieldKey,
      previousValue,
      newValue,
      message: `Updated ${fieldKey}.`
    });
    await recordWriteResult({ ...input, transactionId, result: applied });
    results.push(applied);
  }

  return results;
}

async function executeFactWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "upsertTransactionFact" }>;
}) {
  const { transactionId, key, value, needsConfirmation } = input.write.input;
  const current = await getTransactionFact({ transactionId, key });
  const previousValue = current?.value;
  const existingConfidence = current ? Number(current.confidence) : 0;

  if (current && jsonEqual(previousValue, value)) {
    const skipped = result({
      name: input.write.name,
      status: "skipped",
      targetType: "transaction_fact",
      targetId: key,
      fieldKey: key,
      previousValue,
      newValue: value,
      message: `${key} already matched the proposed value.`
    });
    await recordWriteResult({ ...input, transactionId, result: skipped });
    return [skipped];
  }

  if (
    current &&
    existingConfidence >= 0.8 &&
    input.write.source.confidence < existingConfidence
  ) {
    const approvalRequired = result({
      name: input.write.name,
      status: "approval_required",
      targetType: "transaction_fact",
      targetId: key,
      fieldKey: key,
      previousValue,
      newValue: value,
      message: `${key} conflicts with a higher-confidence existing fact.`
    });
    await recordWriteResult({ ...input, transactionId, result: approvalRequired });
    return [approvalRequired];
  }

  await upsertTransactionFact({
    transactionId,
    key,
    value,
    confidence: input.write.source.confidence,
    sourceType: input.write.source.sourceType,
    sourceReference: input.write.source.sourceReference,
    needsConfirmation
  });
  const applied = result({
    name: input.write.name,
    status: "applied",
    targetType: "transaction_fact",
    targetId: key,
    fieldKey: key,
    previousValue,
    newValue: value,
    message: `Updated fact ${key}.`
  });
  await recordWriteResult({ ...input, transactionId, result: applied });

  return [applied];
}

async function executeUnsupportedWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: TransactionWrite;
}) {
  const transactionId = input.write.input.transactionId;
  const skipped = result({
    name: input.write.name,
    status: "skipped",
    targetType: "transaction",
    targetId: transactionId,
    fieldKey: input.write.name,
    message: `${input.write.name} execution is not implemented yet.`
  });
  await recordWriteResult({ ...input, transactionId, result: skipped });

  return [skipped];
}

async function executePartiesWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "upsertParties" }>;
}) {
  const { transactionId, parties } = input.write.input;
  const results: TransactionWriteResult[] = [];

  for (const party of parties) {
    const saved = await upsertParty({
      transactionId,
      role: party.role,
      name: party.name,
      email: party.email,
      phone: party.phone,
      organization: party.organization,
      confidence: party.confidence ?? input.write.source.confidence,
      source: party.source ?? input.write.source.sourceType
    });
    const applied = result({
      name: input.write.name,
      status: "applied",
      targetType: "party",
      targetId: saved.id,
      fieldKey: party.role,
      newValue: party,
      message: `${saved.inserted ? "Added" : "Updated"} ${party.role} party.`
    });
    await recordWriteResult({ ...input, transactionId, result: applied });
    results.push(applied);
  }

  return results;
}

async function executeDocumentsWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "updateDocuments" }>;
}) {
  const { transactionId, documents } = input.write.input;
  const results: TransactionWriteResult[] = [];

  for (const document of documents) {
    const updated = await updateDocumentRecord({
      transactionId,
      id: document.id,
      name: document.name,
      type: document.type,
      status: document.status,
      ownerRole: document.ownerRole,
      dueDate: document.dueDate,
      metadata: document.metadata
    });

    if (!updated) {
      const blocked = result({
        name: input.write.name,
        status: "blocked",
        targetType: "document",
        targetId: document.id ?? document.name,
        fieldKey: "status",
        newValue: document.status,
        message: "Document was not found on this transaction."
      });
      await recordWriteResult({ ...input, transactionId, result: blocked });
      results.push(blocked);
      continue;
    }

    const applied = result({
      name: input.write.name,
      status: "applied",
      targetType: "document",
      targetId: updated.id,
      fieldKey: "status",
      newValue: document.status,
      message: `${updated.inserted ? "Created" : "Updated"} document ${updated.name} to ${document.status}.`
    });
    await recordWriteResult({ ...input, transactionId, result: applied });
    results.push(applied);
  }

  return results;
}

async function executeMilestonesWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "upsertMilestones" }>;
}) {
  const { transactionId, milestones } = input.write.input;
  const results: TransactionWriteResult[] = [];

  for (const milestone of milestones) {
    const saved = await upsertMilestoneRecord({
      transactionId,
      key: milestone.key,
      title: milestone.title,
      phase: milestone.phase,
      dueDate: milestone.dueDate,
      sourceType: milestone.sourceType,
      sourceReference: milestone.sourceReference,
      riskLevel: milestone.riskLevel,
      completedAt: milestone.completedAt,
      metadata: milestone.metadata
    });
    const applied = result({
      name: input.write.name,
      status: "applied",
      targetType: "milestone",
      targetId: saved.id,
      fieldKey: milestone.key,
      newValue: milestone,
      message: `Upserted milestone ${milestone.title}.`
    });
    await recordWriteResult({ ...input, transactionId, result: applied });
    results.push(applied);
  }

  return results;
}

async function executeTasksWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "updateTasks" }>;
}) {
  const { transactionId, tasks } = input.write.input;
  const results: TransactionWriteResult[] = [];

  for (const task of tasks) {
    const saved = await upsertTaskRecord({
      transactionId,
      id: task.id,
      title: task.title,
      ownerRole: task.ownerRole,
      status: task.status,
      dueDate: task.dueDate,
      followUpDueDate: task.followUpDueDate,
      metadata: task.metadata
    });

    if (!saved) {
      const blocked = result({
        name: input.write.name,
        status: "blocked",
        targetType: "task",
        targetId: task.id,
        fieldKey: task.title ?? "task",
        newValue: task,
        message: "Task update could not identify or create a task."
      });
      await recordWriteResult({ ...input, transactionId, result: blocked });
      results.push(blocked);
      continue;
    }

    const applied = result({
      name: input.write.name,
      status: "applied",
      targetType: "task",
      targetId: saved.id,
      fieldKey: task.title ?? task.id ?? "task",
      newValue: task,
      message: `${saved.inserted ? "Created" : "Updated"} task ${task.title ?? saved.id}.`
    });
    await recordWriteResult({ ...input, transactionId, result: applied });
    results.push(applied);
  }

  return results;
}

async function executeBlockerWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "upsertBlocker" }>;
}) {
  const saved = await upsertBlockerRecord({
    transactionId: input.write.input.transactionId,
    id: input.write.input.id,
    title: input.write.input.title,
    details: input.write.input.details,
    riskLevel: input.write.input.riskLevel,
    responsiblePartyRole: input.write.input.responsiblePartyRole,
    deadlineId: input.write.input.deadlineId,
    taskId: input.write.input.taskId,
    resolved: input.write.input.resolved
  });
  const applied = result({
    name: input.write.name,
    status: "applied",
    targetType: "blocker",
    targetId: saved.id,
    fieldKey: input.write.input.title,
    newValue: input.write.input,
    message: `${saved.inserted ? "Created" : "Updated"} blocker ${input.write.input.title}.`
  });
  await recordWriteResult({
    ...input,
    transactionId: input.write.input.transactionId,
    result: applied
  });

  return [applied];
}

async function executeMemoryWrite(input: {
  userId: string;
  agentDecisionId?: string;
  write: Extract<TransactionWrite, { name: "appendTransactionMemory" }>;
}) {
  await appendTransactionMemory({
    transactionId: input.write.input.transactionId,
    summary: input.write.input.summary,
    openQuestions: input.write.input.openQuestions,
    knownContext: input.write.input.knownContext,
    lastInboundAt: new Date()
  });
  const applied = result({
    name: input.write.name,
    status: "applied",
    targetType: "memory",
    targetId: input.write.input.transactionId,
    fieldKey: "transaction_memory",
    newValue: input.write.input,
    message: "Updated transaction memory."
  });
  await recordWriteResult({
    ...input,
    transactionId: input.write.input.transactionId,
    result: applied
  });

  return [applied];
}

export async function executeTransactionWrites(input: {
  userId: string;
  agentDecisionId?: string;
  writes: unknown;
}) {
  const parsed = transactionWritesSchema.safeParse(input.writes);

  if (!parsed.success) {
    return [
      result({
        name: "updateTransactionCore",
        status: "blocked",
        targetType: "transaction",
        fieldKey: "transactionWrites",
        message: "Transaction writes failed schema validation.",
        newValue: parsed.error.flatten()
      })
    ];
  }

  const results: TransactionWriteResult[] = [];

  for (const write of parsed.data) {
    if (write.name === "updateTransactionCore") {
      results.push(...(await executeCoreWrite({ ...input, write })));
    } else if (write.name === "upsertTransactionFact") {
      results.push(...(await executeFactWrite({ ...input, write })));
    } else if (write.name === "upsertParties") {
      results.push(...(await executePartiesWrite({ ...input, write })));
    } else if (write.name === "updateDocuments") {
      results.push(...(await executeDocumentsWrite({ ...input, write })));
    } else if (write.name === "upsertMilestones") {
      results.push(...(await executeMilestonesWrite({ ...input, write })));
    } else if (write.name === "updateTasks") {
      results.push(...(await executeTasksWrite({ ...input, write })));
    } else if (write.name === "upsertBlocker") {
      results.push(...(await executeBlockerWrite({ ...input, write })));
    } else if (write.name === "appendTransactionMemory") {
      results.push(...(await executeMemoryWrite({ ...input, write })));
    } else {
      results.push(...(await executeUnsupportedWrite({ ...input, write })));
    }
  }

  return results;
}
