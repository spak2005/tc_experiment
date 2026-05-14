import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema)
  ])
);

export const transactionWriteSourceSchema = z.object({
  sourceType: z.enum(["contract_extraction", "email", "agent", "system", "manual"]),
  sourceReference: z.string().optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().optional()
});

const transactionIdSchema = z.object({
  transactionId: z.string().uuid()
});

export const updateTransactionCoreWriteSchema = z.object({
  name: z.literal("updateTransactionCore"),
  input: transactionIdSchema
    .extend({
      propertyAddress: z.string().min(1).optional(),
      side: z.enum(["buyer", "listing", "dual", "unknown"]).optional(),
      status: z
        .enum([
          "intake_processing",
          "needs_agent_confirmation",
          "needs_info",
          "blocked_invalid_contract",
          "active",
          "terminated",
          "closed"
        ])
        .optional(),
      phase: z
        .enum([
          "opening_file",
          "earnest_money_and_option",
          "inspection_option_period",
          "title_survey_disclosures",
          "financing_appraisal",
          "compliance_da",
          "closing_prep",
          "closing_funding",
          "post_closing"
        ])
        .optional(),
      currentRisk: z.enum(["normal", "watch", "urgent", "critical"]).optional(),
      effectiveDate: dateOnlySchema.optional(),
      closingDate: dateOnlySchema.optional()
    })
    .refine(
      (input) =>
        Object.keys(input).some((key) => key !== "transactionId" && input[key as keyof typeof input] !== undefined),
      "At least one transaction field is required."
    ),
  source: transactionWriteSourceSchema
});

export const upsertTransactionFactWriteSchema = z.object({
  name: z.literal("upsertTransactionFact"),
  input: transactionIdSchema.extend({
    key: z.string().min(1),
    value: jsonValueSchema,
    needsConfirmation: z.boolean().optional()
  }),
  source: transactionWriteSourceSchema
});

const partyRoleSchema = z.enum([
  "buyer",
  "seller",
  "buyer_agent",
  "listing_agent",
  "title",
  "lender",
  "inspector",
  "appraiser",
  "surveyor",
  "attorney",
  "hoa",
  "broker_compliance",
  "vendor",
  "agent_client"
]);

export const upsertPartiesWriteSchema = z.object({
  name: z.literal("upsertParties"),
  input: transactionIdSchema.extend({
    parties: z
      .array(
        z
          .object({
            role: partyRoleSchema,
            name: z.string().min(1).optional(),
            email: z.string().email().optional(),
            phone: z.string().min(1).optional(),
            organization: z.string().min(1).optional(),
            confidence: z.number().min(0).max(1).optional(),
            source: z.string().optional()
          })
          .refine((party) => party.name || party.email || party.organization, {
            message: "Party requires at least a name, email, or organization."
          })
      )
      .min(1)
  }),
  source: transactionWriteSourceSchema
});

export const upsertMilestonesWriteSchema = z.object({
  name: z.literal("upsertMilestones"),
  input: transactionIdSchema.extend({
    milestones: z
      .array(
        z.object({
          key: z.string().min(1),
          title: z.string().min(1),
          phase: z.enum([
            "opening_file",
            "earnest_money_and_option",
            "inspection_option_period",
            "title_survey_disclosures",
            "financing_appraisal",
            "compliance_da",
            "closing_prep",
            "closing_funding",
            "post_closing"
          ]),
          dueDate: dateOnlySchema.nullable().optional(),
          sourceType: z.enum([
            "anchor_offset",
            "explicit_date",
            "derived_event",
            "manual_override",
            "amendment_override"
          ]),
          sourceReference: z.string().optional(),
          riskLevel: z.enum(["normal", "watch", "urgent", "critical"]),
          completedAt: z.string().datetime().nullable().optional(),
          metadata: z.record(jsonValueSchema).optional()
        })
      )
      .min(1)
  }),
  source: transactionWriteSourceSchema
});

export const updateTasksWriteSchema = z.object({
  name: z.literal("updateTasks"),
  input: transactionIdSchema.extend({
    tasks: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            title: z.string().min(1).optional(),
            ownerRole: z.string().min(1).optional(),
            status: z
              .enum([
                "not_started",
                "drafted",
                "waiting_approval",
                "sent",
                "waiting_response",
                "received",
                "needs_correction",
                "blocked",
                "complete",
                "cancelled"
              ])
              .optional(),
            dueDate: dateOnlySchema.nullable().optional(),
            followUpDueDate: dateOnlySchema.nullable().optional(),
            metadata: z.record(jsonValueSchema).optional()
          })
          .refine((task) => task.id || (task.title && task.ownerRole), {
            message: "Task update requires either id or title plus ownerRole."
          })
      )
      .min(1)
  }),
  source: transactionWriteSourceSchema
});

export const updateDocumentsWriteSchema = z.object({
  name: z.literal("updateDocuments"),
  input: transactionIdSchema.extend({
    documents: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(1).optional(),
            type: z.string().min(1).optional(),
            ownerRole: z.string().min(1).optional(),
            dueDate: dateOnlySchema.nullable().optional(),
            metadata: z.record(jsonValueSchema).optional(),
            status: z.enum([
              "needed",
              "requested",
              "received",
              "under_review",
              "needs_correction",
              "submitted",
              "approved",
              "rejected",
              "not_applicable"
            ])
          })
          .refine((document) => document.id || document.name, {
            message: "Document update requires either id or name."
          })
      )
      .min(1)
  }),
  source: transactionWriteSourceSchema
});

export const upsertBlockerWriteSchema = z.object({
  name: z.literal("upsertBlocker"),
  input: transactionIdSchema.extend({
    id: z.string().uuid().optional(),
    title: z.string().min(1),
    details: z.string().min(1),
    riskLevel: z.enum(["normal", "watch", "urgent", "critical"]),
    responsiblePartyRole: partyRoleSchema.optional(),
    deadlineId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    resolved: z.boolean().optional()
  }),
  source: transactionWriteSourceSchema
});

export const appendTransactionMemoryWriteSchema = z.object({
  name: z.literal("appendTransactionMemory"),
  input: transactionIdSchema.extend({
    summary: z.string().optional(),
    openQuestions: z.array(z.string()).optional(),
    knownContext: z.record(jsonValueSchema).optional()
  }),
  source: transactionWriteSourceSchema
});

export const transactionWriteSchema = z.discriminatedUnion("name", [
  updateTransactionCoreWriteSchema,
  upsertTransactionFactWriteSchema,
  upsertPartiesWriteSchema,
  upsertMilestonesWriteSchema,
  updateTasksWriteSchema,
  updateDocumentsWriteSchema,
  upsertBlockerWriteSchema,
  appendTransactionMemoryWriteSchema
]);

export const transactionWritesSchema = z.array(transactionWriteSchema).default([]);

export type TransactionWriteSource = z.infer<typeof transactionWriteSourceSchema>;
export type TransactionWrite = z.infer<typeof transactionWriteSchema>;

export interface TransactionWriteResult {
  name: TransactionWrite["name"];
  status: "applied" | "approval_required" | "blocked" | "skipped";
  targetType: string;
  targetId?: string;
  fieldKey: string;
  message: string;
  previousValue?: unknown;
  newValue?: unknown;
}
