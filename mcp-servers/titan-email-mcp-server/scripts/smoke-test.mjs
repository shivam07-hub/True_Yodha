import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: process.cwd(),
  env: {
    ...process.env,
    TITAN_EMAIL: "smoke-test@example.invalid",
    TITAN_PASSWORD: "not-a-real-password",
    TITAN_ALLOW_SEND: "false",
  },
  stderr: "inherit",
});

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`TOOLS (${tools.length}):`);
for (const t of tools) {
  const props = Object.keys(t.inputSchema?.properties ?? {});
  console.log(`  - ${t.name} [${props.join(", ")}] ro=${t.annotations?.readOnlyHint} destructive=${t.annotations?.destructiveHint}`);
}

// Send gate must refuse without touching the network.
const gated = await client.callTool({
  name: "titan_send_email",
  arguments: { to: ["nobody@example.invalid"], subject: "x", body: "y" },
});
console.log("\nSEND GATE:", gated.isError, "|", gated.content[0].text.slice(0, 120));

// Permanent-delete guard must refuse without confirm.
const guard = await client.callTool({
  name: "titan_delete_messages",
  arguments: { mailbox: "INBOX", uids: [1], permanent: true },
});
console.log("DELETE GUARD:", guard.isError, "|", guard.content[0].text.slice(0, 120));

// Bad input must be rejected by schema validation.
try {
  const bad = await client.callTool({ name: "titan_get_message", arguments: { uid: -5 } });
  console.log("SCHEMA GUARD:", bad.isError, "|", bad.content?.[0]?.text?.slice(0, 120));
} catch (e) {
  console.log("SCHEMA GUARD: threw |", String(e).slice(0, 160));
}

// Real network path against bogus creds: must return a clean, actionable error.
const conn = await client.callTool({
  name: "titan_check_connection",
  arguments: { check_smtp: false },
});
console.log("\nCONN CHECK:\n" + conn.content[0].text);

await client.close();
process.exit(0);
