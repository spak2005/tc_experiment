import type {
  FetchedAttachment,
  IncomingAttachment
} from "@/lib/documents/attachments";
import { fetchIncomingAttachment } from "@/lib/documents/attachments";
import {
  createAgentActivityEvent,
  createIntakeArtifactAttachment
} from "@/lib/db/repositories";
import { storePrivateDocument } from "@/lib/storage/blob";

export interface StoredIntakeArtifactAttachment {
  intakeArtifactAttachmentId: string;
  sourceAttachmentKey: string;
  filename: string;
  contentType: string;
  body: Buffer;
  blobKey: string;
}

export function intakeAttachmentKey(input: {
  inboxId: string;
  messageId: string;
  attachmentId: string;
}) {
  return [input.inboxId, input.messageId, input.attachmentId].join(":");
}

export async function storeIntakeArtifactAttachment(input: {
  userId: string;
  intakeArtifactId: string;
  inboxId: string;
  messageId: string;
  attachment: IncomingAttachment;
  fetched?: FetchedAttachment;
}): Promise<StoredIntakeArtifactAttachment> {
  const sourceAttachmentKey = intakeAttachmentKey({
    inboxId: input.inboxId,
    messageId: input.messageId,
    attachmentId: input.attachment.id
  });
  const fetched =
    input.fetched ??
    (await fetchIncomingAttachment({
      userId: input.userId,
      inboxId: input.inboxId,
      messageId: input.messageId,
      attachment: input.attachment
    }));
  const stored = await storePrivateDocument({
    userId: input.userId,
    filename: fetched.filename,
    contentType: fetched.contentType,
    body: fetched.body
  });
  const artifactAttachment = await createIntakeArtifactAttachment({
    intakeArtifactId: input.intakeArtifactId,
    attachmentKey: sourceAttachmentKey,
    filename: fetched.filename,
    contentType: fetched.contentType,
    blobKey: stored.key,
    metadata: {
      source: "agentmail",
      inboxId: input.inboxId,
      messageId: input.messageId,
      attachmentId: input.attachment.id,
      byteLength: fetched.body.byteLength
    }
  });

  await createAgentActivityEvent({
    userId: input.userId,
    sourceType: "storage",
    eventType: "intake_artifact_attachment_stored",
    title: "Stored intake artifact attachment",
    summary: `Stored ${fetched.filename} before transaction activation.`,
    status: "completed",
    metadata: {
      intakeArtifactId: input.intakeArtifactId,
      intakeArtifactAttachmentId: artifactAttachment.id,
      filename: fetched.filename,
      contentType: fetched.contentType,
      blobKey: stored.key,
      sourceAttachmentKey,
      reused: !artifactAttachment.inserted
    }
  });

  return {
    intakeArtifactAttachmentId: artifactAttachment.id,
    sourceAttachmentKey,
    filename: fetched.filename,
    contentType: fetched.contentType,
    body: fetched.body,
    blobKey: stored.key
  };
}
