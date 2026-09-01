/**
 * IMAP access layer for Titan email.
 *
 * Holds one lazily-created ImapFlow connection and serializes every operation
 * through a promise chain, because a single IMAP connection can only have one
 * mailbox selected at a time. A connection that has dropped is transparently
 * rebuilt on the next call.
 */

import { ImapFlow, type ListResponse, type FetchMessageObject } from "imapflow";
import type { TitanConfig } from "../config.js";
import type { AddressSummary, MailboxSummary, MessageSummary } from "../types.js";

export class ImapError extends Error {}

type Task<T> = () => Promise<T>;

export class TitanImap {
  private client: ImapFlow | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: TitanConfig) {}

  /** Run `task` with an exclusive, connected client. Calls are serialized. */
  private run<T>(task: (client: ImapFlow) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const client = await this.connect();
      try {
        return await task(client);
      } catch (error) {
        // A broken pipe / logged-out socket must not poison later calls.
        if (!this.client?.usable) this.client = null;
        throw normalizeImapError(error);
      }
    });
    // Keep the chain alive even when a task rejects.
    this.queue = next.catch(() => undefined);
    return next as Promise<T>;
  }

  /** Run `task` with `mailbox` selected and locked. */
  private runInMailbox<T>(
    mailbox: string,
    task: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    return this.run(async (client) => {
      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch (error) {
        throw new ImapError(
          `Could not open mailbox "${mailbox}": ${describe(error)}. ` +
            "Call titan_list_mailboxes to see the exact folder paths available.",
        );
      }
      try {
        return await task(client);
      } finally {
        lock.release();
      }
    });
  }

  private async connect(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;

    const client = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: true,
      auth: { user: this.config.email, pass: this.config.password },
      logger: false,
      // Never write protocol chatter to stdout: it would corrupt the MCP stream.
      emitLogs: false,
      // Fail fast: an MCP client gives up long before a default socket timeout.
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    });
    client.on("error", () => {
      /* surfaced through the awaited call instead */
    });

    try {
      await client.connect();
    } catch (error) {
      this.client = null;
      throw normalizeImapError(error);
    }
    this.client = client;
    return client;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client?.usable) {
      await client.logout().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- mailboxes

  async listMailboxes(): Promise<MailboxSummary[]> {
    const boxes = await this.run((client) => client.list());
    return boxes.map(toMailboxSummary);
  }

  /** Resolve a special-use folder (e.g. "\\Sent") to its real path. */
  async findSpecialMailbox(specialUse: string): Promise<string | null> {
    const boxes = await this.run((client) => client.list());
    const match = boxes.find((box) => box.specialUse === specialUse);
    return match?.path ?? null;
  }

  async status(mailbox: string) {
    return this.run(async (client) => {
      try {
        return await client.status(mailbox, {
          messages: true,
          unseen: true,
          recent: true,
          uidNext: true,
          uidValidity: true,
        });
      } catch (error) {
        throw new ImapError(
          `Could not read status of mailbox "${mailbox}": ${describe(error)}. ` +
            "Call titan_list_mailboxes to see the exact folder paths available.",
        );
      }
    });
  }

  // ----------------------------------------------------------------- messages

  /** UIDs matching `criteria`, newest UID first. */
  async searchUids(mailbox: string, criteria: Record<string, unknown>): Promise<number[]> {
    return this.runInMailbox(mailbox, async (client) => {
      const uids = await client.search(criteria as never, { uid: true });
      if (!uids) return [];
      return [...uids].sort((a, b) => b - a);
    });
  }

  /** Envelope-level summaries for a specific set of UIDs, newest UID first. */
  async fetchSummaries(mailbox: string, uids: number[]): Promise<MessageSummary[]> {
    if (uids.length === 0) return [];
    return this.runInMailbox(mailbox, async (client) => {
      const messages = await client.fetchAll(
        uids.join(","),
        { uid: true, envelope: true, flags: true, size: true, bodyStructure: true },
        { uid: true },
      );
      return messages
        .map((message) => toMessageSummary(message, mailbox))
        .sort((a, b) => b.uid - a.uid);
    });
  }

  /** Raw RFC822 source of one message, for parsing. */
  async fetchSource(mailbox: string, uid: number): Promise<{ source: Buffer; summary: MessageSummary }> {
    return this.runInMailbox(mailbox, async (client) => {
      const message = await client.fetchOne(
        String(uid),
        { uid: true, source: true, envelope: true, flags: true, size: true, bodyStructure: true },
        { uid: true },
      );
      if (!message || !message.source) {
        throw new ImapError(
          `No message with UID ${uid} in mailbox "${mailbox}". UIDs are per-mailbox — ` +
            "re-run titan_search_messages or titan_list_messages against this mailbox to get a current UID.",
        );
      }
      return { source: message.source, summary: toMessageSummary(message, mailbox) };
    });
  }

  async addFlags(mailbox: string, uids: number[], flags: string[]): Promise<boolean> {
    return this.runInMailbox(mailbox, (client) =>
      client.messageFlagsAdd(uids.join(","), flags, { uid: true }),
    );
  }

  async removeFlags(mailbox: string, uids: number[], flags: string[]): Promise<boolean> {
    return this.runInMailbox(mailbox, (client) =>
      client.messageFlagsRemove(uids.join(","), flags, { uid: true }),
    );
  }

  async moveMessages(mailbox: string, uids: number[], destination: string) {
    return this.runInMailbox(mailbox, async (client) => {
      try {
        return await client.messageMove(uids.join(","), destination, { uid: true });
      } catch (error) {
        throw new ImapError(
          `Could not move messages to "${destination}": ${describe(error)}. ` +
            "Call titan_list_mailboxes to confirm the destination folder path exists.",
        );
      }
    });
  }

  async expungeMessages(mailbox: string, uids: number[]): Promise<boolean> {
    return this.runInMailbox(mailbox, (client) =>
      client.messageDelete(uids.join(","), { uid: true }),
    );
  }

  async append(mailbox: string, raw: Buffer, flags: string[]): Promise<void> {
    await this.run(async (client) => {
      try {
        await client.append(mailbox, raw, flags);
      } catch (error) {
        throw new ImapError(
          `Could not append the message to "${mailbox}": ${describe(error)}. ` +
            "Call titan_list_mailboxes to confirm the folder path exists.",
        );
      }
    });
  }
}

// ------------------------------------------------------------------ mapping

function toMailboxSummary(box: ListResponse): MailboxSummary {
  const flags = box.flags ?? new Set<string>();
  return {
    path: box.path,
    name: box.name,
    special_use: box.specialUse ?? null,
    subscribed: box.subscribed ?? false,
    has_children: flags.has("\\HasChildren"),
    selectable: !flags.has("\\Noselect"),
  };
}

function toAddresses(list: unknown): AddressSummary[] {
  if (!Array.isArray(list)) return [];
  return list.map((entry: { name?: string; address?: string }) => ({
    name: entry.name || null,
    address: entry.address || null,
  }));
}

/** True when any MIME part is dispositioned as an attachment. */
function structureHasAttachment(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const part = node as { disposition?: string; childNodes?: unknown[] };
  if (part.disposition && part.disposition.toLowerCase() === "attachment") return true;
  return (part.childNodes ?? []).some(structureHasAttachment);
}

export function toMessageSummary(message: FetchMessageObject, mailbox: string): MessageSummary {
  const envelope = message.envelope ?? ({} as NonNullable<FetchMessageObject["envelope"]>);
  const flags = [...(message.flags ?? new Set<string>())];
  return {
    uid: message.uid,
    mailbox,
    message_id: envelope.messageId ?? null,
    date: envelope.date ? new Date(envelope.date).toISOString() : null,
    subject: envelope.subject ?? null,
    from: toAddresses(envelope.from),
    to: toAddresses(envelope.to),
    cc: toAddresses(envelope.cc),
    flags,
    seen: flags.includes("\\Seen"),
    flagged: flags.includes("\\Flagged"),
    answered: flags.includes("\\Answered"),
    draft: flags.includes("\\Draft"),
    size_bytes: message.size ?? null,
    has_attachments: structureHasAttachment(message.bodyStructure),
  };
}

// ------------------------------------------------------------------- errors

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turn low-level IMAP/socket failures into messages an agent can act on. */
export function normalizeImapError(error: unknown): Error {
  if (error instanceof ImapError) return error;
  const detail = error as
    | { code?: string; authenticationFailed?: boolean; responseText?: string; response?: string }
    | null;
  // ImapFlow reports a bare "Command failed"; the useful text is on responseText.
  const message = [describe(error), detail?.responseText, detail?.response]
    .filter(Boolean)
    .join(" — ");
  const code = detail?.code;

  if (detail?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(message)) {
    return new ImapError(
      "IMAP authentication failed. Check TITAN_EMAIL and TITAN_PASSWORD. If the " +
        "mailbox has 2FA enabled, a normal password will not work — generate an " +
        "app-specific password in Titan webmail under Settings -> Security.",
    );
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new ImapError(
      `Could not resolve the IMAP host. Check TITAN_IMAP_HOST (default imap.titan.email). Underlying error: ${message}`,
    );
  }
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return new ImapError(
      `Could not reach the IMAP server on ${code}. Check network access to port 993 and retry. Underlying error: ${message}`,
    );
  }
  return new ImapError(`IMAP error: ${message}`);
}
