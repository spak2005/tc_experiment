import type { ContractFacts, ExpectedDocument } from "@/lib/contracts/facts";
import { getStringFact } from "@/lib/contracts/facts";

type ExpectedDocumentDraft = Omit<
  ExpectedDocument,
  "status" | "confidence" | "needsConfirmation"
> &
  Partial<Pick<ExpectedDocument, "status" | "confidence" | "needsConfirmation">>;

function expectedDocument(input: ExpectedDocumentDraft): ExpectedDocument {
  return {
    status: "needed",
    confidence: 0.8,
    needsConfirmation: false,
    ...input
  };
}

function addendaValues(facts: ContractFacts) {
  return facts.addenda
    .map((item) => String(item.value ?? "").toLowerCase())
    .join(" ");
}

export function buildExpectedDocumentChecklist(facts: ContractFacts): ExpectedDocument[] {
  const addenda = addendaValues(facts);
  const financed =
    facts.cashOrFinanced?.value === "financed" ||
    facts.financing?.financingType?.value === "third_party" ||
    addenda.includes("financing");
  const hoaRequired = facts.hoaRequired?.value === true || facts.hoa?.required?.value === true;
  const sellerDisclosureRequired =
    facts.disclosures?.sellerDisclosureRequired?.value !== false;
  const leadBasedPaintRequired =
    facts.disclosures?.leadBasedPaintRequired?.value === true ||
    addenda.includes("lead-based") ||
    addenda.includes("lead based");
  const titleCompany = getStringFact(facts.titleCompany) ?? getStringFact(facts.titleEscrow?.titleCompany);

  const documents: ExpectedDocument[] = [
    expectedDocument({
      key: "executed_contract",
      type: "contract",
      name: "Executed contract",
      ownerRole: "agent",
      status: "received",
      sourceReference: "Contract intake",
      confidence: 0.95
    }),
    expectedDocument({
      key: "earnest_money_receipt",
      type: "earnest_money_receipt",
      name: "Earnest money receipt",
      ownerRole: "title",
      sourceReference: "TREC Paragraph 5A",
      confidence: 0.9
    }),
    expectedDocument({
      key: "option_fee_receipt",
      type: "option_fee_receipt",
      name: "Option fee receipt",
      ownerRole: "seller",
      sourceReference: "TREC Paragraph 5A",
      confidence: 0.85
    }),
    expectedDocument({
      key: "title_commitment",
      type: "title_commitment",
      name: "Title commitment",
      ownerRole: "title",
      sourceReference: titleCompany ? `Title company: ${titleCompany}` : "TREC Paragraph 6",
      confidence: 0.9
    }),
    expectedDocument({
      key: "survey_or_t47",
      type: "survey",
      name: "Survey or T-47",
      ownerRole: "listing_agent",
      sourceReference: "TREC Paragraph 6C",
      confidence: 0.85
    })
  ];

  if (sellerDisclosureRequired) {
    documents.push(
      expectedDocument({
        key: "seller_disclosure",
        type: "seller_disclosure",
        name: "Seller's disclosure",
        ownerRole: "listing_agent",
        sourceReference: "TREC Paragraph 7B",
        confidence: 0.85
      })
    );
  }

  if (financed) {
    documents.push(
      expectedDocument({
        key: "lender_status_update",
        type: "lender_status",
        name: "Lender status update",
        ownerRole: "lender",
        sourceReference: "Third Party Financing Addendum",
        confidence: 0.85
      }),
      expectedDocument({
        key: "appraisal",
        type: "appraisal",
        name: "Appraisal report or status",
        ownerRole: "lender",
        sourceReference: "Third Party Financing Addendum",
        confidence: 0.8
      }),
      expectedDocument({
        key: "closing_disclosure",
        type: "closing_disclosure",
        name: "Closing Disclosure",
        ownerRole: "lender",
        sourceReference: "TRID",
        confidence: 0.85
      })
    );
  }

  if (hoaRequired) {
    documents.push(
      expectedDocument({
        key: "hoa_resale_certificate",
        type: "hoa_resale_certificate",
        name: "HOA resale certificate",
        ownerRole: "hoa",
        sourceReference: "HOA Addendum",
        confidence: 0.85
      })
    );
  }

  if (leadBasedPaintRequired) {
    documents.push(
      expectedDocument({
        key: "lead_based_paint_addendum",
        type: "lead_based_paint_addendum",
        name: "Lead-Based Paint Addendum",
        ownerRole: "listing_agent",
        sourceReference: "Lead-Based Paint Addendum",
        confidence: 0.85
      })
    );
  }

  documents.push(
    expectedDocument({
      key: "final_settlement_statement",
      type: "settlement_statement",
      name: "Final settlement statement",
      ownerRole: "title",
      sourceReference: "Closing package",
      confidence: 0.8
    }),
    expectedDocument({
      key: "commission_disbursement",
      type: "commission_disbursement",
      name: "Commission disbursement authorization",
      ownerRole: "title",
      sourceReference: "Post-closing checklist",
      confidence: 0.75
    })
  );

  return documents;
}
