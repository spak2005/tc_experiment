import type { ContractFacts, ExtractedValue } from "@/lib/contracts/facts";

function value(
  extracted: string | number | boolean | null,
  confidence: number,
  sourceReference: string,
  evidence?: string
): ExtractedValue {
  return {
    value: extracted,
    confidence,
    sourceReference,
    evidence,
    needsConfirmation: confidence < 0.8 || extracted === null
  };
}

function findFirst(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function detectTrecVersion(text: string): ContractFacts["contractVersion"] {
  if (/TREC\s+NO\.\s+20-18/i.test(text)) {
    return "TREC_20_18";
  }

  if (/TREC\s+NO\.\s+20-17/i.test(text)) {
    return "TREC_20_17";
  }

  if (/TREC\s+NO\.\s+20-14/i.test(text)) {
    return "TREC_20_14";
  }

  return "UNKNOWN";
}

export function extractTexasContractFacts(rawText: string): ContractFacts {
  const text = normalizeWhitespace(rawText);
  const contractVersion = detectTrecVersion(text);

  const propertyAddress = findFirst(
    text,
    /Texas,\s+known\s+as\s+(.+?)\s+\(address\/zip code\)/i
  );
  const closingDate = findFirst(
    text,
    /closing of the sale will be on or before\s+(.+?),\s*20\s*([0-9]{0,2})/i
  );
  const optionPeriodDays = findFirst(
    text,
    /terminate this contract.*?within\s+(\d+)\s+days after the Effective Date/i
  );
  const earnestMoneyAmount = findFirst(
    text,
    /as earnest money(?:\s+and|\s+to|\s*,).*?\$?\s*([0-9,]+(?:\.[0-9]{2})?)/i
  );
  const titleCompany = findFirst(
    text,
    /title insurance.*?issued by\s+(.+?)\s+\(Title Company\)/i
  );
  const effectiveDate = findFirst(
    text,
    /EXECUTED the\s+(.+?)\s+\(Effective Date\)/i
  );
  const isFinanced = /Third Party Financing Addendum/i.test(text);
  const hoaRequired = /Property\s+is\s+subject\s+to\s+mandatory\s+membership/i.test(text)
    ? !/is\s+not\s+subject\s+to\s+mandatory\s+membership/i.test(text)
    : null;

  const missingRequiredFacts: string[] = [];

  if (!propertyAddress) missingRequiredFacts.push("propertyAddress");
  if (!closingDate) missingRequiredFacts.push("closingDate");
  if (!effectiveDate) missingRequiredFacts.push("effectiveDate");
  if (!earnestMoneyAmount) missingRequiredFacts.push("earnestMoneyAmount");
  if (!titleCompany) missingRequiredFacts.push("titleCompany");

  return {
    contractVersion,
    propertyAddress: value(propertyAddress, propertyAddress ? 0.72 : 0, "Paragraph 2A"),
    cashOrFinanced: value(isFinanced ? "financed" : "cash_or_unknown", 0.62, "Paragraph 3/22"),
    titleCompany: value(titleCompany, titleCompany ? 0.72 : 0, "Paragraph 6A"),
    earnestMoneyAmount: value(
      earnestMoneyAmount,
      earnestMoneyAmount ? 0.62 : 0,
      contractVersion === "TREC_20_18" ? "Paragraph 5A" : "Paragraph 5"
    ),
    optionPeriodDays: value(
      optionPeriodDays ? Number(optionPeriodDays) : null,
      optionPeriodDays ? 0.7 : 0,
      contractVersion === "TREC_20_18" ? "Paragraph 5B" : "Paragraph 23"
    ),
    effectiveDate: value(effectiveDate, effectiveDate ? 0.55 : 0, "Execution page"),
    closingDate: value(closingDate, closingDate ? 0.62 : 0, "Paragraph 9A"),
    hoaRequired: value(hoaRequired, hoaRequired === null ? 0.2 : 0.65, "Paragraph 6E"),
    addenda: [],
    signatureStatus: /Buyer\s+Seller.*Buyer\s+Seller/i.test(text)
      ? "unknown"
      : "unknown",
    missingRequiredFacts
  };
}
