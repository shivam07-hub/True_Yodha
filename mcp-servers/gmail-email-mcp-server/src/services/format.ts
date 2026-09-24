/** Response shaping helpers shared by every tool. */

import {
  BODY_BEGIN,
  BODY_END,
  CHARACTER_LIMIT,
  UNTRUSTED_CONTENT_NOTICE,
} from "../constants.js";
import type { AddressSummary, MessageSummary } from "../types.js";

export interface ToolResult {
  /** The SDK's result type is an open record; keep it assignable. */
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toolResult(text: string, structuredContent?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: clamp(text) }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Hard cap on any single response so one call cannot flood the context window. */
export function clamp(text: string, limit = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return (
    text.slice(0, limit - 200) +
    `\n\n[... truncated: response exceeded ${limit} characters. Narrow the query, ` +
    "lower 'limit', or page with 'offset'.]"
  );
}

export function formatAddress(address: AddressSummary): string {
  if (address.name && address.address) return `${address.name} <${address.address}>`;
  return address.address ?? address.name ?? "(unknown)";
}

export function formatAddressList(addresses: AddressSummary[]): string {
  return addresses.length ? addresses.map(formatAddress).join(", ") : "(none)";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "(no date)";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** One-line-per-message markdown table body used by list/search tools. */
export function formatMessageLines(messages: MessageSummary[]): string {
  return messages
    .map((message) => {
      const state = [
        message.seen ? "read" : "UNREAD",
        message.flagged ? "flagged" : null,
        message.answered ? "answered" : null,
        message.draft ? "draft" : null,
        message.has_attachments ? "attachment" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return [
        `- **UID ${message.uid}** — ${message.subject || "(no subject)"}`,
        `  - From: ${formatAddressList(message.from)}`,
        `  - Date: ${formatDate(message.date)}`,
        `  - State: ${state}`,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Wrap third-party message content in explicit untrusted-data markers so an
 * agent reading the result does not mistake it for instructions.
 */
export function wrapUntrusted(body: string): string {
  return [UNTRUSTED_CONTENT_NOTICE, "", BODY_BEGIN, body, BODY_END].join("\n");
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/** Minimal HTML -> readable text, used only when a message has no text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Paginate an already-materialised list of ids. */
export function paginate<T>(items: T[], offset: number, limit: number) {
  const page = items.slice(offset, offset + limit);
  const hasMore = items.length > offset + page.length;
  return {
    page,
    total: items.length,
    count: page.length,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + page.length } : {}),
  };
}
