import { z } from "zod";

export const extractedValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  sourceReference: z.string().optional(),
  evidence: z.string().optional(),
  needsConfirmation: z.boolean().default(false)
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
  signatureStatus: z.enum(["appears_executed", "missing_signature", "unknown"]),
  missingRequiredFacts: z.array(z.string()).default([])
});

export type ExtractedValue = z.infer<typeof extractedValueSchema>;
export type ContractFacts = z.infer<typeof contractFactsSchema>;

export function needsFactConfirmation(fact?: ExtractedValue): boolean {
  return !fact || fact.needsConfirmation || fact.confidence < 0.8 || fact.value === null;
}
