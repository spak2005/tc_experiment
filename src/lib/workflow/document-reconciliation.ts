import { classifyTransactionDocument } from "@/lib/agent/document-classifier";
import type { TransactionContext } from "@/lib/agent/types";
import type {
  DocumentClassification,
  EvidenceDocumentInput
} from "@/lib/workflow/evidence-types";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function classifyEvidenceDocuments(input: {
  context: TransactionContext;
  documents: EvidenceDocumentInput[];
  emailText?: string;
}): Promise<DocumentClassification[]> {
  const expectedDocuments = input.context.documents
    .filter((document) => !["received", "approved", "not_applicable"].includes(String(document.status)))
    .map((document) => ({
      id: typeof document.id === "string" ? document.id : undefined,
      name: String(document.name),
      type: typeof document.type === "string" ? document.type : undefined,
      status: typeof document.status === "string" ? document.status : undefined,
      metadata: recordValue(document.metadata)
    }));

  const classifications: DocumentClassification[] = [];

  for (const document of input.documents) {
    classifications.push(
      await classifyTransactionDocument({
        documentId: document.documentId,
        filename: document.filename,
        contentType: document.contentType,
        body: document.body,
        emailText: input.emailText,
        expectedDocuments
      })
    );
  }

  return classifications;
}
