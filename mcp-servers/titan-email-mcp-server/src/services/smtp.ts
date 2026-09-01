/** SMTP send + MIME composition for Titan email. */

import nodemailer, { type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type Mail from "nodemailer/lib/mailer/index.js";
import type { TitanConfig } from "../config.js";

export class SmtpError extends Error {}

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

export class TitanSmtp {
  private transporter: Transporter | null = null;

  constructor(private readonly config: TitanConfig) {}

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        auth: { user: this.config.email, pass: this.config.password },
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      });
    }
    return this.transporter;
  }

  private toMailOptions(message: OutgoingMessage): Mail.Options {
    return {
      from: this.config.email,
      to: message.to,
      cc: message.cc?.length ? message.cc : undefined,
      bcc: message.bcc?.length ? message.bcc : undefined,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      inReplyTo: message.inReplyTo,
      references: message.references?.length ? message.references : undefined,
    };
  }

  /** Verify credentials and reachability without sending anything. */
  async verify(): Promise<void> {
    try {
      await this.getTransporter().verify();
    } catch (error) {
      throw normalizeSmtpError(error);
    }
  }

  async send(message: OutgoingMessage): Promise<{ messageId: string; accepted: string[]; rejected: string[] }> {
    try {
      const info = await this.getTransporter().sendMail(this.toMailOptions(message));
      return {
        messageId: info.messageId,
        accepted: (info.accepted ?? []).map(String),
        rejected: (info.rejected ?? []).map(String),
      };
    } catch (error) {
      throw normalizeSmtpError(error);
    }
  }

  /** Build the raw RFC822 bytes for a message (used for Drafts/Sent IMAP APPEND). */
  async compose(message: OutgoingMessage): Promise<Buffer> {
    const composer = new MailComposer({ ...this.toMailOptions(message), date: new Date() });
    return composer.compile().build();
  }

  close(): void {
    this.transporter?.close();
    this.transporter = null;
  }
}

export function normalizeSmtpError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string; responseCode?: number } | null)?.code;
  const responseCode = (error as { responseCode?: number } | null)?.responseCode;

  if (code === "EAUTH" || responseCode === 535) {
    return new SmtpError(
      "SMTP authentication failed. Check TITAN_EMAIL and TITAN_PASSWORD. If the " +
        "mailbox has 2FA enabled, use an app-specific password from Titan webmail " +
        "under Settings -> Security.",
    );
  }
  if (responseCode === 550 || responseCode === 553) {
    return new SmtpError(
      `The server rejected a recipient or the sender address: ${message}. Verify every ` +
        "recipient address, and that TITAN_EMAIL is the mailbox you are authenticating as.",
    );
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new SmtpError(
      `Could not resolve the SMTP host. Check TITAN_SMTP_HOST (default smtp.titan.email). Underlying error: ${message}`,
    );
  }
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ESOCKET") {
    return new SmtpError(
      `Could not reach the SMTP server (${code}). Check network access to port ${"465"} and retry. Underlying error: ${message}`,
    );
  }
  return new SmtpError(`SMTP error: ${message}`);
}
