import { z } from "zod";

export const extractedValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  sourceReference: z.string().optional(),
  evidence: z.string().optional(),
  needsConfirmation: z.boolean().default(false)
});

export const extractedContactSchema = z.object({
  role: z.enum([
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
  ]),
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  organization: z.string().optional(),
  confidence: z.number().min(0).max(1),
  sourceReference: z.string().optional(),
  evidence: z.string().optional(),
  needsConfirmation: z.boolean().default(false)
});

export const expectedDocumentSchema = z.object({
  key: z.string(),
  type: z.string(),
  name: z.string(),
  ownerRole: z.string(),
  status: z
    .enum([
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
    .default("needed"),
  dueDate: z.string().optional(),
  sourceReference: z.string().optional(),
  evidence: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  needsConfirmation: z.boolean().default(false)
});

export const financingTermsSchema = z.object({
  financingType: extractedValueSchema.optional(),
  lenderName: extractedValueSchema.optional(),
  loanOfficerName: extractedValueSchema.optional(),
  loanOfficerEmail: extractedValueSchema.optional(),
  loanApprovalDeadlineDays: extractedValueSchema.optional(),
  appraisalRequired: extractedValueSchema.optional(),
  appraisalDeadlineDays: extractedValueSchema.optional()
});

export const titleEscrowTermsSchema = z.object({
  titleCompany: extractedValueSchema.optional(),
  escrowOfficerName: extractedValueSchema.optional(),
  escrowOfficerEmail: extractedValueSchema.optional(),
  titleCommitmentDeadlineDays: extractedValueSchema.optional(),
  titleObjectionDeadlineDays: extractedValueSchema.optional()
});

export const hoaTermsSchema = z.object({
  required: extractedValueSchema.optional(),
  managementCompany: extractedValueSchema.optional(),
  contactEmail: extractedValueSchema.optional(),
  resaleCertificateRequired: extractedValueSchema.optional()
});

export const disclosureTermsSchema = z.object({
  sellerDisclosureRequired: extractedValueSchema.optional(),
  sellerDisclosureDeadlineDays: extractedValueSchema.optional(),
  leadBasedPaintRequired: extractedValueSchema.optional()
});

export const contractFactsSchema = z.object({
  contractVersion: z.enum(["TREC_20_18", "TREC_20_17", "TREC_20_14", "UNKNOWN"]),
  propertyAddress: extractedValueSchema.optional(),
  buyerNames: extractedValueSchema.optional(),
  sellerNames: extractedValueSchema.optional(),
  salesPrice: extractedValueSchema.optional(),
  cashOrFinanced: extractedValueSchema.optional(),
  titleCompany: extractedValueSchema.optional(),
  earnestMoneyAmount: extractedValueSchema.optional(),
  optionFeeAmount: extractedValueSchema.optional(),
  optionPeriodDays: extractedValueSchema.optional(),
  effectiveDate: extractedValueSchema.optional(),
  closingDate: extractedValueSchema.optional(),
  surveySelection: extractedValueSchema.optional(),
  surveyDeadlineDays: extractedValueSchema.optional(),
  sellerDisclosureDeadlineDays: extractedValueSchema.optional(),
  titleObjectionDays: extractedValueSchema.optional(),
  hoaRequired: extractedValueSchema.optional(),
  addenda: z.array(extractedValueSchema).default([]),
  contacts: z.array(extractedContactSchema).default([]),
  expectedDocuments: z.array(expectedDocumentSchema).default([]),
  financing: financingTermsSchema.optional(),
  titleEscrow: titleEscrowTermsSchema.optional(),
  hoa: hoaTermsSchema.optional(),
  disclosures: disclosureTermsSchema.optional(),
  signatureStatus: z.enum(["appears_executed", "missing_signature", "unknown"]),
  missingRequiredFacts: z.array(z.string()).default([])
});

export type ExtractedValue = z.infer<typeof extractedValueSchema>;
export type ExtractedContact = z.infer<typeof extractedContactSchema>;
export type ExpectedDocument = z.infer<typeof expectedDocumentSchema>;
export type ContractFacts = z.infer<typeof contractFactsSchema>;

export function needsFactConfirmation(fact?: ExtractedValue): boolean {
  return !fact || fact.needsConfirmation || fact.confidence < 0.8 || fact.value === null;
}

export function getStringFact(fact?: ExtractedValue): string | undefined {
  return typeof fact?.value === "string" && fact.value.trim()
    ? fact.value.trim()
    : undefined;
}

export function getNumberFact(fact?: ExtractedValue): number | undefined {
  return typeof fact?.value === "number" ? fact.value : undefined;
}
