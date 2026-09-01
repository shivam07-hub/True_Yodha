/** Reusable Zod fragments. Tools compose these into their raw input shapes. */

import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat } from "../types.js";

export const mailboxField = z
  .string()
  .min(1)
  .default("INBOX")
  .describe('IMAP folder path, e.g. "INBOX", "Sent", "INBOX/Projects". Case-sensitive.');

export const requiredMailboxField = z
  .string()
  .min(1)
  .describe('IMAP folder path, e.g. "INBOX", "Sent", "INBOX/Projects". Case-sensitive.');

export const uidsField = z
  .array(z.number().int().positive())
  .min(1)
  .max(200)
  .describe(
    "Message UIDs from titan_list_messages or titan_search_messages. UIDs are unique " +
      "only within one mailbox, so they must come from the same mailbox given here.",
  );

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE)
  .describe(`Maximum messages to return (1-${MAX_PAGE_SIZE}).`);

export const offsetField = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe("Number of messages to skip, for paging through results.");

export const responseFormatField = z
  .enum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("'markdown' for human-readable output, 'json' for machine-readable output.");

export const isoDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("Calendar date in YYYY-MM-DD form.");

export const emailListField = z
  .array(z.email("Each entry must be a valid email address"))
  .describe("Email addresses.");
