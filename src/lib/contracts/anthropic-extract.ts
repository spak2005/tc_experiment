import type { ContractFacts } from "@/lib/contracts/facts";
import { contractFactsSchema, type ExtractedValue } from "@/lib/contracts/facts";
import { buildExpectedDocumentChecklist } from "@/lib/contracts/checklist";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import {
  formatTemporalContextLine,
  getTemporalContext,
  type TemporalContext
} from "@/lib/time/clock";
import { PDFDocument } from "pdf-lib";

export interface ExtractPdfFactsInput {
  filename: string;
  pdf: Buffer;
  emailContext?: string;
  temporalContext?: TemporalContext;
}

export interface ExtractPdfFactsFromChunksInput extends ExtractPdfFactsInput {
  pagesPerChunk?: number;
  concurrency?: number;
}

const anthropicExtractionTimeoutMs = 75_000;
const anthropicExtractionMaxRetries = 0;
const defaultChunkConcurrency = 3;

const SYSTEM_PROMPT = `You are an expert Texas residential real estate transaction coordinator.
Extract contract facts from Texas residential resale contracts, especially TREC 20-18.
Do not provide legal advice. Do not infer facts that are not present.
Return only valid JSON matching the requested schema.`;

const USER_PROMPT = `Extract the transaction facts needed to open a Texas residential transaction file.

Use this output shape exactly:
{
  "contractVersion": "TREC_20_18" | "TREC_20_17" | "TREC_20_14" | "UNKNOWN",
  "propertyAddress": extractedValue?,
  "buyerNames": extractedValue?,
  "sellerNames": extractedValue?,
  "salesPrice": extractedValue?,
  "cashOrFinanced": extractedValue?,
  "titleCompany": extractedValue?,
  "earnestMoneyAmount": extractedValue?,
  "optionFeeAmount": extractedValue?,
  "optionPeriodDays": extractedValue?,
  "effectiveDate": extractedValue?,
  "closingDate": extractedValue?,
  "surveySelection": extractedValue?,
  "surveyDeadlineDays": extractedValue?,
  "sellerDisclosureDeadlineDays": extractedValue?,
  "titleObjectionDays": extractedValue?,
  "hoaRequired": extractedValue?,
  "addenda": extractedValue[],
  "contacts": [
    {
      "role": "buyer" | "seller" | "buyer_agent" | "listing_agent" | "title" | "lender" | "inspector" | "appraiser" | "surveyor" | "attorney" | "hoa" | "broker_compliance" | "vendor" | "agent_client",
      "name": "optional person name",
      "email": "optional email",
      "phone": "optional phone",
      "organization": "optional company",
      "confidence": number from 0 to 1,
      "sourceReference": "paragraph/page reference",
      "evidence": "short quote or description",
      "needsConfirmation": boolean
    }
  ],
  "expectedDocuments": [
    {
      "key": "stable_snake_case_key",
      "type": "document type",
      "name": "human document name",
      "ownerRole": "buyer" | "seller" | "buyer_agent" | "listing_agent" | "title" | "lender" | "hoa" | "agent" | "tc",
      "status": "needed" | "requested" | "received" | "under_review" | "needs_correction" | "submitted" | "approved" | "rejected" | "not_applicable",
      "dueDate": "optional ISO YYYY-MM-DD",
      "sourceReference": "contract/addendum reference",
      "evidence": "short quote or description",
      "confidence": number from 0 to 1,
      "needsConfirmation": boolean
    }
  ],
  "financing": {
    "financingType": extractedValue?,
    "lenderName": extractedValue?,
    "loanOfficerName": extractedValue?,
    "loanOfficerEmail": extractedValue?,
    "loanApprovalDeadlineDays": extractedValue?,
    "appraisalRequired": extractedValue?,
    "appraisalDeadlineDays": extractedValue?
  },
  "titleEscrow": {
    "titleCompany": extractedValue?,
    "escrowOfficerName": extractedValue?,
    "escrowOfficerEmail": extractedValue?,
    "titleCommitmentDeadlineDays": extractedValue?,
    "titleObjectionDeadlineDays": extractedValue?
  },
  "hoa": {
    "required": extractedValue?,
    "managementCompany": extractedValue?,
    "contactEmail": extractedValue?,
    "resaleCertificateRequired": extractedValue?
  },
  "disclosures": {
    "sellerDisclosureRequired": extractedValue?,
    "sellerDisclosureDeadlineDays": extractedValue?,
    "leadBasedPaintRequired": extractedValue?
  },
  "signatureStatus": "appears_executed" | "missing_signature" | "unknown",
  "missingRequiredFacts": string[]
}

Each extractedValue must be:
{
  "value": string | number | boolean | null,
  "confidence": number from 0 to 1,
  "sourceReference": "paragraph/page reference",
  "evidence": "short quote or description",
  "needsConfirmation": boolean
}

Critical required facts are Effective Date, Closing Date, cash vs financed, earnest money amount, option period length if option applies, title company/escrow officer, and property address.
Extract all visible coordination contacts, especially buyer, seller, listing agent, title/escrow officer, lender/loan officer, HOA management, inspector, appraiser, and surveyor.
Expected documents should include the executed contract, earnest money receipt, option fee receipt, title commitment, survey/T-47, seller disclosure, financing/lender/appraisal documents when financed, HOA resale certificate when applicable, closing disclosure, settlement statement, and commission disbursement if applicable.
For TREC 20-18, Paragraph 5 contains earnest money, option fee, and option period. Paragraph 9 contains Closing Date. The execution page contains Effective Date.
If a value is blank, unreadable, absent, or ambiguous, set value to null, confidence below 0.5, needsConfirmation true, and include the field name in missingRequiredFacts.
Use ISO YYYY-MM-DD dates when a date is clear.`;

export async function extractContractFactsFromPdf(
  input: ExtractPdfFactsInput
): Promise<ContractFacts> {
  const client = getAnthropicClient();
  const temporalContext = input.temporalContext ?? getTemporalContext();
  const response = await client.messages.create(
    {
      model: getAnthropicModel(),
      max_tokens: 4000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              title: input.filename,
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: input.pdf.toString("base64")
              }
            },
            {
              type: "text",
              text: `${USER_PROMPT}\n\n${formatTemporalContextLine(
                temporalContext
              )}\n\nEmail context:\n${input.emailContext ?? "None"}`
            }
          ]
        }
      ]
    },
    {
      maxRetries: anthropicExtractionMaxRetries,
      timeout: anthropicExtractionTimeoutMs
    }
  );

  const text = getFirstTextBlock(response.content);
  const parsed = parseJsonObject<unknown>(text);

  return contractFactsSchema.parse(parsed);
}

function betterValue(left?: ExtractedValue, right?: ExtractedValue) {
  if (!left) return right;
  if (!right) return left;
  if (left.value === null && right.value !== null) return right;
  if (right.value === null) return left;
  return right.confidence > left.confidence ? right : left;
}

function mergeUniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function factIsMissing(fact?: ExtractedValue) {
  return !fact || fact.value === null;
}

function missingFactKeys(facts: ContractFacts) {
  const missing: string[] = [];

  if (factIsMissing(facts.propertyAddress)) missing.push("propertyAddress");
  if (factIsMissing(facts.effectiveDate)) missing.push("effectiveDate");
  if (factIsMissing(facts.closingDate)) missing.push("closingDate");
  if (factIsMissing(facts.cashOrFinanced)) missing.push("cashOrFinanced");
  if (factIsMissing(facts.earnestMoneyAmount)) missing.push("earnestMoneyAmount");
  if (factIsMissing(facts.optionPeriodDays)) missing.push("optionPeriodDays");
  if (factIsMissing(facts.titleCompany) && factIsMissing(facts.titleEscrow?.titleCompany)) {
    missing.push("titleCompany");
  }

  return missing;
}

function mergeContractFacts(facts: ContractFacts[]) {
  const [first, ...rest] = facts;
  let merged: ContractFacts = {
    ...first,
    addenda: [...first.addenda],
    contacts: [...first.contacts],
    expectedDocuments: [...first.expectedDocuments],
    financing: first.financing ? { ...first.financing } : undefined,
    titleEscrow: first.titleEscrow ? { ...first.titleEscrow } : undefined,
    hoa: first.hoa ? { ...first.hoa } : undefined,
    disclosures: first.disclosures ? { ...first.disclosures } : undefined
  };

  for (const item of rest) {
    merged = {
      ...merged,
      contractVersion:
        merged.contractVersion === "UNKNOWN" ? item.contractVersion : merged.contractVersion,
      propertyAddress: betterValue(merged.propertyAddress, item.propertyAddress),
      buyerNames: betterValue(merged.buyerNames, item.buyerNames),
      sellerNames: betterValue(merged.sellerNames, item.sellerNames),
      salesPrice: betterValue(merged.salesPrice, item.salesPrice),
      cashOrFinanced: betterValue(merged.cashOrFinanced, item.cashOrFinanced),
      titleCompany: betterValue(merged.titleCompany, item.titleCompany),
      earnestMoneyAmount: betterValue(merged.earnestMoneyAmount, item.earnestMoneyAmount),
      optionFeeAmount: betterValue(merged.optionFeeAmount, item.optionFeeAmount),
      optionPeriodDays: betterValue(merged.optionPeriodDays, item.optionPeriodDays),
      effectiveDate: betterValue(merged.effectiveDate, item.effectiveDate),
      closingDate: betterValue(merged.closingDate, item.closingDate),
      surveySelection: betterValue(merged.surveySelection, item.surveySelection),
      surveyDeadlineDays: betterValue(merged.surveyDeadlineDays, item.surveyDeadlineDays),
      sellerDisclosureDeadlineDays: betterValue(
        merged.sellerDisclosureDeadlineDays,
        item.sellerDisclosureDeadlineDays
      ),
      titleObjectionDays: betterValue(merged.titleObjectionDays, item.titleObjectionDays),
      hoaRequired: betterValue(merged.hoaRequired, item.hoaRequired),
      addenda: mergeUniqueBy([...merged.addenda, ...item.addenda], (addendum) =>
        String(addendum.value ?? addendum.evidence ?? addendum.sourceReference ?? "")
      ),
      contacts: mergeUniqueBy([...merged.contacts, ...item.contacts], (contact) =>
        [contact.role, contact.email, contact.name, contact.organization].filter(Boolean).join(":")
      ),
      expectedDocuments: mergeUniqueBy(
        [...merged.expectedDocuments, ...item.expectedDocuments],
        (document) => document.key
      ),
      financing: {
        ...merged.financing,
        ...item.financing,
        financingType: betterValue(
          merged.financing?.financingType,
          item.financing?.financingType
        ),
        lenderName: betterValue(merged.financing?.lenderName, item.financing?.lenderName),
        loanOfficerName: betterValue(
          merged.financing?.loanOfficerName,
          item.financing?.loanOfficerName
        ),
        loanOfficerEmail: betterValue(
          merged.financing?.loanOfficerEmail,
          item.financing?.loanOfficerEmail
        ),
        loanApprovalDeadlineDays: betterValue(
          merged.financing?.loanApprovalDeadlineDays,
          item.financing?.loanApprovalDeadlineDays
        ),
        appraisalRequired: betterValue(
          merged.financing?.appraisalRequired,
          item.financing?.appraisalRequired
        ),
        appraisalDeadlineDays: betterValue(
          merged.financing?.appraisalDeadlineDays,
          item.financing?.appraisalDeadlineDays
        )
      },
      titleEscrow: {
        ...merged.titleEscrow,
        ...item.titleEscrow,
        titleCompany: betterValue(
          merged.titleEscrow?.titleCompany,
          item.titleEscrow?.titleCompany
        ),
        escrowOfficerName: betterValue(
          merged.titleEscrow?.escrowOfficerName,
          item.titleEscrow?.escrowOfficerName
        ),
        escrowOfficerEmail: betterValue(
          merged.titleEscrow?.escrowOfficerEmail,
          item.titleEscrow?.escrowOfficerEmail
        ),
        titleCommitmentDeadlineDays: betterValue(
          merged.titleEscrow?.titleCommitmentDeadlineDays,
          item.titleEscrow?.titleCommitmentDeadlineDays
        ),
        titleObjectionDeadlineDays: betterValue(
          merged.titleEscrow?.titleObjectionDeadlineDays,
          item.titleEscrow?.titleObjectionDeadlineDays
        )
      },
      hoa: {
        ...merged.hoa,
        ...item.hoa,
        required: betterValue(merged.hoa?.required, item.hoa?.required),
        managementCompany: betterValue(
          merged.hoa?.managementCompany,
          item.hoa?.managementCompany
        ),
        contactEmail: betterValue(merged.hoa?.contactEmail, item.hoa?.contactEmail),
        resaleCertificateRequired: betterValue(
          merged.hoa?.resaleCertificateRequired,
          item.hoa?.resaleCertificateRequired
        )
      },
      disclosures: {
        ...merged.disclosures,
        ...item.disclosures,
        sellerDisclosureRequired: betterValue(
          merged.disclosures?.sellerDisclosureRequired,
          item.disclosures?.sellerDisclosureRequired
        ),
        sellerDisclosureDeadlineDays: betterValue(
          merged.disclosures?.sellerDisclosureDeadlineDays,
          item.disclosures?.sellerDisclosureDeadlineDays
        ),
        leadBasedPaintRequired: betterValue(
          merged.disclosures?.leadBasedPaintRequired,
          item.disclosures?.leadBasedPaintRequired
        )
      },
      signatureStatus:
        merged.signatureStatus === "appears_executed" ||
        item.signatureStatus === "appears_executed"
          ? "appears_executed"
          : merged.signatureStatus === "missing_signature" ||
              item.signatureStatus === "missing_signature"
            ? "missing_signature"
            : "unknown"
    };
  }

  merged = {
    ...merged,
    titleCompany: betterValue(merged.titleCompany, merged.titleEscrow?.titleCompany),
    missingRequiredFacts: missingFactKeys(merged)
  };

  return contractFactsSchema.parse({
    ...merged,
    expectedDocuments:
      merged.expectedDocuments.length > 0
        ? merged.expectedDocuments
        : buildExpectedDocumentChecklist(merged)
  });
}

async function splitPdfIntoChunks(input: ExtractPdfFactsFromChunksInput) {
  const source = await PDFDocument.load(input.pdf, { ignoreEncryption: true });
  const pagesPerChunk = input.pagesPerChunk ?? 8;
  const chunks: Array<{ filename: string; pdf: Buffer; pageStart: number; pageEnd: number }> = [];

  for (let start = 0; start < source.getPageCount(); start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, source.getPageCount());
    const chunk = await PDFDocument.create();
    const pages = await chunk.copyPages(
      source,
      Array.from({ length: end - start }, (_, index) => start + index)
    );

    for (const page of pages) {
      chunk.addPage(page);
    }

    const bytes = await chunk.save();
    chunks.push({
      filename: `${input.filename} pages ${start + 1}-${end}`,
      pdf: Buffer.from(bytes),
      pageStart: start + 1,
      pageEnd: end
    });
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

export async function extractContractFactsFromPdfChunks(
  input: ExtractPdfFactsFromChunksInput
): Promise<ContractFacts> {
  const chunks = await splitPdfIntoChunks(input);
  const results = await mapWithConcurrency(
    chunks,
    input.concurrency ?? defaultChunkConcurrency,
    async (chunk): Promise<{ facts?: ContractFacts; error?: string }> => {
      try {
        return {
          facts: await extractContractFactsFromPdf({
            filename: chunk.filename,
            pdf: chunk.pdf,
            emailContext: `${input.emailContext ?? "None"}\n\nThis is page chunk ${chunk.pageStart}-${chunk.pageEnd}.`,
            temporalContext: input.temporalContext
          })
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `pages ${chunk.pageStart}-${chunk.pageEnd}: ${error.message}`
              : `pages ${chunk.pageStart}-${chunk.pageEnd}: unknown error`
        };
      }
    }
  );

  const extracted = results.flatMap((result) => result.facts ?? []);
  const errors = results.flatMap((result) => result.error ?? []);

  if (extracted.length === 0) {
    throw new Error(`All PDF chunk extraction attempts failed. ${errors.join(" ")}`);
  }

  return mergeContractFacts(extracted);
}
