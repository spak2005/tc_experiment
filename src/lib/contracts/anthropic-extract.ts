import type { ContractFacts } from "@/lib/contracts/facts";
import { contractFactsSchema } from "@/lib/contracts/facts";
import { getAnthropicClient, getAnthropicModel } from "@/lib/llm/anthropic";
import { getFirstTextBlock, parseJsonObject } from "@/lib/llm/json";
import {
  formatTemporalContextLine,
  getTemporalContext,
  type TemporalContext
} from "@/lib/time/clock";

export interface ExtractPdfFactsInput {
  filename: string;
  pdf: Buffer;
  emailContext?: string;
  temporalContext?: TemporalContext;
}

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
  const response = await client.messages.create({
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
  });

  const text = getFirstTextBlock(response.content);
  const parsed = parseJsonObject<unknown>(text);

  return contractFactsSchema.parse(parsed);
}
