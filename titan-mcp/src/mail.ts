import { ImapFlow, type FetchMessageObject, type MessageAddressObject, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type { TitanConfig } from "./config.js";

const MAX_MESSAGE_BYTES = 512_000;
const MAX_RESULTS = 50;

export interface MessageSummary {
  uid: number;
  date: string | null;
  from: string[];
  to: string[];
  subject: string;
  seen: boolean;
  size: number | null;
}

export interface SearchOptions {
  mailbox: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  since?: string;
  before?: string;
  unreadOnly?: boolean;
  limit: number;
}

function addressList(addresses?: MessageAddressObject[]): string[] {
  return (addresses ?? []).map(({ name, address }) => {
    if (!address) return name ?? "";
    return name ? `${name} <${address}>` : address;
  });
}

function formatMessage(message: FetchMessageObject): MessageSummary {
  const date = message.internalDate ?? message.envelope?.date;
  return {
    uid: message.uid,
    date: date ? new Date(date).toISOString() : null,
    from: addressList(message.envelope?.from),
    to: addressList(message.envelope?.to),
    subject: message.envelope?.subject ?? "",
    seen: message.flags?.has("\\Seen") ?? false,
    size: message.size ?? null,
  };
}

function createClient(config: TitanConfig): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: config.email, pass: config.appPassword },
    clientInfo: { name: "Titan Email MCP", version: "0.1.0" },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
    disableAutoIdle: true,
    logger: false,
  });
}

async function withClient<T>(config: TitanConfig, operation: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = createClient(config);
  try {
    await client.connect();
    return await operation(client);
  } finally {
    if (client.usable) await client.logout();
  }
}

async function withMailbox<T>(
  config: TitanConfig,
  mailbox: string,
  operation: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  return withClient(config, async (client) => {
    const lock = await client.getMailboxLock(mailbox, { readOnly: true, acquireTimeout: 15_000 });
    try {
      return await operation(client);
    } finally {
      lock.release();
    }
  });
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_RESULTS);
}

async function fetchSummaries(client: ImapFlow, uids: number[], limit: number): Promise<MessageSummary[]> {
  const selected = uids.slice(-clampLimit(limit));
  if (selected.length === 0) return [];

  const messages: MessageSummary[] = [];
  for await (const message of client.fetch(selected, { envelope: true, flags: true, internalDate: true, size: true }, { uid: true })) {
    messages.push(formatMessage(message));
  }
  return messages.sort((left, right) => right.uid - left.uid);
}

export async function listMailboxes(config: TitanConfig) {
  return withClient(config, async (client) => {
    const mailboxes = await client.list({ statusQuery: { messages: true, unseen: true } });
    return mailboxes.map((mailbox) => ({
      path: mailbox.path,
      name: mailbox.name,
      specialUse: mailbox.specialUse ?? null,
      messages: mailbox.status?.messages ?? null,
      unseen: mailbox.status?.unseen ?? null,
    }));
  });
}

export async function listMessages(config: TitanConfig, mailbox: string, limit: number): Promise<MessageSummary[]> {
  return withMailbox(config, mailbox, async (client) => {
    const uids = await client.search({ all: true }, { uid: true });
    return fetchSummaries(client, uids || [], limit);
  });
}

export async function searchMessages(config: TitanConfig, options: SearchOptions): Promise<MessageSummary[]> {
  const query: SearchObject = {
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.text ? { text: options.text } : {}),
    ...(options.since ? { since: options.since } : {}),
    ...(options.before ? { before: options.before } : {}),
    ...(options.unreadOnly ? { seen: false } : {}),
  };

  return withMailbox(config, options.mailbox, async (client) => {
    const uids = await client.search(query, { uid: true });
    return fetchSummaries(client, uids || [], options.limit);
  });
}

function attachmentsFromStructure(structure: FetchMessageObject["bodyStructure"]): Array<{ filename: string; contentType: string; size: number | null }> {
  if (!structure) return [];
  const attachment = structure.disposition?.toLowerCase() === "attachment";
  const own = attachment
    ? [{
        filename: structure.dispositionParameters?.filename ?? structure.parameters?.name ?? "unnamed attachment",
        contentType: structure.type,
        size: structure.size ?? null,
      }]
    : [];
  return own.concat(...(structure.childNodes ?? []).flatMap(attachmentsFromStructure));
}

export async function getMessage(config: TitanConfig, mailbox: string, uid: number) {
  return withMailbox(config, mailbox, async (client) => {
    const message = await client.fetchOne(
      uid,
      {
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
        bodyStructure: true,
        source: { maxLength: MAX_MESSAGE_BYTES },
      },
      { uid: true },
    );
    if (!message) throw new Error(`No message with UID ${uid} exists in ${mailbox}.`);

    const parsed = message.source ? await simpleParser(message.source) : undefined;
    return {
      ...formatMessage(message),
      mailbox,
      messageId: message.envelope?.messageId ?? null,
      replyTo: addressList(message.envelope?.replyTo),
      cc: addressList(message.envelope?.cc),
      body: parsed?.text ?? "",
      bodyTruncated: (message.size ?? 0) > MAX_MESSAGE_BYTES,
      attachments: attachmentsFromStructure(message.bodyStructure),
    };
  });
}

export async function sendMessage(
  config: TitanConfig,
  message: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string },
) {
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: true,
    auth: { user: config.email, pass: config.appPassword },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
    tls: { minVersion: "TLSv1.2" },
  });
  try {
    const result = await transport.sendMail({ from: config.email, ...message });
    return { messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
  } finally {
    transport.close();
  }
}
