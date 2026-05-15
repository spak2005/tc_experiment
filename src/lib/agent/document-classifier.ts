import { z } from "zod";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import type { DocumentClassification } from "@/lib/workflow/evidence-types";

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

export interface ExpectedDocumentForClassification {
  id?: string;
  name: string;
  type?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassifyDocumentInput {
  documentId?: string;
  filename: string;
  contentType?: string;
  emailText?: string;
  expectedDocuments: ExpectedDocumentForClassification[];
  body?: Buffer;
}

function normalize(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value?: string) {
  return new Set(normalize(value).split(/\s+/).filter(Boolean));
}

function overlapScore(left?: string, right?: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;

  let matches = 0;
  for (const token of a) {
    if (b.has(token)) matches += 1;
  }

  return matches / Math.max(a.size, b.size);
}

function classificationKeywords(value: string) {
  const normalized = normalize(value);
  if (/\bsurvey\b|\bt\s*47\b|\bt47\b/.test(normalized)) {
    return { key: "survey_or_t47", label: "Survey / T-47" };
  }
  if (/\bseller\b.*\bdisclosure\b|\bdisclosure\b/.test(normalized)) {
    return { key: "seller_disclosure", label: "Seller disclosure" };
  }
  if (/\btitle\b.*\bcommitment\b|\bcommitment\b/.test(normalized)) {
    return { key: "title_commitment", label: "Title commitment" };
  }
  if (/\bhoa\b|\bresale\b.*\bcertificate\b/.test(normalized)) {
    return { key: "hoa_resale_certificate", label: "HOA resale certificate" };
  }
  if (/\bclosing\b.*\bdisclosure\b|\bcd\b/.test(normalized)) {
    return { key: "closing_disclosure", label: "Closing Disclosure" };
  }
  if (/\bappraisal\b/.test(normalized)) {
    return { key: "appraisal", label: "Appraisal" };
  }
  if (/\bearnest\b|\boption\b.*\bfee\b|\breceipt\b/.test(normalized)) {
    return { key: "receipt", label: "Payment receipt" };
  }

  return undefined;
}

function documentMetadataKey(document: ExpectedDocumentForClassification) {
  const key = document.metadata?.key;
  return typeof key === "string" ? key : undefined;
}

function deterministicClassification(input: ClassifyDocumentInput): DocumentClassification | undefined {
  const haystack = [input.filename, input.contentType, input.emailText].filter(Boolean).join(" ");
  const keyword = classificationKeywords(haystack);
  let best: ExpectedDocumentForClassification | undefined;
  let bestScore = 0;

  for (const document of input.expectedDocuments) {
    const score = Math.max(
      overlapScore(input.filename, document.name),
      keyword?.key && documentMetadataKey(document) === keyword.key ? 1 : 0,
      keyword?.label ? overlapScore(keyword.label, document.name) : 0
    );

    if (score > bestScore) {
      best = document;
      bestScore = score;
    }
  }

  if (!keyword && bestScore < 0.6) {
    return undefined;
  }

  return {
    documentId: input.documentId,
    filename: input.filename,
    categoryKey: keyword?.key ?? documentMetadataKey(best),
    categoryLabel: keyword?.label ?? best?.name,
    matchedDocumentId: best?.id,
    matchedDocumentName: best?.name,
    satisfiesExpectedDocument: Boolean(best && (bestScore >= 0.6 || keyword)),
    confidence: best ? Math.max(0.75, Math.min(0.95, bestScore)) : 0.7,
    rationale: best
      ? `Matched ${input.filename} to expected document ${best.name}.`
      : `Classified ${input.filename} as ${keyword?.label}.`,
    mode: "deterministic"
  };
}

const SYSTEM_PROMPT = `You classify real estate transaction attachments.
Match the document to one expected document when the evidence supports it.
Do not invent document categories. If uncertain, return low confidence.
Return only valid JSON matching the schema.`;

export async function classifyTransactionDocument(
  input: ClassifyDocumentInput
): Promise<DocumentClassification> {
  const deterministic = deterministicClassification(input);
  if (deterministic && deterministic.confidence >= 0.75) {
    return deterministic;
  }

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 1200,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify this transaction document.

Document:
${JSON.stringify(
  {
    filename: input.filename,
    contentType: input.contentType,
    emailText: input.emailText?.slice(0, 4000),
    bodyPreview: input.body?.toString("utf8", 0, 4000)
  },
  null,
  2
)}

Expected documents:
${JSON.stringify(input.expectedDocuments, null, 2)}

Output JSON:
{
  "categoryKey"?: string,
  "categoryLabel"?: string,
  "matchedDocumentId"?: "uuid",
  "matchedDocumentName"?: string,
  "satisfiesExpectedDocument": boolean,
  "confidence": number,
  "rationale": string
}`
            }
          ]
        }
      ]
    });
    const parsed = documentClassificationSchema.parse(
      parseJsonObject<unknown>(getFirstTextBlock(response.content))
    );

    return {
      documentId: input.documentId,
      filename: input.filename,
      ...parsed,
      mode: "llm"
    };
  } catch {
    return (
      deterministic ?? {
        documentId: input.documentId,
        filename: input.filename,
        satisfiesExpectedDocument: false,
        confidence: 0,
        rationale: "Could not confidently classify the document.",
        mode: "unclassified"
      }
    );
  }
}
