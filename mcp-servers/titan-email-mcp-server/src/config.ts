/** Environment-derived configuration, validated once at startup. */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.js";

export interface TitanConfig {
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

export function loadConfig(): TitanConfig {
  loadDotEnv(packageRoot());

  const email = process.env.TITAN_EMAIL?.trim();
  const password = process.env.TITAN_PASSWORD;

  if (!email || !password) {
    throw new ConfigError(
      "Missing credentials. Set TITAN_EMAIL and TITAN_PASSWORD in the MCP server " +
        "environment. If the mailbox has 2FA enabled, use an app-specific password " +
        "generated at https://secureserver.titan.email -> Settings -> Security.",
    );
  }

  return {
    email,
    password,
    imapHost: process.env.TITAN_IMAP_HOST?.trim() || "imap.titan.email",
    imapPort: intFromEnv("TITAN_IMAP_PORT", 993),
    smtpHost: process.env.TITAN_SMTP_HOST?.trim() || "smtp.titan.email",
    smtpPort: intFromEnv("TITAN_SMTP_PORT", 465),
    allowSend: process.env.TITAN_ALLOW_SEND?.trim().toLowerCase() === "true",
    attachmentDir:
      process.env.TITAN_ATTACHMENT_DIR?.trim() ||
      path.join(os.tmpdir(), "titan-mcp-attachments"),
  };
}
