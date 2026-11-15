/** The one line written to the reader. A blank or missing line is no line. */
export function readerLine(v: { pick_reason?: string | null }): string | null {
  return v.pick_reason?.trim() || null
}
