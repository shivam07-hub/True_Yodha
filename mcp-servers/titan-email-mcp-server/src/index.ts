#!/usr/bin/env node
/**
 * titan-email-mcp-server
 *
 * MCP stdio server exposing a Titan mailbox (secureserver.titan.email /
 * GoDaddy Professional Email) over IMAP + SMTP.
 *
 * Nothing may be written to stdout except the MCP protocol stream; all
 * diagnostics go to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import type { ServerContext } from "./context.js";
import { TitanImap } from "./services/imap.js";
import { TitanSmtp } from "./services/smtp.js";
import { registerMailboxTools } from "./tools/mailboxes.js";
import { registerManageTools } from "./tools/manage.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerSendTools } from "./tools/send.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[${SERVER_NAME}] Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const ctx: ServerContext = {
    config,
    imap: new TitanImap(config),
    smtp: new TitanSmtp(config),
  };

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerMailboxTools(server, ctx);
  registerMessageTools(server, ctx);
  registerManageTools(server, ctx);
  registerSendTools(server, ctx);

  const shutdown = async (): Promise<void> => {
    try {
      ctx.smtp.close();
      await ctx.imap.close();
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[${SERVER_NAME}] ready for ${config.email} ` +
      `(imap ${config.imapHost}:${config.imapPort}, smtp ${config.smtpHost}:${config.smtpPort}, ` +
      `sending ${config.allowSend ? "ENABLED" : "disabled"})`,
  );
}

main().catch((error: unknown) => {
  console.error(`[${SERVER_NAME}] Fatal: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
