/**
 * A pasted link starts the read; so does Enter. Fetch stays for anyone who
 * types a link and reaches for a button — it is no longer a click the path
 * needs (FD2, 2026-10-20: door to Download went from 12 clicks toward 5).
 */

/** The link, when the pasted text is one whole http(s) link and nothing else. */
export function pastedLink(text: string): string | null {
  const t = text.trim()
  return /^https?:\/\/\S+$/i.test(t) ? t : null
}
