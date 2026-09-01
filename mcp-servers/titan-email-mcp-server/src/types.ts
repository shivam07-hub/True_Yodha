/** Shared types for the Titan email MCP server. */

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export interface MailboxSummary {
  path: string;
  name: string;
  special_use: string | null;
  subscribed: boolean;
  has_children: boolean;
  selectable: boolean;
}

export interface AddressSummary {
  name: string | null;
  address: string | null;
}

export interface MessageSummary {
  uid: number;
  mailbox: string;
  message_id: string | null;
  date: string | null;
  subject: string | null;
  from: AddressSummary[];
  to: AddressSummary[];
  cc: AddressSummary[];
  flags: string[];
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  size_bytes: number | null;
  has_attachments: boolean;
}

export interface AttachmentSummary {
  index: number;
  filename: string | null;
  content_type: string;
  size_bytes: number;
  content_id: string | null;
  inline: boolean;
}

export interface MessageDetail extends MessageSummary {
  reply_to: AddressSummary[];
  bcc: AddressSummary[];
  in_reply_to: string | null;
  references: string[];
  body_text: string;
  body_format: "text" | "html-converted" | "empty";
  body_truncated: boolean;
  attachments: AttachmentSummary[];
}
