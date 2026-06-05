import { beforeEach, describe, expect, it, vi } from "vitest";
import { processAgentMailInbound } from "@/lib/workflow/intake";

const mocks = vi.hoisted(() => ({
  normalizeAgentMailInbound: vi.fn(),
  buildAgentContextPack: vi.fn(),
  getTransactionContext: vi.fn(),
  assessContractDocument: vi.fn(),
  decideNextAction: vi.fn(),
  executeAgentDecision: vi.fn(),
  evaluateActionPolicy: vi.fn(),
  buildExpectedDocumentChecklist: vi.fn(),
  createAgentActivityEvent: vi.fn(),
  createAgentActivityRun: vi.fn(),
  createAgentDecisionOnce: vi.fn(),
  createAuditEvent: vi.fn(),
  createIntakeArtifact: vi.fn(),
  createMessage: vi.fn(),
  createOrReuseTransactionCalendarFeed: vi.fn(),
  findOrCreateTransactionForIntake: vi.fn(),
  findPendingApprovalByReply: vi.fn(),
  findTransactionMatchCandidates: vi.fn(),
  findTcProfileByInbox: vi.fn(),
  insertMilestones: vi.fn(),
  insertTasks: vi.fn(),
  markWebhookEventProcessed: vi.fn(),
  saveExtractedContractFacts: vi.fn(),
  updateIntakeArtifact: vi.fn(),
  updateAgentActivityRun: vi.fn(),
  updateTransactionFromFacts: vi.fn(),
  upsertTransactionMemory: vi.fn(),
  fetchIncomingAttachment: vi.fn(),
  isPdfAttachment: vi.fn(),
  markStoredAttachmentProcessed: vi.fn(),
  storeIncomingAttachment: vi.fn(),
  storeIntakeArtifactAttachment: vi.fn(),
  generateTexasMilestones: vi.fn(),
  executeTransactionWrites: vi.fn(),
  routeContractIntake: vi.fn(),
  reconcileTransactionEvidence: vi.fn(),
  refreshTransactionMemory: vi.fn(),
  scheduleAgentWakeup: vi.fn(),
  createOpeningTasks: vi.fn(),
  createTasksForMilestone: vi.fn()
}));

vi.mock("@/lib/agent/context", () => ({
  buildAgentContextPack: mocks.buildAgentContextPack,
  getTransactionContext: mocks.getTransactionContext
}));

vi.mock("@/lib/agent/document-assessment", () => ({
  assessContractDocument: mocks.assessContractDocument
}));

vi.mock("@/lib/agent/decision", () => ({
  decideNextAction: mocks.decideNextAction
}));

vi.mock("@/lib/agent/executor", () => ({
  executeAgentDecision: mocks.executeAgentDecision
}));

vi.mock("@/lib/agent/policy", () => ({
  evaluateActionPolicy: mocks.evaluateActionPolicy
}));

vi.mock("@/lib/agentmail/inbound", () => ({
  normalizeAgentMailInbound: mocks.normalizeAgentMailInbound
}));

vi.mock("@/lib/approvals/executor", () => ({
  executeApprovalReply: vi.fn()
}));

vi.mock("@/lib/config/urls", () => ({
  buildPublicUrl: (path: string) => `https://tc.example.com${path}`
}));

vi.mock("@/lib/contracts/checklist", () => ({
  buildExpectedDocumentChecklist: mocks.buildExpectedDocumentChecklist
}));

vi.mock("@/lib/db/repositories", () => ({
  createAgentActivityEvent: mocks.createAgentActivityEvent,
  createAgentActivityRun: mocks.createAgentActivityRun,
  createAgentDecisionOnce: mocks.createAgentDecisionOnce,
  createAuditEvent: mocks.createAuditEvent,
  createIntakeArtifact: mocks.createIntakeArtifact,
  createMessage: mocks.createMessage,
  createOrReuseTransactionCalendarFeed: mocks.createOrReuseTransactionCalendarFeed,
  findOrCreateTransactionForIntake: mocks.findOrCreateTransactionForIntake,
  findPendingApprovalByReply: mocks.findPendingApprovalByReply,
  findTransactionMatchCandidates: mocks.findTransactionMatchCandidates,
  findTcProfileByInbox: mocks.findTcProfileByInbox,
  insertMilestones: mocks.insertMilestones,
  insertTasks: mocks.insertTasks,
  markWebhookEventProcessed: mocks.markWebhookEventProcessed,
  saveExtractedContractFacts: mocks.saveExtractedContractFacts,
  updateIntakeArtifact: mocks.updateIntakeArtifact,
  updateAgentActivityRun: mocks.updateAgentActivityRun,
  updateTransactionFromFacts: mocks.updateTransactionFromFacts,
  upsertTransactionMemory: mocks.upsertTransactionMemory
}));

vi.mock("@/lib/documents/attachments", () => ({
  fetchIncomingAttachment: mocks.fetchIncomingAttachment,
  isPdfAttachment: mocks.isPdfAttachment,
  markStoredAttachmentProcessed: mocks.markStoredAttachmentProcessed,
  storeIncomingAttachment: mocks.storeIncomingAttachment
}));

vi.mock("@/lib/documents/intake-artifacts", () => ({
  storeIntakeArtifactAttachment: mocks.storeIntakeArtifactAttachment
}));

vi.mock("@/lib/milestones/engine", () => ({
  generateTexasMilestones: mocks.generateTexasMilestones
}));

vi.mock("@/lib/transaction-writes/executor", () => ({
  executeTransactionWrites: mocks.executeTransactionWrites
}));

vi.mock("@/lib/workflow/contract-routing", () => ({
  routeContractIntake: mocks.routeContractIntake
}));

vi.mock("@/lib/workflow/evidence-reconciliation", () => ({
  reconcileTransactionEvidence: mocks.reconcileTransactionEvidence
}));

vi.mock("@/lib/workflow/memory-refresh", () => ({
  refreshTransactionMemory: mocks.refreshTransactionMemory
}));

vi.mock("@/lib/workflow/proactive-scheduling", () => ({
  scheduleAgentWakeup: mocks.scheduleAgentWakeup
}));

vi.mock("@/lib/workflow/tasks", () => ({
  createOpeningTasks: mocks.createOpeningTasks,
  createTasksForMilestone: mocks.createTasksForMilestone
}));

const tcProfile = {
  id: "tc-profile-1",
  user_id: "user-1",
  display_name: "Stephanie",
  inbox_address: "stephanie@example.com",
  agentmail_inbox_id: "inbox-1",
  escalation_email: "agent@example.com"
};

const baseFacts = {
  contractVersion: "TREC 1-4",
  signatureStatus: "appears_executed",
  propertyAddress: { value: "123 Main St", confidence: 0.99 },
  effectiveDate: { value: "2026-06-01", confidence: 0.99 },
  closingDate: { value: "2026-06-30", confidence: 0.99 },
  addenda: [],
  contacts: [],
  expectedDocuments: []
};

function transactionContext(milestones: Array<Record<string, unknown>>) {
  return {
    transaction: {
      id: "tx-1",
      property_address: "123 Main St",
      status: "active"
    },
    canonicalFacts: [],
    recentChanges: [],
    milestones,
    tasks: [],
    documents: [],
    messages: [],
    blockers: [],
    dealMemory: {
      summary: "",
      openQuestions: [],
      warnings: []
    },
    recentDecisions: [],
    missingItems: []
  };
}

function contextPack() {
  return {
    inbound: mocks.normalizeAgentMailInbound(),
    emailText: "See attached.",
    temporalContext: {
      today: "2026-06-03",
      now: "2026-06-03T15:00:00.000Z",
      timezone: "America/Chicago",
      description: "Today is June 3, 2026."
    },
    tcProfile: {
      id: tcProfile.id,
      userId: tcProfile.user_id,
      displayName: tcProfile.display_name,
      inboxAddress: tcProfile.inbox_address,
      inboxId: tcProfile.agentmail_inbox_id,
      escalationEmail: tcProfile.escalation_email
    },
    match: {
      confidence: 0,
      reasons: [],
      ambiguous: false,
      candidates: []
    }
  };
}

function setupContractIntake(input: {
  generatedMilestones: Array<{
    key: string;
    title: string;
    phase: string;
    dueDate?: string;
    sourceType: string;
    sourceReference?: string;
    riskLevel: string;
    metadata?: Record<string, unknown>;
  }>;
}) {
  mocks.normalizeAgentMailInbound.mockReturnValue({
    eventId: "event-1",
    inboxId: "inbox-1",
    messageId: "message-1",
    threadId: "thread-1",
    from: "agent@example.com",
    to: ["stephanie@example.com"],
    cc: [],
    subject: "Executed contract",
    text: "See attached.",
    attachments: [
      {
        id: "attachment-1",
        filename: "contract.pdf",
        contentType: "application/pdf"
      }
    ]
  });
  mocks.findTcProfileByInbox.mockResolvedValue(tcProfile);
  mocks.findPendingApprovalByReply.mockResolvedValue(null);
  mocks.buildAgentContextPack.mockResolvedValue(contextPack());
  mocks.createIntakeArtifact.mockResolvedValue({
    id: "artifact-1",
    artifact_key: "inbox-1:message:message-1",
    status: "received",
    inserted: true
  });
  mocks.buildExpectedDocumentChecklist.mockReturnValue([]);
  mocks.isPdfAttachment.mockReturnValue(true);
  mocks.storeIntakeArtifactAttachment.mockResolvedValue({
    intakeArtifactAttachmentId: "artifact-attachment-1",
    sourceAttachmentKey: "inbox-1:message-1:attachment-1",
    filename: "contract.pdf",
    contentType: "application/pdf",
    blobKey: "users/user-1/intake/contract.pdf",
    body: Buffer.from("pdf")
  });
  mocks.assessContractDocument.mockResolvedValue({
    filename: "contract.pdf",
    kind: "trec_contract",
    usability: "usable",
    validationStatus: "ready_for_review",
    missingItems: [],
    intakeGaps: [],
    findings: [],
    signatureStatus: "signed",
    extractionMode: "anthropic_pdf",
    facts: baseFacts
  });
  mocks.findTransactionMatchCandidates.mockResolvedValue([]);
  mocks.routeContractIntake.mockReturnValue({
    action: "create_transaction",
    confidence: 0.99,
    stableIdentity: "123-main-st",
    candidates: [],
    reasons: ["Unique contract."]
  });
  mocks.findOrCreateTransactionForIntake.mockResolvedValue({ id: "tx-1" });
  mocks.storeIncomingAttachment.mockResolvedValue({
    documentId: "document-1",
    filename: "contract.pdf",
    contentType: "application/pdf",
    blobKey: "blob-1",
    body: Buffer.from("pdf")
  });
  mocks.generateTexasMilestones.mockReturnValue(input.generatedMilestones);
  mocks.createOpeningTasks.mockReturnValue([]);
  mocks.createTasksForMilestone.mockReturnValue([]);
  mocks.createOrReuseTransactionCalendarFeed.mockResolvedValue({
    id: "feed-1",
    transactionId: "tx-1",
    token: "token-1",
    createdAt: "2026-06-03T15:00:00.000Z"
  });
  mocks.getTransactionContext.mockResolvedValue(
    transactionContext(
      input.generatedMilestones.map((milestone) => ({
        key: milestone.key,
        title: milestone.title,
        phase: milestone.phase,
        due_date: milestone.dueDate,
        source_reference: milestone.sourceReference,
        risk_level: milestone.riskLevel
      }))
    )
  );
  mocks.reconcileTransactionEvidence.mockResolvedValue({ appliedWrites: [] });
  mocks.decideNextAction.mockResolvedValue({
    intent: "new_contract",
    action: "draft_external_email",
    confidence: 0.9,
    requiresApproval: true,
    rationale: "Draft an external opening email.",
    inboundEvent: "document_received",
    response: {
      subject: "External draft",
      body: "Please open title.",
      to: ["title@example.com"]
    },
    toolCalls: [],
    transactionWrites: []
  });
  mocks.createAgentDecisionOnce.mockResolvedValue({ id: "decision-1" });
  mocks.evaluateActionPolicy.mockReturnValue({
    result: "allowed",
    reasons: ["Action is within V1 auto-send policy."]
  });
  mocks.executeAgentDecision.mockResolvedValue({ status: "executed", toolResults: [] });
}

describe("processAgentMailInbound reliability guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeAgentMailInbound.mockReturnValue({
      eventId: "event-1",
      inboxId: "unknown-inbox",
      messageId: "message-1",
      threadId: "thread-1",
      from: "agent@example.com",
      to: ["tc@example.com"],
      cc: [],
      subject: "Contract",
      text: "See attached.",
      attachments: []
    });
    mocks.findTcProfileByInbox.mockResolvedValue(null);
    mocks.markWebhookEventProcessed.mockResolvedValue(undefined);
    mocks.createAgentActivityRun.mockResolvedValue({ id: "run-1" });
    mocks.updateAgentActivityRun.mockResolvedValue({ id: "run-1" });
    mocks.updateIntakeArtifact.mockResolvedValue({ id: "artifact-1" });
  });

  it("marks unknown inbox webhooks processed before ignoring them", async () => {
    await expect(
      processAgentMailInbound({
        webhookEventId: "webhook-1",
        agentMailEvent: { id: "event-1" }
      })
    ).resolves.toEqual({ status: "ignored", reason: "unknown_inbox" });

    expect(mocks.markWebhookEventProcessed).toHaveBeenCalledWith("webhook-1");
  });

  it("overrides contract intake with a realtor-only transaction map calendar CTA", async () => {
    setupContractIntake({
      generatedMilestones: [
        {
          key: "closing_date",
          title: "Closing date",
          phase: "closing_funding",
          dueDate: "2026-06-30",
          sourceType: "explicit_date",
          sourceReference: "Paragraph 9A",
          riskLevel: "critical"
        }
      ]
    });

    await processAgentMailInbound({
      webhookEventId: "webhook-1",
      agentMailEvent: { id: "event-1" }
    });

    const decision = mocks.executeAgentDecision.mock.calls[0][0].decision;
    expect(decision.action).toBe("process_contract");
    expect(decision.requiresApproval).toBe(false);
    expect(decision.response.to).toEqual(["agent@example.com"]);
    expect(decision.response.body).toContain("built the initial transaction map");
    expect(decision.response.body).toContain(
      "https://tc.example.com/calendar/transactions/token-1"
    );
    expect(mocks.createOrReuseTransactionCalendarFeed).toHaveBeenCalledWith({
      transactionId: "tx-1"
    });
    expect(mocks.createIntakeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactKey: "inbox-1:message:message-1",
        subject: "Executed contract"
      })
    );
    expect(mocks.storeIntakeArtifactAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        intakeArtifactId: "artifact-1",
        attachment: expect.objectContaining({ id: "attachment-1" })
      })
    );
    expect(mocks.createIntakeArtifact.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findOrCreateTransactionForIntake.mock.invocationCallOrder[0]
    );
  });

  it("omits the calendar CTA when generated milestones are undated", async () => {
    setupContractIntake({
      generatedMilestones: [
        {
          key: "title_commitment_due",
          title: "Title commitment due",
          phase: "title_survey_disclosures",
          sourceType: "derived_event",
          sourceReference: "20 days after title receives contract",
          riskLevel: "watch"
        }
      ]
    });

    await processAgentMailInbound({
      webhookEventId: "webhook-1",
      agentMailEvent: { id: "event-1" }
    });

    const decision = mocks.executeAgentDecision.mock.calls[0][0].decision;
    expect(decision.response.body).not.toContain("Add these deadlines to Google Calendar");
    expect(mocks.createOrReuseTransactionCalendarFeed).not.toHaveBeenCalled();
  });
});
