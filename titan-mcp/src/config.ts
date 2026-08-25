export interface TitanConfig {
  email: string;
  appPassword: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  allowSend: boolean;
}

const DEFAULT_IMAP_HOST = "imap.titan.email";
const DEFAULT_SMTP_HOST = "smtp.titan.email";

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in this MCP server's environment.`);
  }
  return value;
}

function port(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TitanConfig {
  const email = required(env, "TITAN_EMAIL");
  if (!email.includes("@")) {
    throw new Error("TITAN_EMAIL must be a full email address.");
  }

  return {
    email,
    appPassword: required(env, "TITAN_APP_PASSWORD"),
    imapHost: env.TITAN_IMAP_HOST?.trim() || DEFAULT_IMAP_HOST,
    imapPort: port(env, "TITAN_IMAP_PORT", 993),
    smtpHost: env.TITAN_SMTP_HOST?.trim() || DEFAULT_SMTP_HOST,
    smtpPort: port(env, "TITAN_SMTP_PORT", 465),
    allowSend: env.TITAN_ALLOW_SEND === "true",
  };
}

export function requireSendPermission(config: TitanConfig, confirmed: boolean): void {
  if (!config.allowSend) {
    throw new Error("Sending is disabled. Set TITAN_ALLOW_SEND=true to enable it.");
  }
  if (!confirmed) {
    throw new Error("Sending requires confirm=true after the recipient and content are reviewed.");
  }
}
