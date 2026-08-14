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
export const CV_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

/** Below this a file cannot be a document, only a pointer to one. A PDF needs a header,
 *  catalog, page tree, xref and trailer before it holds a single word; a DOCX is a ZIP
 *  that must carry [Content_Types].xml, _rels and document.xml. Neither reaches 1KB.
 *  What does arrive at that size is a cloud placeholder — Drive and OneDrive hand the
 *  file picker a 76-byte stub for anything not downloaded locally, correct magic bytes
 *  and all. Two users uploaded the identical 76-byte stub; one retried six times, never
 *  scored, and never came back. Catch it at the pick, where the user still has the real
 *  file in front of them. */
export const CV_UPLOAD_MIN_BYTES = 1024

export type CVUploadPreflightErrorCode =
  | "empty_file"
  | "placeholder_file"
  | "file_too_large"
  | "unsupported_format"

/** Discriminates WHY an unsupported file was rejected so callers can show tailored recovery copy. */
export type UnsupportedFormatKind =
  | "linkedin_data_zip"  // GDPR data archive — user needs Save to PDF instead
  | "spreadsheet"        // CSV, XLSX, XLS
  | "image"              // PNG, JPG, JPEG, HEIC
  | "unknown"            // anything else not PDF/DOCX

export type CVUploadPreflightResult =
  | {
      ok: true
      mime: CVFileMime
      safeName: string
    }
  | {
      ok: false
      code: CVUploadPreflightErrorCode
      message: string
      fileBytes: number
      maxBytes: number
      /** Present when code === "unsupported_format". Use to render tailored CTAs. */
      unsupportedKind?: UnsupportedFormatKind
    }

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

/**
 * Classify WHY a file failed CV detection — name heuristics first, then magic bytes.
 * Only called after `detectCVFile` returns null, so we know it's not PDF/DOCX.
 */
export async function detectUnsupportedFormatKind(file: {
  name: string
  type: string
  slice: (start: number, end: number) => Blob
}): Promise<UnsupportedFormatKind> {
  const lower = file.name.toLowerCase()

  if (lower.endsWith(".csv")) return "spreadsheet"
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "spreadsheet"
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".heic")) return "image"

  // ZIP by extension or MIME — check if it's a LinkedIn data export
  const isZipByName =
    lower.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  if (isZipByName) {
    return lower.includes("linkedin") || lower.includes("dataexport")
      ? "linkedin_data_zip"
      : "unknown"
  }

  // Fall back to magic bytes
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    // ZIP magic: PK\x03\x04 (also matches DOCX, but detectCVFile already cleared those)
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      return lower.includes("linkedin") || lower.includes("dataexport")
        ? "linkedin_data_zip"
        : "unknown"
    }
    // JPEG: ff d8
    if (head[0] === 0xff && head[1] === 0xd8) return "image"
    // PNG: 89 50 4e 47
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image"
  } catch {
    // ignore — fall through to "unknown"
  }

  return "unknown"
}

function unsupportedFormatMessage(kind: UnsupportedFormatKind): string {
  switch (kind) {
    case "linkedin_data_zip":
      return "That's LinkedIn's data archive. We need your profile PDF — open your profile → More → Save to PDF."
    case "spreadsheet":
      return "CSV and spreadsheet files aren't a CV format. Upload your CV as a PDF or DOCX."
    case "image":
      return "Looks like a screenshot or photo. Export your CV as a text-based PDF instead."
    default:
      return "Only PDF and DOCX files are supported."
  }
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
    const byMagic = detectCVMimeByMagic(head)
    if (!byMagic) return null
    // DOCX shares the ZIP magic prefix (PK\x03\x04). Rule out explicit ZIP containers
    // so linkedin data exports and generic archives don't pass as "DOCX".
    if (byMagic === DOCX_MIME) {
      const lower = file.name.toLowerCase()
      const isExplicitZip =
        lower.endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed"
      if (isExplicitZip) return null
    }
    return byMagic
  } catch {
    return null
  }
}

export async function preflightCVUploadFile(
  file: {
    name: string
    type: string
    size: number
    slice: (start: number, end: number) => Blob
  },
  opts: { maxBytes?: number } = {},
): Promise<CVUploadPreflightResult> {
  const maxBytes = opts.maxBytes ?? CV_UPLOAD_MAX_BYTES
  if (file.size <= 0) {
    return {
      ok: false,
      code: "empty_file",
      message: "This file appears empty. Pick a non-empty PDF or DOCX and try again.",
      fileBytes: file.size,
      maxBytes,
    }
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      code: "file_too_large",
      message: `File too large — maximum size is ${Math.floor(maxBytes / (1024 * 1024))}MB.`,
      fileBytes: file.size,
      maxBytes,
    }
  }
  const detected = await detectCVFile(file)
  if (!detected) {
    const unsupportedKind = await detectUnsupportedFormatKind(file)
    return {
      ok: false,
      code: "unsupported_format",
      message: unsupportedFormatMessage(unsupportedKind),
      fileBytes: file.size,
      maxBytes,
      unsupportedKind,
    }
  }
  // Size is judged only once the file claims to be a CV format. A 512-byte CSV is a
  // spreadsheet and should be told so; a 76-byte PDF passed every format check it has —
  // correct magic bytes, correct extension — and is still not a document.
  if (file.size < CV_UPLOAD_MIN_BYTES) {
    return {
      ok: false,
      code: "placeholder_file",
      message: "This file is a cloud shortcut, not your CV. Open it once so it downloads, then pick it again.",
      fileBytes: file.size,
      maxBytes,
    }
  }
  return {
    ok: true,
    mime: detected,
    safeName: ensureCVExtension(file.name, detected),
  }
}
