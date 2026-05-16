import { getTcAttachment } from "@/lib/agentmail/service";
import {
  createAgentActivityEvent,
  createDocumentRecordOnce,
  findDocumentBySourceAttachmentKey,
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

export interface FetchedAttachment {
  filename: string;
  contentType: string;
  body: Buffer;
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

export function isPdfAttachment(attachment: Pick<IncomingAttachment, "contentType" | "filename">) {
  return (
    attachment.contentType === "application/pdf" ||
    attachment.filename.toLowerCase().endsWith(".pdf")
  );
}

export async function fetchIncomingAttachment(input: {
  userId: string;
  transactionId?: string;
  inboxId: string;
  messageId: string;
  attachment: IncomingAttachment;
}): Promise<FetchedAttachment> {
  const remoteAttachment = await getTcAttachment({
    inboxId: input.inboxId,
    messageId: input.messageId,
    attachmentId: input.attachment.id
  });
  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    sourceType: "document",
    eventType: "attachment_fetched",
    title: "Fetched attachment",
    summary: `Fetched ${input.attachment.filename} from AgentMail.`,
    status: "completed",
    metadata: {
      inboxId: input.inboxId,
      messageId: input.messageId,
      attachmentId: input.attachment.id,
      filename: input.attachment.filename,
      contentType: input.attachment.contentType
    }
  });
  const body = await binaryResponseToBuffer(remoteAttachment);

  return {
    filename: input.attachment.filename,
    contentType: input.attachment.contentType,
    body
  };
}

export async function storeIncomingAttachment(input: {
  userId: string;
  transactionId: string;
  inboxId: string;
  messageId: string;
  attachment: IncomingAttachment;
  fetched?: FetchedAttachment;
}): Promise<StoredAttachment> {
  const sourceAttachmentKey = [
    input.inboxId,
    input.messageId,
    input.attachment.id
  ].join(":");
  const fetched =
    input.fetched ??
    (await fetchIncomingAttachment({
      userId: input.userId,
      transactionId: input.transactionId,
      inboxId: input.inboxId,
      messageId: input.messageId,
      attachment: input.attachment
    }));
  const existing = await findDocumentBySourceAttachmentKey(sourceAttachmentKey);
  if (existing?.blob_key) {
    await createAgentActivityEvent({
      userId: input.userId,
      transactionId: input.transactionId,
      sourceType: "document",
      eventType: "document_record_reused",
      title: "Reused document record",
      summary: `Reused existing document record for ${input.attachment.filename}.`,
      status: "completed",
      metadata: {
        documentId: existing.id,
        filename: input.attachment.filename,
        sourceAttachmentKey,
        blobKey: existing.blob_key
      }
    });

    return {
      documentId: existing.id,
      filename: fetched.filename,
      contentType: fetched.contentType,
      body: fetched.body,
      blobKey: existing.blob_key
    };
  }

  const stored = await storePrivateDocument({
    userId: input.userId,
    transactionId: input.transactionId,
    filename: fetched.filename,
    contentType: fetched.contentType,
    body: fetched.body
  });
  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    sourceType: "storage",
    eventType: "document_stored",
    title: "Stored document privately",
    summary: `Stored ${input.attachment.filename} in private Blob storage.`,
    status: "completed",
    metadata: {
      filename: input.attachment.filename,
      contentType: input.attachment.contentType,
      blobKey: stored.key
    }
  });
  const document = await createDocumentRecordOnce({
    transactionId: input.transactionId,
    type: isPdfAttachment(input.attachment) ? "contract" : "attachment",
    name: input.attachment.filename,
    status: "under_review",
    blobKey: stored.key,
    sourceMessageId: input.messageId,
    sourceAttachmentKey
  });
  await createAgentActivityEvent({
    userId: input.userId,
    transactionId: input.transactionId,
    sourceType: "document",
    eventType: "document_record_created",
    title: "Created document record",
    summary: `Started tracking ${input.attachment.filename} as ${
      isPdfAttachment(input.attachment) ? "contract" : "attachment"
    }.`,
    status: "completed",
    metadata: {
      documentId: document.id,
      filename: input.attachment.filename,
      type: isPdfAttachment(input.attachment) ? "contract" : "attachment",
      status: "under_review",
      blobKey: document.blob_key ?? stored.key,
      sourceAttachmentKey,
      reused: !document.inserted
    }
  });

  return {
    documentId: document.id,
    filename: fetched.filename,
    contentType: fetched.contentType,
    body: fetched.body,
    blobKey: document.blob_key ?? stored.key
  };
}

export async function markStoredAttachmentProcessed(
  attachment: StoredAttachment,
  status: "approved" | "needs_correction" | "rejected",
  context?: {
    userId: string;
    transactionId: string;
  }
) {
  await updateDocumentStatus({
    id: attachment.documentId,
    status
  });

  if (context) {
    await createAgentActivityEvent({
      userId: context.userId,
      transactionId: context.transactionId,
      sourceType: "document",
      eventType: "document_status_updated",
      title: "Updated document status",
      summary: `${attachment.filename} is now ${status}.`,
      status:
        status === "approved"
          ? "completed"
          : status === "rejected"
            ? "blocked"
            : "waiting",
      metadata: {
        documentId: attachment.documentId,
        filename: attachment.filename,
        status
      }
    });
  }
}
