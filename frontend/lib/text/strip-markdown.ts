/**
 * strip-markdown.ts
 *
 * Light-weight sanitizer for LLM-generated text that occasionally includes
 * raw markdown artifacts (links, headers, bold, nav boilerplate).
 *
 * Rule: keep the human-readable *content*, discard the syntax.
 * No dependency on a full markdown parser — regex is enough for the
 * narrow set of patterns the scraper/LLM actually produces.
 */

const RULES: [RegExp, string][] = [
  // Markdown links → keep the link text, discard URL
  // [Skip to main content](https://…) → "Skip to main content"
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],

  // Nav boilerplate that bleeds from scraped pages
  // e.g. "Skip to main content" bare string after link strip
  [/Skip to (main )?content\.?/gi, ""],

  // ATX headings → just the text
  [/^#{1,6}\s+/gm, ""],

  // Bold / italic markers
  [/\*{1,3}([^*]+)\*{1,3}/g, "$1"],
  [/__([^_]+)__/g, "$1"],
  [/_([^_]+)_/g, "$1"],

  // Inline code
  [/`([^`]+)`/g, "$1"],

  // Horizontal rules
  [/^(-{3,}|\*{3,}|_{3,})\s*$/gm, ""],

  // Bullet list markers at line start
  [/^[\s]*[-*+]\s+/gm, ""],

  // Numbered list markers
  [/^[\s]*\d+\.\s+/gm, ""],

  // Trailing/leading whitespace collapse
  [/[ \t]+/g, " "],
  [/\n{3,}/g, "\n\n"],
]

/**
 * Returns the input string with markdown syntax stripped.
 * Trims the result and collapses excess whitespace.
 */
export function stripMarkdown(text: string | null | undefined): string {
  if (!text) return ""
  let out = text
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement)
  }
  return out.trim()
}
