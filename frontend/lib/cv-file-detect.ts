/**
 * CV file-type detection — handles the three sources users actually pick from:
 *   1. Phone storage — keeps `.pdf`/`.docx` extension + correct MIME
 *   2. Google Drive  — often strips the extension; MIME may be canonical
 *      PDF/DOCX OR application/octet-stream when Drive serves a virtual URI
 *   3. Share intents — name may be a hash with no extension; MIME = octet-stream
 *
 * Strategy: filename-ext → file.type → magic bytes on first 4 bytes.
 * Returns a canonical MIME or null when nothing matches.
 */

export const PDF_MIME = "application/pdf"
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export type CVFileMime = typeof PDF_MIME | typeof DOCX_MIME

export function detectCVFileTypeByName(name: string): CVFileMime | null {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) return PDF_MIME
  if (lower.endsWith(".docx")) return DOCX_MIME
  return null
}

export function detectCVMimeByType(mime: string): CVFileMime | null {
  if (mime === PDF_MIME) return PDF_MIME
  if (mime === DOCX_MIME) return DOCX_MIME
  return null
}

/** Inspect first 4 bytes to identify PDF (`%PDF`) or DOCX/zip (`PK\x03\x04`).
 *  DOCX shares the zip prefix with XLSX/PPTX; the backend rejects non-Word
 *  zips so a false-positive here surfaces a clear error, not silent corruption.
 */
export function detectCVMimeByMagic(head: Uint8Array): CVFileMime | null {
  if (head.length < 4) return null
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return PDF_MIME
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return DOCX_MIME
  return null
}

export function ensureCVExtension(name: string, mime: CVFileMime): string {
  const ext = mime === PDF_MIME ? ".pdf" : ".docx"
  if (name.toLowerCase().endsWith(ext)) return name
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name
  return `${base || "cv"}${ext}`
}

/** Full pipeline: name → type → magic-bytes. Returns null if no signal hits. */
export async function detectCVFile(file: {
  name: string
  type: string
  slice: (start: number, end: number) => Blob
}): Promise<CVFileMime | null> {
  const byName = detectCVFileTypeByName(file.name)
  if (byName) return byName
  const byType = detectCVMimeByType(file.type)
  if (byType) return byType
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    return detectCVMimeByMagic(head)
  } catch {
    return null
  }
}
