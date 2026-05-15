import { z } from "zod";

export const documentClassificationSchema = z.object({
  categoryKey: z.string().min(1).optional(),
  categoryLabel: z.string().min(1).optional(),
  matchedDocumentId: z.string().uuid().optional(),
  matchedDocumentName: z.string().min(1).optional(),
  satisfiesExpectedDocument: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
});

export type DocumentClassificationOutput = z.infer<typeof documentClassificationSchema>;
