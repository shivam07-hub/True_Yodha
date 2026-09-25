# gmail-pathak7july-mcp-server

MCP server for a **Gmail** mailbox. It talks to the mailbox over standard
**IMAP** (`imap.gmail.com:993`) and **SMTP** (`smtp.gmail.com:465`), not the
Gmail web UI, so it keeps working across UI redesigns. Forked from
[titan-email-mcp-server](../titan-email-mcp-server) (the hello@himyro.com
mailbox) — same code, generic IMAP/SMTP under the hood, pointed at a
different mailbox/account. One process = one mailbox by design; a third
account gets a third copy of this folder, not a config flag on this one.

12 tools: read, search, organize, and (behind an explicit gate) send.

---

## Setup

```bash
cd ~/True_Yodha/mcp-servers/gmail-pathak7july-mcp-server
npm install
npm run build
cp .env.example .env   # then fill in MAIL_EMAIL / MAIL_PASSWORD
chmod 600 .env
```

**Credentials.** Gmail's IMAP/SMTP rejects the account's normal password.
Turn on 2-Step Verification (https://myaccount.google.com/security), then
generate an App Password at https://myaccount.google.com/apppasswords and
use that 16-character string as `MAIL_PASSWORD`.

Verify before wiring it up:

```bash
npm run smoke
```

### Register with Claude Code

`scripts/run.sh` sources `.env` itself, so the password never enters an MCP config
file or your shell history:

```bash
claude mcp add gmail-himirko -- /Users/incognito/True_Yodha/mcp-servers/gmail-pathak7july-mcp-server/scripts/run.sh
```

For any other MCP client, the equivalent entry is:

```json
{
  "mcpServers": {
    "gmail-himirko": {
      "command": "/Users/incognito/True_Yodha/mcp-servers/gmail-pathak7july-mcp-server/scripts/run.sh"
    }
  }
}
```

---

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MAIL_EMAIL` | yes | — | Mailbox address; also the only permitted `From` |
| `MAIL_PASSWORD` | yes | — | Gmail App Password (normal account password is rejected) |
| `MAIL_IMAP_HOST` | no | `imap.gmail.com` | IMAP host |
| `MAIL_IMAP_PORT` | no | `993` | IMAP port (implicit TLS) |
| `MAIL_SMTP_HOST` | no | `smtp.gmail.com` | SMTP host |
| `MAIL_SMTP_PORT` | no | `465` | SMTP port (implicit TLS when 465) |
| `MAIL_ALLOW_SEND` | no | `false` | Must be exactly `true` before `mail_send_email` will send |
| `MAIL_ATTACHMENT_DIR` | no | `<tmpdir>/gmail-mcp-attachments` | Where downloaded attachments are written |

---

## Tools

### Read-only

| Tool | What it does |
|---|---|
| `mail_list_mailboxes` | Every folder, with `special_use` marking the real Sent/Drafts/Trash/Junk |
| `mail_mailbox_status` | Total / unread / recent counts for one folder |
| `mail_check_connection` | Verifies IMAP and SMTP login; sends nothing |
| `mail_list_messages` | Newest-first envelopes in a folder, paginated |
| `mail_search_messages` | Server-side search: from, to, subject, free text, date range, unread, flagged |

### Read + small state change

| Tool | What it does |
|---|---|
| `mail_get_message` | Full message: headers, plain-text body (HTML converted), attachment list. Optional `mark_as_read` |
| `mail_download_attachment` | Writes one attachment to `MAIL_ATTACHMENT_DIR`, returns the path |

### Mutating

| Tool | What it does |
|---|---|
| `mail_set_flags` | Mark read/unread, star/unstar, answered, draft |
| `mail_move_messages` | Move messages between folders |
| `mail_delete_messages` | Moves to Trash by default; permanent expunge needs `permanent=true` **and** `confirm=true` |
| `mail_save_draft` | Composes a message into Drafts. Sends nothing |
| `mail_send_email` | Sends real mail via SMTP. Refuses unless `MAIL_ALLOW_SEND=true` |

Every listing tool takes `limit` (1–100, default 25) and `offset`, and returns
`total`, `count`, `has_more`, and `next_offset`. Every read tool takes
`response_format: "markdown" | "json"`.

### Typical flow

```
mail_list_mailboxes                     -> exact folder paths
mail_search_messages  from="stripe.com" -> UIDs + subjects
mail_get_message      uid=1204          -> body + attachment list
mail_download_attachment uid=1204 attachment_index=0
mail_save_draft       ...               -> user reviews
mail_send_email       ...               -> only after the user approves
```

---

## Safety design

- **Sending is gated twice.** `MAIL_ALLOW_SEND` must be `true` at the process
  level, and the tool description instructs the agent to get explicit user
  approval for recipients, subject, and body before calling. `mail_save_draft`
  is the no-risk alternative and needs no gate.
- **Deletion prefers Trash.** `mail_delete_messages` moves to the account's
  Trash folder unless the caller passes both `permanent=true` and `confirm=true`.
- **Message bodies are treated as untrusted.** `mail_get_message` wraps body
  text in `BEGIN/END UNTRUSTED EMAIL BODY` markers with a notice telling the
  agent to treat it as data and never follow instructions found inside it —
  email is the classic prompt-injection vector.
- **`From` cannot be spoofed.** It is always the configured mailbox.
- **Attachments go to disk, not into context.** Bytes are returned inline only
  when `include_base64=true` and the file is under ~750 KB.
- **Bounded responses.** Any response is clamped at 25,000 characters and any
  single body at 12,000, with an explicit truncation note.
- **Nothing is logged to stdout.** stdout carries only the MCP stream;
  diagnostics go to stderr, and the IMAP protocol logger is disabled.

---

## Implementation notes

- **One serialized IMAP connection.** A single IMAP connection can have only one
  mailbox selected at a time, so `MailImap` funnels every operation through a
  promise chain and a per-mailbox lock. A dropped socket is rebuilt on the next
  call rather than poisoning the server.
- **UIDs are per-mailbox.** Every tool that takes UIDs also takes the mailbox
  they came from. After a move, UIDs change — the tool result says so.
- **Errors are actionable.** Auth failures name the env vars and the
  app-password path; unknown folders point at `mail_list_mailboxes`; unresolved
  hosts name the host env var.

---

## Evaluations

The skill's evaluation phase wants 10 questions with verifiable answers drawn
from real mailbox content. Those cannot be authored here: this server was built
and tested without mailbox credentials, so there is no corpus to read. Generate
them once the server is connected — with the MCP running, explore with the
read-only tools (`mail_list_mailboxes`, `mail_search_messages`,
`mail_get_message`) and write `evaluation.xml` as:

```xml
<evaluation>
  <qa_pair>
    <question>...</question>
    <answer>...</answer>
  </qa_pair>
</evaluation>
```

Keep every question read-only, independent, and stable over time (mailbox
contents drift — prefer facts about old, settled threads).

## Development

```bash
npm run watch    # tsc --watch
npm run smoke    # spawn the server, list tools, exercise the guards
npm run inspect  # MCP Inspector against dist/index.js
```
