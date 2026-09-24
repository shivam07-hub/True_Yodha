/** Environment-derived configuration, validated once at startup. */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.js";

export interface MailConfig {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  allowSend: boolean;
  attachmentDir: string;
}

export class ConfigError extends Error {}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ConfigError(`${name} must be a TCP port between 1 and 65535, got "${raw}".`);
  }
  return parsed;
}

/** Package root, i.e. the directory holding .env (dist/ -> ..). */
function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function loadConfig(): MailConfig {
  loadDotEnv(packageRoot());

  const email = process.env.MAIL_EMAIL?.trim();
  const password = process.env.MAIL_PASSWORD;

  if (!email || !password) {
    throw new ConfigError(
      "Missing credentials. Set MAIL_EMAIL and MAIL_PASSWORD in the MCP server " +
        "environment. Gmail requires an app password (2-Step Verification must be on): " +
        "https://myaccount.google.com/apppasswords",
    );
  }

  return {
    email,
    password,
    imapHost: process.env.MAIL_IMAP_HOST?.trim() || "imap.gmail.com",
    imapPort: intFromEnv("MAIL_IMAP_PORT", 993),
    smtpHost: process.env.MAIL_SMTP_HOST?.trim() || "smtp.gmail.com",
    smtpPort: intFromEnv("MAIL_SMTP_PORT", 465),
    allowSend: process.env.MAIL_ALLOW_SEND?.trim().toLowerCase() === "true",
    attachmentDir:
      process.env.MAIL_ATTACHMENT_DIR?.trim() ||
      path.join(os.tmpdir(), "gmail-mcp-attachments"),
  };
}
