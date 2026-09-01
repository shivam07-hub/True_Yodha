/** Folder-level tools: enumerate mailboxes, read counts, verify connectivity. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { requiredMailboxField, responseFormatField } from "../schemas/index.js";
import { toolError, toolResult } from "../services/format.js";
import { ResponseFormat } from "../types.js";

export function registerMailboxTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "titan_list_mailboxes",
    {
      title: "List Titan Mailboxes",
      description: `List every IMAP folder in the connected Titan mailbox.

Call this first whenever a folder path is needed: every other tool takes a
case-sensitive folder path, and Titan account layouts differ (some use "Sent",
others "INBOX/Sent"). The 'special_use' field identifies the account's real
Sent / Drafts / Trash / Junk / Archive folders.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "count": number,
    "mailboxes": [
      {
        "path": string,            // Use this value as the 'mailbox' argument elsewhere
        "name": string,            // Leaf display name
        "special_use": string|null,// e.g. "\\\\Sent", "\\\\Drafts", "\\\\Trash", "\\\\Junk"
        "subscribed": boolean,
        "has_children": boolean,
        "selectable": boolean      // false means the folder cannot hold messages
      }
    ]
  }

Examples:
  - Use when: "Where are my sent emails?" -> read the entry whose special_use is "\\\\Sent"
  - Use when: A mailbox path was rejected as not found, to get the exact spelling
  - Don't use when: You need message counts (use titan_mailbox_status instead)`,
      inputSchema: { response_format: responseFormatField },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ response_format }) => {
      try {
        const mailboxes = await ctx.imap.listMailboxes();
        const output = { count: mailboxes.length, mailboxes };

        if (response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(output, null, 2), output);
        }
        const lines = [`# Mailboxes (${mailboxes.length})`, ""];
        for (const box of mailboxes) {
          const tags = [
            box.special_use ? `special_use: ${box.special_use}` : null,
            box.selectable ? null : "not selectable",
            box.has_children ? "has children" : null,
          ].filter(Boolean);
          lines.push(`- \`${box.path}\`${tags.length ? ` — ${tags.join(", ")}` : ""}`);
        }
        return toolResult(lines.join("\n"), output);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "titan_mailbox_status",
    {
      title: "Get Titan Mailbox Status",
      description: `Get message counts for one Titan folder: total, unread, and recent.

Cheap way to answer "do I have new mail?" without listing messages.

Args:
  - mailbox (string): Folder path, e.g. "INBOX" (required)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "mailbox": string,
    "total": number,        // Messages in the folder
    "unseen": number,       // Messages without the \\\\Seen flag
    "recent": number,       // Messages flagged \\\\Recent by the server
    "uid_next": number|null,
    "uid_validity": string|null
  }

Examples:
  - Use when: "How many unread emails do I have?" -> mailbox="INBOX"
  - Use when: Checking whether a folder is worth listing before paging through it
  - Don't use when: You need the actual messages (use titan_list_messages)

Error Handling:
  - Returns an error naming the folder if the path does not exist; call
    titan_list_mailboxes for exact paths.`,
      inputSchema: { mailbox: requiredMailboxField, response_format: responseFormatField },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ mailbox, response_format }) => {
      try {
        const status = await ctx.imap.status(mailbox);
        const output = {
          mailbox,
          total: status.messages ?? 0,
          unseen: status.unseen ?? 0,
          recent: status.recent ?? 0,
          uid_next: status.uidNext ?? null,
          uid_validity: status.uidValidity != null ? String(status.uidValidity) : null,
        };
        if (response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(output, null, 2), output);
        }
        return toolResult(
          [
            `# ${mailbox}`,
            "",
            `- **Total**: ${output.total}`,
            `- **Unread**: ${output.unseen}`,
            `- **Recent**: ${output.recent}`,
          ].join("\n"),
          output,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "titan_check_connection",
    {
      title: "Check Titan Connection",
      description: `Verify that the configured Titan credentials work for IMAP and SMTP.

Diagnostic tool. Sends no mail and changes nothing. Run it first when another
tool fails with an authentication or connectivity error.

Args:
  - check_smtp (boolean): Also verify the outbound SMTP login (default: true)

Returns:
  {
    "account": string,          // The mailbox address in use
    "imap": { "host": string, "port": number, "ok": boolean, "error": string|null },
    "smtp": { "host": string, "port": number, "ok": boolean|null, "error": string|null },
    "sending_enabled": boolean, // false unless TITAN_ALLOW_SEND=true
    "mailbox_count": number|null
  }

Examples:
  - Use when: "Is my email connection working?"
  - Use when: A previous tool returned an authentication error and you want to isolate
    whether IMAP, SMTP, or both are affected
  - Don't use when: You simply need folder names (use titan_list_mailboxes)`,
      inputSchema: {
        check_smtp: z
          .boolean()
          .default(true)
          .describe("Also verify the SMTP login. Set false to test IMAP only."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ check_smtp }) => {
      const output: Record<string, unknown> = {
        account: ctx.config.email,
        sending_enabled: ctx.config.allowSend,
      };
      let imapOk = false;
      let mailboxCount: number | null = null;
      let imapError: string | null = null;
      try {
        mailboxCount = (await ctx.imap.listMailboxes()).length;
        imapOk = true;
      } catch (error) {
        imapError = error instanceof Error ? error.message : String(error);
      }
      output.imap = {
        host: ctx.config.imapHost,
        port: ctx.config.imapPort,
        ok: imapOk,
        error: imapError,
      };
      output.mailbox_count = mailboxCount;

      let smtpOk: boolean | null = null;
      let smtpError: string | null = null;
      if (check_smtp) {
        try {
          await ctx.smtp.verify();
          smtpOk = true;
        } catch (error) {
          smtpOk = false;
          smtpError = error instanceof Error ? error.message : String(error);
        }
      }
      output.smtp = {
        host: ctx.config.smtpHost,
        port: ctx.config.smtpPort,
        ok: smtpOk,
        error: smtpError,
      };

      const lines = [
        `# Titan connection: ${ctx.config.email}`,
        "",
        `- **IMAP** ${ctx.config.imapHost}:${ctx.config.imapPort} — ${imapOk ? `OK (${mailboxCount} folders)` : `FAILED: ${imapError}`}`,
        `- **SMTP** ${ctx.config.smtpHost}:${ctx.config.smtpPort} — ${
          smtpOk === null ? "not checked" : smtpOk ? "OK" : `FAILED: ${smtpError}`
        }`,
        `- **Sending enabled**: ${ctx.config.allowSend ? "yes" : "no (set TITAN_ALLOW_SEND=true to enable titan_send_email)"}`,
      ];
      return toolResult(lines.join("\n"), output);
    },
  );
}
