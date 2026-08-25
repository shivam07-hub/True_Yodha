import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, requireSendPermission } from "./config.js";
import { loadPrivateEnvironment } from "./environment.js";
import { getMessage, listMailboxes, listMessages, searchMessages, sendMessage } from "./mail.js";

loadPrivateEnvironment();
const config = loadConfig();
const server = new McpServer({ name: "titan-email", version: "0.1.0" });

function response(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Titan mail error.";
  console.error(`Titan Email MCP error: ${message}`);
  return { content: [{ type: "text" as const, text: `Titan mail operation failed: ${message}` }], isError: true };
}

const mailbox = z.string().min(1).max(255).default("INBOX");
const limit = z.number().int().min(1).max(50).default(20);
const emailAddress = z.string().email();

server.registerTool(
  "titan_list_mailboxes",
  {
    title: "List Titan mailboxes",
    description: "List accessible mail folders and their message and unread counts.",
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      return response(await listMailboxes(config));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "titan_list_messages",
  {
    title: "List Titan messages",
    description: "List the newest messages in a mailbox. Returns headers only, never message bodies.",
    inputSchema: { mailbox, limit },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ mailbox, limit }) => {
    try {
      return response(await listMessages(config, mailbox, limit));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "titan_search_messages",
  {
    title: "Search Titan messages",
    description: "Search one mailbox by sender, recipient, subject, text, date, or unread status. Returns headers only.",
    inputSchema: {
      mailbox,
      from: z.string().min(1).max(320).optional(),
      to: z.string().min(1).max(320).optional(),
      subject: z.string().min(1).max(500).optional(),
      text: z.string().min(1).max(500).optional(),
      since: z.string().date().optional(),
      before: z.string().date().optional(),
      unreadOnly: z.boolean().default(false),
      limit,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (options) => {
    try {
      return response(await searchMessages(config, options));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "titan_get_message",
  {
    title: "Read a Titan message",
    description: "Read one message by UID from a mailbox. Bodies are capped at 512 KB and attachments are metadata only.",
    inputSchema: { mailbox, uid: z.number().int().positive() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ mailbox, uid }) => {
    try {
      return response(await getMessage(config, mailbox, uid));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "titan_send_email",
  {
    title: "Send a Titan email",
    description: "Send a plain-text email from the configured Titan mailbox. Requires TITAN_ALLOW_SEND=true and confirm=true.",
    inputSchema: {
      to: z.array(emailAddress).min(1).max(50),
      cc: z.array(emailAddress).max(50).optional(),
      bcc: z.array(emailAddress).max(50).optional(),
      subject: z.string().min(1).max(998),
      text: z.string().min(1).max(100_000),
      confirm: z.literal(true).describe("Set true only after reviewing recipients and content."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ confirm, ...message }) => {
    try {
      requireSendPermission(config, confirm);
      return response(await sendMessage(config, message));
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
