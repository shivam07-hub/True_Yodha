/** Outbound tools: send a message, or stage one in Drafts. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { emailListField } from "../schemas/index.js";
import { toolError, toolResult } from "../services/format.js";
import { SmtpError, type OutgoingMessage } from "../services/smtp.js";

const bodyField = z
  .string()
  .min(1)
  .max(200_000)
  .describe("Plain-text body of the message.");

const htmlField = z
  .string()
  .max(400_000)
  .optional()
  .describe("Optional HTML body. When set, the plain-text body is sent as the fallback part.");

export function registerSendTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "titan_send_email",
    {
      title: "Send Titan Email",
      description: `Send an email from the connected Titan mailbox via SMTP.

THIS SENDS REAL MAIL AND CANNOT BE UNDONE. Show the user the exact recipients,
subject, and body and get their explicit approval before calling it. Sending is
also disabled at the server level unless TITAN_ALLOW_SEND=true.

The From address is always the configured mailbox; it cannot be overridden. A
copy is appended to the Sent folder on a best-effort basis.

Args:
  - to (string[]): Recipient addresses, at least one (required)
  - subject (string): Subject line (required)
  - body (string): Plain-text body (required)
  - cc (string[]): Carbon-copy addresses (optional)
  - bcc (string[]): Blind-carbon-copy addresses (optional)
  - html (string): HTML body; 'body' is then sent as the plain-text alternative (optional)
  - reply_to (string): Reply-To address (optional)
  - in_reply_to (string): Message-ID being replied to, for threading (optional)
  - references (string[]): Message-ID chain for threading (optional)

Returns:
  {
    "sent": boolean,
    "message_id": string,
    "accepted": string[],       // Recipients the server accepted
    "rejected": string[],       // Recipients the server rejected
    "saved_to_sent": boolean,   // Whether the Sent-folder copy succeeded
    "sent_mailbox": string|null
  }

Examples:
  - Use when: The user has reviewed a draft and says to send it
  - Use when: Replying in-thread -> pass in_reply_to and references from titan_get_message
  - Don't use when: The user has not approved the exact text (use titan_save_draft instead)

Error Handling:
  - Returns an error if TITAN_ALLOW_SEND is not "true", naming the env var to set.
  - Returns an error naming the rejected address if the server refuses a recipient.`,
      inputSchema: {
        to: emailListField.min(1).describe("Recipient email addresses (at least one)."),
        subject: z.string().min(1).max(500).describe("Subject line."),
        body: bodyField,
        cc: emailListField.optional().describe("Carbon-copy recipients."),
        bcc: emailListField.optional().describe("Blind-carbon-copy recipients."),
        html: htmlField,
        reply_to: z.email().optional().describe("Reply-To address."),
        in_reply_to: z
          .string()
          .optional()
          .describe("Message-ID of the message being replied to, for threading."),
        references: z
          .array(z.string())
          .optional()
          .describe("Message-ID chain for threading."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (!ctx.config.allowSend) {
          throw new SmtpError(
            "Sending is disabled on this MCP server. Set TITAN_ALLOW_SEND=true in the " +
              "server environment and restart it to allow outbound mail. Until then, use " +
              "titan_save_draft to stage the message in the Drafts folder.",
          );
        }

        const message: OutgoingMessage = {
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          text: params.body,
          html: params.html,
          replyTo: params.reply_to,
          inReplyTo: params.in_reply_to,
          references: params.references,
        };

        const info = await ctx.smtp.send(message);

        let savedToSent = false;
        let sentMailbox: string | null = null;
        try {
          sentMailbox = await ctx.imap.findSpecialMailbox("\\Sent");
          if (sentMailbox) {
            const raw = await ctx.smtp.compose(message);
            await ctx.imap.append(sentMailbox, raw, ["\\Seen"]);
            savedToSent = true;
          }
        } catch {
          // The mail is already delivered; a failed archive copy must not fail the call.
          savedToSent = false;
        }

        const output = {
          sent: true,
          message_id: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          saved_to_sent: savedToSent,
          sent_mailbox: sentMailbox,
        };
        const lines = [
          `Sent "${params.subject}" to ${info.accepted.join(", ") || params.to.join(", ")}.`,
          `Message-ID: ${info.messageId}`,
        ];
        if (info.rejected.length) lines.push(`Rejected: ${info.rejected.join(", ")}`);
        lines.push(
          savedToSent
            ? `Copy saved to \`${sentMailbox}\`.`
            : "Could not save a copy to the Sent folder (the message was still delivered).",
        );
        return toolResult(lines.join("\n"), output);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "titan_save_draft",
    {
      title: "Save Titan Draft",
      description: `Compose a message and save it to the Titan Drafts folder without sending it.

The safe way to prepare mail: the user can review and send it from webmail, or
approve it and then call titan_send_email. Nothing leaves the account.

Args:
  - to (string[]): Intended recipients (optional for a draft)
  - subject (string): Subject line (required)
  - body (string): Plain-text body (required)
  - cc (string[]): Carbon-copy addresses (optional)
  - bcc (string[]): Blind-carbon-copy addresses (optional)
  - html (string): HTML body (optional)
  - mailbox (string): Override the Drafts folder path (optional; auto-detected)

Returns:
  {
    "saved": boolean,
    "mailbox": string,       // Folder the draft was written to
    "subject": string,
    "to": string[]
  }

Examples:
  - Use when: "Draft a reply to this email" -> the user reviews it before anything is sent
  - Use when: Sending is disabled (TITAN_ALLOW_SEND is not true) but the user wants the text staged
  - Don't use when: The user has already approved sending (use titan_send_email)

Error Handling:
  - Returns an error if no Drafts folder can be found; pass 'mailbox' explicitly after
    checking titan_list_mailboxes.`,
      inputSchema: {
        to: emailListField.optional().describe("Intended recipients."),
        subject: z.string().min(1).max(500).describe("Subject line."),
        body: bodyField,
        cc: emailListField.optional().describe("Carbon-copy recipients."),
        bcc: emailListField.optional().describe("Blind-carbon-copy recipients."),
        html: htmlField,
        mailbox: z
          .string()
          .min(1)
          .optional()
          .describe("Explicit Drafts folder path. Auto-detected when omitted."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const drafts = params.mailbox ?? (await ctx.imap.findSpecialMailbox("\\Drafts"));
        if (!drafts) {
          throw new SmtpError(
            "No folder is marked as Drafts on this account. Call titan_list_mailboxes " +
              "and pass the folder path explicitly as 'mailbox'.",
          );
        }
        const raw = await ctx.smtp.compose({
          to: params.to ?? [],
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          text: params.body,
          html: params.html,
        });
        await ctx.imap.append(drafts, raw, ["\\Draft", "\\Seen"]);

        const output = {
          saved: true,
          mailbox: drafts,
          subject: params.subject,
          to: params.to ?? [],
        };
        return toolResult(
          `Draft "${params.subject}" saved to \`${drafts}\`. Nothing was sent.`,
          output,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
