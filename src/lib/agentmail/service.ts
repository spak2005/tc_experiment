import { getEnv } from "@/lib/config/env";
import { getAgentMailClient } from "@/lib/agentmail/client";

export interface ProvisionTcInboxInput {
  teamId: string;
  agentName: string;
  displayName: string;
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

export interface CreateTcDraftInput extends SendTcEmailInput {
  transactionId?: string;
}

function toInboxUsername(agentName: string, teamId: string): string {
  const base = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  return `${base || "tc"}-${teamId.slice(0, 8)}`;
}

export async function provisionTcInbox(
  input: ProvisionTcInboxInput
): Promise<ProvisionedTcInbox> {
  const env = getEnv();
  const username = toInboxUsername(input.agentName, input.teamId);
  const client = getAgentMailClient();

  const inbox = await client.inboxes.create({
    username,
    domain: env.AGENTMAIL_DOMAIN,
    displayName: input.displayName,
    clientId: `tc-profile-${input.teamId}`
  });
  const looseInbox = inbox as unknown as Record<string, string | undefined>;

  const inboxId =
    looseInbox.inboxId ??
    looseInbox.inbox_id ??
    `${username}@${env.AGENTMAIL_DOMAIN}`;

  return {
    inboxId,
    emailAddress: looseInbox.emailAddress ?? looseInbox.email_address ?? inboxId,
    displayName: input.displayName
  };
}

export async function sendTcEmail(input: SendTcEmailInput) {
  const client = getAgentMailClient();

  return client.inboxes.messages.send(input.inboxId, {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    labels: input.labels
  });
}

export async function replyTcEmail(input: ReplyTcEmailInput) {
  const client = getAgentMailClient();

  return client.inboxes.messages.reply(input.inboxId, input.messageId, {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    text: input.text,
    html: input.html,
    labels: input.labels
  });
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
