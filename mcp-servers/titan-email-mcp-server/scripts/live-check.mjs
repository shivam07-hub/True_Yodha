// Read-only live verification. Uses scripts/run.sh so .env supplies credentials.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const transport = new StdioClientTransport({
  command: path.join(root, "scripts", "run.sh"),
  cwd: root,
  stderr: "inherit",
});
const client = new Client({ name: "live-check", version: "1.0.0" });
await client.connect(transport);

const text = (r) => r.content?.[0]?.text ?? "";

console.log("=== 1. CONNECTION ===");
console.log(text(await client.callTool({ name: "titan_check_connection", arguments: { check_smtp: true } })));

console.log("\n=== 2. MAILBOXES ===");
console.log(text(await client.callTool({ name: "titan_list_mailboxes", arguments: {} })));

console.log("\n=== 3. INBOX STATUS ===");
console.log(text(await client.callTool({ name: "titan_mailbox_status", arguments: { mailbox: "INBOX" } })));

console.log("\n=== 4. NEWEST 5 (envelopes only, no bodies) ===");
console.log(text(await client.callTool({ name: "titan_list_messages", arguments: { mailbox: "INBOX", limit: 5 } })));

await client.close();
process.exit(0);
