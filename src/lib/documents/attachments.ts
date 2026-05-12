import { getTcAttachment } from "@/lib/agentmail/service";
import {
  createDocumentRecord,
  updateDocumentStatus
} from "@/lib/db/repositories";
import { storePrivateDocument } from "@/lib/storage/blob";

export interface IncomingAttachment {
  id: string;
  filename: string;
  contentType: string;
}

export interface StoredAttachment {
  documentId: string;
  filename: string;
  contentType: string;
  body: Buffer;
  blobKey: string;
}

async function binaryResponseToBuffer(response: unknown): Promise<Buffer> {
  const binary = response as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    bytes?: () => Promise<Uint8Array>;
  };

  if (binary.arrayBuffer) {
    return Buffer.from(await binary.arrayBuffer());
  }

  if (binary.bytes) {
    return Buffer.from(await binary.bytes());
  }

  throw new Error("Attachment response did not include binary content.");
}

export function isPdfAttachment(attachment: IncomingAttachment) {
  return (
    attachment.contentType === "application/pdf" ||
    attachment.filename.toLowerCase().endsWith(".pdf")
  );
}

export async function storeIncomingAttachment(input: {
  teamId: string;
  transactionId: string;
  inboxId: string;
  messageId: string;
  attachment: IncomingAttachment;
}): Promise<StoredAttachment> {
  const remoteAttachment = await getTcAttachment({
    inboxId: input.inboxId,
    messageId: input.messageId,
    attachmentId: input.attachment.id
  });
  const body = await binaryResponseToBuffer(remoteAttachment);
  const stored = await storePrivateDocument({
    teamId: input.teamId,
    transactionId: input.transactionId,
    filename: input.attachment.filename,
    contentType: input.attachment.contentType,
    body
  });
  const document = await createDocumentRecord({
    transactionId: input.transactionId,
    type: isPdfAttachment(input.attachment) ? "contract" : "attachment",
    name: input.attachment.filename,
    status: "under_review",
    blobKey: stored.key,
    sourceMessageId: input.messageId
  });

  return {
    documentId: document.id,
    filename: input.attachment.filename,
    contentType: input.attachment.contentType,
    body,
    blobKey: stored.key
  };
}

export async function markStoredAttachmentProcessed(
  attachment: StoredAttachment,
  status: "approved" | "needs_correction" | "rejected"
) {
  await updateDocumentStatus({
    id: attachment.documentId,
    status
  });
}
