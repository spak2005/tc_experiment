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

interface AttachmentDownloadMetadata {
  attachment_id?: string;
  attachmentId?: string;
  size?: number;
  download_url?: string;
  downloadUrl?: string;
  expires_at?: string;
  expiresAt?: string;
  filename?: string;
  content_type?: string;
  contentType?: string;
}

const pdfHeader = Buffer.from("%PDF-");
const maxPdfHeaderScanBytes = 1024;

function findPdfHeaderOffset(body: Buffer) {
  return body.subarray(0, maxPdfHeaderScanBytes).indexOf(pdfHeader);
}

function attachmentBodyDiagnostics(body: Buffer) {
  const pdfHeaderOffset = findPdfHeaderOffset(body);

  return {
    byteLength: body.byteLength,
    firstBytesHex: body.subarray(0, 16).toString("hex"),
    firstBytesText: body
      .subarray(0, 32)
      .toString("utf8")
      .replace(/[^\x20-\x7e]/g, "."),
    pdfHeaderOffset: pdfHeaderOffset >= 0 ? pdfHeaderOffset : null,
    startsWithPdfHeader: pdfHeaderOffset === 0
  };
}

function normalizePdfBody(body: Buffer) {
  const pdfHeaderOffset = findPdfHeaderOffset(body);

  if (pdfHeaderOffset > 0) {
    return body.subarray(pdfHeaderOffset);
  }

  return body;
}

async function binaryResponseToBuffer(response: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(response)) {
    return response;
  }

  if (response instanceof Uint8Array) {
    return Buffer.from(response.buffer, response.byteOffset, response.byteLength);
  }

  if (response instanceof ArrayBuffer) {
    return Buffer.from(response);
  }

  const binary = response as {
    data?: unknown;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    bytes?: () => Promise<Uint8Array>;
  };

  if (binary.data) {
    return binaryResponseToBuffer(binary.data);
  }

  if (binary.arrayBuffer) {
    return Buffer.from(await binary.arrayBuffer());
  }

  if (binary.bytes) {
    return Buffer.from(await binary.bytes());
  }

  throw new Error("Attachment response did not include binary content.");
}

function parseAttachmentDownloadMetadata(body: Buffer): AttachmentDownloadMetadata | undefined {
  const text = body.toString("utf8").trim();

  if (!text.startsWith("{")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const metadata = parsed as AttachmentDownloadMetadata;
    const downloadUrl = metadata.download_url ?? metadata.downloadUrl;
    return typeof downloadUrl === "string" && downloadUrl.length > 0 ? metadata : undefined;
  } catch {
    return undefined;
  }
}

async function downloadAttachmentFromUrl(metadata: AttachmentDownloadMetadata) {
  const downloadUrl = metadata.download_url ?? metadata.downloadUrl;
  if (!downloadUrl) {
    throw new Error("Attachment metadata did not include a download URL.");
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Attachment download URL returned HTTP ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
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
  const responseBody = await binaryResponseToBuffer(remoteAttachment);
  const downloadMetadata = parseAttachmentDownloadMetadata(responseBody);
  const rawBody = downloadMetadata
    ? await downloadAttachmentFromUrl(downloadMetadata)
    : responseBody;
  const body = isPdfAttachment(input.attachment) ? normalizePdfBody(rawBody) : rawBody;

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
      contentType: input.attachment.contentType,
      download: downloadMetadata
        ? {
            source: "download_url",
            attachmentId: downloadMetadata.attachment_id ?? downloadMetadata.attachmentId,
            filename: downloadMetadata.filename,
            contentType: downloadMetadata.content_type ?? downloadMetadata.contentType,
            size: downloadMetadata.size,
            expiresAt: downloadMetadata.expires_at ?? downloadMetadata.expiresAt,
            hasDownloadUrl: true
          }
        : {
            source: "direct_response",
            hasDownloadUrl: false
          },
      body: attachmentBodyDiagnostics(body),
      rawBody:
        body === rawBody
          ? undefined
          : {
              ...attachmentBodyDiagnostics(rawBody),
              normalizedLeadingBytes: rawBody.byteLength - body.byteLength
            }
    }
  });

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
