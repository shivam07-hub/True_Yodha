/** Mutating mailbox tools: flags, moves, deletes. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { mailboxField, requiredMailboxField, uidsField } from "../schemas/index.js";
import { toolError, toolResult } from "../services/format.js";
import { ImapError } from "../services/imap.js";

const FLAG_BY_NAME: Record<string, string> = {
  seen: "\\Seen",
  flagged: "\\Flagged",
  answered: "\\Answered",
  draft: "\\Draft",
};

export function registerManageTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "titan_set_flags",
    {
      title: "Set Titan Message Flags",
      description: `Add or remove IMAP flags on one or more Titan messages.

Use this to mark mail read/unread, star/unstar it, or mark it answered. Flags
are per-mailbox state; the messages must all live in the mailbox given here.

Args:
  - mailbox (string): Folder holding the messages (default: "INBOX")
  - uids (number[]): 1-200 message UIDs from a listing tool (required)
  - flag ('seen' | 'flagged' | 'answered' | 'draft'): Which flag to change (required)
  - value (boolean): true to add the flag, false to remove it (required)

Returns:
  {
    "mailbox": string,
    "uids": number[],
    "flag": string,          // The IMAP flag applied, e.g. "\\\\Seen"
    "value": boolean,
    "applied": boolean       // Whether the server reported the change as applied
  }

Examples:
  - Use when: "Mark those two emails as read" -> uids=[1201,1204], flag="seen", value=true
  - Use when: "Star this email" -> flag="flagged", value=true
  - Use when: "Mark it unread again" -> flag="seen", value=false
  - Don't use when: You want the message out of the inbox (use titan_move_messages)

Error Handling:
  - UIDs that do not exist are ignored by the server; re-list the mailbox if the
    result looks wrong.`,
      inputSchema: {
        mailbox: mailboxField,
        uids: uidsField,
        flag: z
          .enum(["seen", "flagged", "answered", "draft"])
          .describe("Which flag to change."),
        value: z.boolean().describe("true adds the flag, false removes it."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ mailbox, uids, flag, value }) => {
      try {
        const imapFlag = FLAG_BY_NAME[flag];
        const applied = value
          ? await ctx.imap.addFlags(mailbox, uids, [imapFlag])
          : await ctx.imap.removeFlags(mailbox, uids, [imapFlag]);
        const output = { mailbox, uids, flag: imapFlag, value, applied };
        return toolResult(
          `${value ? "Added" : "Removed"} ${imapFlag} on ${uids.length} message(s) in \`${mailbox}\`.`,
          output,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "titan_move_messages",
    {
      title: "Move Titan Messages",
      description: `Move messages from one Titan folder to another.

The messages leave the source folder. Their UIDs change in the destination, so
re-list the destination folder before acting on them again.

Args:
  - source_mailbox (string): Folder the messages are in now (default: "INBOX")
  - destination_mailbox (string): Folder to move them into (required)
  - uids (number[]): 1-200 message UIDs in the source mailbox (required)

Returns:
  {
    "source_mailbox": string,
    "destination_mailbox": string,
    "uids": number[],
    "moved": number          // Number of messages the server confirmed moving
  }

Examples:
  - Use when: "Archive these" -> destination_mailbox="Archive"
  - Use when: "File this under my Projects folder" -> destination_mailbox="INBOX/Projects"
  - Don't use when: You want to delete mail (use titan_delete_messages)

Error Handling:
  - An unknown destination returns an error naming it; call titan_list_mailboxes
    for exact folder paths.`,
      inputSchema: {
        source_mailbox: mailboxField.describe("Folder the messages are in now."),
        destination_mailbox: requiredMailboxField.describe("Folder to move the messages into."),
        uids: uidsField,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ source_mailbox, destination_mailbox, uids }) => {
      try {
        if (source_mailbox === destination_mailbox) {
          throw new ImapError(
            "Source and destination are the same folder; nothing to do.",
          );
        }
        const result = await ctx.imap.moveMessages(source_mailbox, uids, destination_mailbox);
        const moved =
          result && typeof result === "object" && result.uidMap
            ? Object.keys(result.uidMap).length
            : uids.length;
        const output = { source_mailbox, destination_mailbox, uids, moved };
        return toolResult(
          `Moved ${moved} message(s) from \`${source_mailbox}\` to \`${destination_mailbox}\`. ` +
            "Their UIDs changed — re-list the destination before acting on them again.",
          output,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "titan_delete_messages",
    {
      title: "Delete Titan Messages",
      description: `Delete Titan messages, by default by moving them to Trash (recoverable).

Default behaviour moves the messages to the account's Trash folder, which the
user can undo from webmail. Permanent expunge is available but requires
permanent=true AND confirm=true, and cannot be undone — ask the user before
using it.

Args:
  - mailbox (string): Folder holding the messages (default: "INBOX")
  - uids (number[]): 1-200 message UIDs (required)
  - permanent (boolean): Expunge instead of moving to Trash (default: false)
  - confirm (boolean): Must be true when permanent is true (default: false)

Returns:
  {
    "mailbox": string,
    "uids": number[],
    "mode": "trash" | "permanent",
    "trash_mailbox": string|null,   // Where they were moved, when mode is "trash"
    "deleted": number
  }

Examples:
  - Use when: "Delete that spam" -> uids=[3312] (goes to Trash, recoverable)
  - Use when: The user explicitly asks to permanently erase mail -> permanent=true, confirm=true
  - Don't use when: The user just wants mail out of the inbox (use titan_move_messages)

Error Handling:
  - Returns an error if permanent=true without confirm=true.
  - Returns an error if no Trash folder can be found; pass an explicit destination
    to titan_move_messages instead.`,
      inputSchema: {
        mailbox: mailboxField,
        uids: uidsField,
        permanent: z
          .boolean()
          .default(false)
          .describe("Permanently expunge instead of moving to Trash. Irreversible."),
        confirm: z
          .boolean()
          .default(false)
          .describe("Required acknowledgement when permanent is true."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ mailbox, uids, permanent, confirm }) => {
      try {
        if (permanent) {
          if (!confirm) {
            throw new ImapError(
              "Permanent deletion is irreversible and requires confirm=true. Confirm " +
                "with the user first, or omit 'permanent' to move the messages to Trash instead.",
            );
          }
          await ctx.imap.expungeMessages(mailbox, uids);
          const output = {
            mailbox,
            uids,
            mode: "permanent" as const,
            trash_mailbox: null,
            deleted: uids.length,
          };
          return toolResult(
            `Permanently deleted ${uids.length} message(s) from \`${mailbox}\`. This cannot be undone.`,
            output,
          );
        }

        const trash = await ctx.imap.findSpecialMailbox("\\Trash");
        if (!trash) {
          throw new ImapError(
            "No folder is marked as Trash on this account. Call titan_list_mailboxes " +
              "and use titan_move_messages with an explicit destination instead.",
          );
        }
        if (trash === mailbox) {
          throw new ImapError(
            `Messages are already in Trash (\`${mailbox}\`). Use permanent=true with ` +
              "confirm=true to erase them.",
          );
        }
        await ctx.imap.moveMessages(mailbox, uids, trash);
        const output = {
          mailbox,
          uids,
          mode: "trash" as const,
          trash_mailbox: trash,
          deleted: uids.length,
        };
        return toolResult(
          `Moved ${uids.length} message(s) from \`${mailbox}\` to \`${trash}\`. Recoverable from Trash.`,
          output,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
