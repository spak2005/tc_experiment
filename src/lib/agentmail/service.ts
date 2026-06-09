import { getEnv } from "@/lib/config/env";
import { getAgentMailClient } from "@/lib/agentmail/client";
import {
  beginOutboundEmailAction,
  markOutboundEmailFailed,
  markOutboundEmailSent,
  type OutboundEmailActionRow
} from "@/lib/db/repositories";

export interface ProvisionTcInboxInput {
  userId: string;
}

export interface ProvisionedTcInbox {
  inboxId: string;
  emailAddress: string;
  displayName: string;
}

export interface SendTcEmailInput {
  inboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  labels?: string[];
}

export interface SendTcEmailOnceInput extends SendTcEmailInput {
  idempotencyKey: string;
}

export interface ReplyTcEmailInput {
  inboxId: string;
  messageId: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  text: string;
  html?: string;
  labels?: string[];
}

export interface ReplyTcEmailOnceInput extends ReplyTcEmailInput {
  idempotencyKey: string;
}

export interface CreateTcDraftInput extends SendTcEmailInput {
  transactionId?: string;
}

export interface AgentMailMessageMetadata {
  messageId?: string;
  threadId?: string;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function extractAgentMailMessageMetadata(value: unknown): AgentMailMessageMetadata {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : record;

  return {
    messageId:
      asString(message.id) ??
      asString(message.messageId) ??
      asString(message.message_id) ??
      asString(record.messageId) ??
      asString(record.message_id),
    threadId:
      asString(message.threadId) ??
      asString(message.thread_id) ??
      asString(record.threadId) ??
      asString(record.thread_id)
  };
}

function messageMetadataFromAction(action: OutboundEmailActionRow) {
  return {
    messageId: action.provider_message_id ?? undefined,
    threadId: action.provider_thread_id ?? undefined
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AgentMail send failure.";
}

function parseEmailList(value?: string) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isStagingSafetyEnabled() {
  return process.env.STEPH_ENV === "staging" && Boolean(process.env.IMPROVEMENT_EMAIL_SINK);
}

function applyStagingEmailSafety<T extends SendTcEmailInput | ReplyTcEmailInput>(
  input: T
): T {
  if (!isStagingSafetyEnabled()) return input;

  const sink = process.env.IMPROVEMENT_EMAIL_SINK!;
  const allowlist = parseEmailList(process.env.IMPROVEMENT_EMAIL_ALLOWLIST);
  allowlist.add(sink.toLowerCase());
  const original = {
    to: "to" in input ? input.to ?? [] : [],
    cc: input.cc ?? [],
    bcc: input.bcc ?? []
  };
  const allRecipients = [...original.to, ...original.cc, ...original.bcc];
  const hasUnsafeRecipient = allRecipients.some(
    (address) => !allowlist.has(address.toLowerCase())
  );

  if (!hasUnsafeRecipient) return input;

  const safetyHeader = [
    "[Staging safety rewrite]",
    `Original to: ${original.to.join(", ") || "(none)"}`,
    `Original cc: ${original.cc.join(", ") || "(none)"}`,
    `Original bcc: ${original.bcc.join(", ") || "(none)"}`,
    ""
  ].join("\n");

  return {
    ...input,
    to: [sink],
    cc: [],
    bcc: [],
    text: `${safetyHeader}${input.text}`,
    labels: [...(input.labels ?? []), "staging-safety-rewrite"]
  };
}

export const STEPHANIE_TC_DISPLAY_NAME = "Stephanie";

function toInboxUsername(userId: string): string {
  return `stephanie-${userId.slice(0, 8)}`;
}

export async function provisionTcInbox(
  input: ProvisionTcInboxInput
): Promise<ProvisionedTcInbox> {
  const env = getEnv();
  const username = toInboxUsername(input.userId);
  const client = getAgentMailClient();

  const inbox = await client.inboxes.create({
    username,
    domain: env.AGENTMAIL_DOMAIN,
    displayName: STEPHANIE_TC_DISPLAY_NAME,
    clientId: `tc-profile-${input.userId}`
  });
  const looseInbox = inbox as unknown as Record<string, string | undefined>;

  const inboxId =
    looseInbox.inboxId ??
    looseInbox.inbox_id ??
    `${username}@${env.AGENTMAIL_DOMAIN}`;

  return {
    inboxId,
    emailAddress: looseInbox.emailAddress ?? looseInbox.email_address ?? inboxId,
    displayName: STEPHANIE_TC_DISPLAY_NAME
  };
}

export async function sendTcEmail(input: SendTcEmailInput) {
  const client = getAgentMailClient();
  const safeInput = applyStagingEmailSafety(input);

  return client.inboxes.messages.send(safeInput.inboxId, {
    to: safeInput.to,
    cc: safeInput.cc,
    bcc: safeInput.bcc,
    subject: safeInput.subject,
    text: safeInput.text,
    html: safeInput.html,
    labels: safeInput.labels
  });
}

export async function sendTcEmailOnce(input: SendTcEmailOnceInput) {
  const { idempotencyKey, ...sendInput } = input;
  const safeInput = applyStagingEmailSafety(sendInput);
  const { action, acquired } = await beginOutboundEmailAction({
    idempotencyKey,
    sendKind: "send",
    inboxId: safeInput.inboxId,
    to: safeInput.to,
    cc: safeInput.cc,
    bcc: safeInput.bcc,
    subject: safeInput.subject,
    text: safeInput.text,
    html: safeInput.html,
    labels: safeInput.labels
  });

  if (!action) {
    throw new Error(`Outbound email action ${idempotencyKey} could not be loaded.`);
  }

  if (!acquired) {
    if (action.status === "sent") {
      return messageMetadataFromAction(action);
    }

    throw new Error(`Outbound email action ${idempotencyKey} is already ${action.status}.`);
  }

  let sent: unknown;
  try {
    sent = await sendTcEmail(safeInput);
  } catch (error) {
    await markOutboundEmailFailed({ idempotencyKey, error: errorMessage(error) });
    throw error;
  }

  const metadata = extractAgentMailMessageMetadata(sent);
  await markOutboundEmailSent({
    idempotencyKey,
    providerMessageId: metadata.messageId,
    providerThreadId: metadata.threadId
  });

  return sent;
}

export async function replyTcEmail(input: ReplyTcEmailInput) {
  const client = getAgentMailClient();
  const safeInput = applyStagingEmailSafety(input);

  return client.inboxes.messages.reply(safeInput.inboxId, safeInput.messageId, {
    to: safeInput.to,
    cc: safeInput.cc,
    bcc: safeInput.bcc,
    text: safeInput.text,
    html: safeInput.html,
    labels: safeInput.labels
  });
}

export async function replyTcEmailOnce(input: ReplyTcEmailOnceInput) {
  const { idempotencyKey, ...replyInput } = input;
  const safeInput = applyStagingEmailSafety(replyInput);
  const { action, acquired } = await beginOutboundEmailAction({
    idempotencyKey,
    sendKind: "reply",
    inboxId: safeInput.inboxId,
    messageId: safeInput.messageId,
    to: safeInput.to ?? [],
    cc: safeInput.cc,
    bcc: safeInput.bcc,
    subject: undefined,
    text: safeInput.text,
    html: safeInput.html,
    labels: safeInput.labels
  });

  if (!action) {
    throw new Error(`Outbound email action ${idempotencyKey} could not be loaded.`);
  }

  if (!acquired) {
    if (action.status === "sent") {
      return messageMetadataFromAction(action);
    }

    throw new Error(`Outbound email action ${idempotencyKey} is already ${action.status}.`);
  }

  let sent: unknown;
  try {
    sent = await replyTcEmail(safeInput);
  } catch (error) {
    await markOutboundEmailFailed({ idempotencyKey, error: errorMessage(error) });
    throw error;
  }

  const metadata = extractAgentMailMessageMetadata(sent);
  await markOutboundEmailSent({
    idempotencyKey,
    providerMessageId: metadata.messageId,
    providerThreadId: metadata.threadId
  });

  return sent;
}

export async function createTcDraft(input: CreateTcDraftInput) {
  const client = getAgentMailClient();

  return client.inboxes.drafts.create(input.inboxId, {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    labels: input.labels
  });
}

export async function getTcMessage(input: { inboxId: string; messageId: string }) {
  const client = getAgentMailClient();

  return client.inboxes.messages.get(input.inboxId, input.messageId);
}

export async function getTcAttachment(input: {
  inboxId: string;
  messageId: string;
  attachmentId: string;
}) {
  const client = getAgentMailClient();

  return client.inboxes.messages.getAttachment(
    input.inboxId,
    input.messageId,
    input.attachmentId
  );
}
