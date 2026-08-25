# Titan Email MCP

Local MCP server for a Titan mailbox. It works with Claude, Codex, and Cursor through the standard `stdio` transport; messages stay between the local client and Titan's IMAP/SMTP servers.

## What it can do

- List mailbox folders and their counts.
- List, search, and read messages. Read bodies are limited to 512 KB; attachments are returned as metadata only.
- Send plain-text mail only when both `TITAN_ALLOW_SEND=true` and the MCP caller supplies `confirm=true`.

There are deliberately no delete, move, archive, mark-read, attachment-download, or arbitrary-`from` tools.

## Prerequisites

1. In Titan, enable **third-party email access** for the mailbox.
2. If two-factor authentication is on, create an **app password** and use it here — never the normal Titan password.
3. Install Node.js 20 or newer.

The default endpoints are Titan's standard IMAP (`imap.titan.email:993` with TLS) and SMTP (`smtp.titan.email:465` with TLS). A mailbox supplied through GoDaddy or an EU-hosted Titan partner can need different endpoints; set the `TITAN_*_HOST` and `TITAN_*_PORT` values in that case.

## Install and keep credentials local

```sh
cd /Users/incognito/True_Yodha/titan-mcp
npm install
npm run build

install -d -m 700 "$HOME/.config/titan-email-mcp"
cp .env.example "$HOME/.config/titan-email-mcp/.env"
chmod 600 "$HOME/.config/titan-email-mcp/.env"
open -e "$HOME/.config/titan-email-mcp/.env"
```

Set `TITAN_EMAIL` and `TITAN_APP_PASSWORD` in that private file. Leave `TITAN_ALLOW_SEND=false` until you want sending available. The server refuses to load a secret file that group or other users can read.

The path can be changed with `TITAN_CONFIG_FILE`. Process environment variables take precedence over the file, which is useful for CI or a secret manager.

## Connect clients

Use the full path to Node from `command -v node` if the client cannot find `node` itself.

### Codex

Add this to `~/.codex/config.toml` (or this project's `.codex/config.toml`):

```toml
[mcp_servers.titan_email]
command = "node"
args = ["/Users/incognito/True_Yodha/titan-mcp/dist/index.js"]
cwd = "/Users/incognito/True_Yodha/titan-mcp"
default_tools_approval_mode = "writes"
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Restart Codex, then use `/mcp` to confirm the server is connected. Codex Desktop, CLI, and the IDE extension share the same configuration.

### Claude Code

```sh
claude mcp add --transport stdio titan-email \
  -- node /Users/incognito/True_Yodha/titan-mcp/dist/index.js
claude mcp get titan-email
```

For Claude Desktop, add the same command, arguments, and working directory as a local `stdio` server from its MCP/Extensions settings, then restart the app. If configuring the JSON file directly, the server entry is:

```json
{
  "type": "stdio",
  "command": "node",
  "args": ["/Users/incognito/True_Yodha/titan-mcp/dist/index.js"]
}
```

### Cursor

Add this server object under `mcpServers` in `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
"titan-email": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/incognito/True_Yodha/titan-mcp/dist/index.js"]
}
```

Enable it under **Customize**. Its local-process network mode must allow outbound access to `imap.titan.email` and `smtp.titan.email`.

## Verify

Run the unit and build checks:

```sh
cd /Users/incognito/True_Yodha/titan-mcp
npm test
```

Then, after connecting a client, first call `titan_list_mailboxes`. A successful response is the live IMAP verification. Start with `titan_list_messages` or `titan_search_messages`; sending stays disabled unless you deliberately opt in.
