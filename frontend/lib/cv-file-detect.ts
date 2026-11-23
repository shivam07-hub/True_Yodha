/**
 * CV file-type detection. A CV comes in whatever form the person keeps it in —
 * PDF, Word, PowerPoint, a text file, a phone photo, a screenshot (2026-11-22).
 * The backend reader (`cv_parser.read_cv_file`) decides from the bytes; this is the
 * pick-time mirror of that list, so a file is refused here only when the server
 * would refuse it too. Three sources users actually pick from:
 *   1. Phone storage / camera — keeps an extension + correct MIME
 *   2. Google Drive  — often strips the extension; MIME may be canonical
 *      OR application/octet-stream when Drive serves a virtual URI
 *   3. Share intents — name may be a hash with no extension; MIME = octet-stream
 *
 * Strategy: filename-ext → file.type → magic bytes on the first 12 bytes.
 * Returns a canonical MIME or null when nothing matches.
 */

export const PDF_MIME = "application/pdf"
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
export const TEXT_MIME = "text/plain"
export const JPEG_MIME = "image/jpeg"
export const PNG_MIME = "image/png"
export const WEBP_MIME = "image/webp"

export type CVFileMime =
  | typeof PDF_MIME
  | typeof DOCX_MIME
  | typeof PPTX_MIME
  | typeof TEXT_MIME
  | typeof JPEG_MIME
  | typeof PNG_MIME
  | typeof WEBP_MIME

/** The one extension each canonical MIME is stored under. */
const EXTENSION: Record<CVFileMime, string> = {
  [PDF_MIME]: ".pdf",
  [DOCX_MIME]: ".docx",
  [PPTX_MIME]: ".pptx",
  [TEXT_MIME]: ".txt",
  [JPEG_MIME]: ".jpg",
  [PNG_MIME]: ".png",
  [WEBP_MIME]: ".webp",
}

const BY_EXTENSION: ReadonlyArray<readonly [string, CVFileMime]> = [
  [".pdf", PDF_MIME],
  [".docx", DOCX_MIME],
  [".pptx", PPTX_MIME],
  [".txt", TEXT_MIME],
  [".md", TEXT_MIME],
  [".jpg", JPEG_MIME],
  [".jpeg", JPEG_MIME],
  [".png", PNG_MIME],
  [".webp", WEBP_MIME],
]

/** How every upload surface names what it takes — one string, so no door says less. */
export const CV_UPLOAD_FORMATS = "PDF, Word, slides or a photo"

/** What every CV file picker offers. `image/*` lets a phone offer its camera. */
export const CV_UPLOAD_ACCEPT = [
  ...BY_EXTENSION.map(([ext]) => ext),
  "image/*",
  ...Object.keys(EXTENSION),
].join(",")

export const CV_UPLOAD_MAX_BYTES = 10 * 1024 * 1024

/** Below this a file cannot be a document, only a pointer to one. A PDF needs a header,
 *  catalog, page tree, xref and trailer before it holds a single word; a DOCX is a ZIP
 *  that must carry [Content_Types].xml, _rels and document.xml. Neither reaches 1KB.
 *  What does arrive at that size is a cloud placeholder — Drive and OneDrive hand the
 *  file picker a 76-byte stub for anything not downloaded locally, correct magic bytes
 *  and all. Two users uploaded the identical 76-byte stub; one retried six times, never
 *  scored, and never came back. Catch it at the pick, where the user still has the real
 *  file in front of them. A plain-text CV is the exception: a short one is under 1KB. */
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
  | "legacy_word"        // .doc — Word 97-2003, no reader here
  | "heic"               // iPhone photo format the vision models do not all take
  | "unknown"            // anything else

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
  const hit = BY_EXTENSION.find(([ext]) => lower.endsWith(ext))
  return hit ? hit[1] : null
}

export function detectCVMimeByType(mime: string): CVFileMime | null {
  return mime in EXTENSION ? (mime as CVFileMime) : null
}

/** Identify a CV form from its first bytes: `%PDF`, a ZIP (`PK\x03\x04` — Word or
 *  PowerPoint; the backend reads either and returns empty text for any other Office
 *  package), JPEG, PNG, or WebP (`RIFF....WEBP`). */
export function detectCVMimeByMagic(head: Uint8Array): CVFileMime | null {
  if (head.length < 4) return null
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return PDF_MIME
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return DOCX_MIME
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return JPEG_MIME
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return PNG_MIME
  if (
    head.length >= 12 &&
    String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...head.slice(8, 12)) === "WEBP"
  ) return WEBP_MIME
  return null
}

export function ensureCVExtension(name: string, mime: CVFileMime): string {
  const ext = EXTENSION[mime]
  if (name.toLowerCase().endsWith(ext)) return name
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name
  return `${base || "cv"}${ext}`
}

/** A name or browser type that says the file is a form we cannot read, so its
 *  magic bytes are not trusted to say otherwise (an .xlsx is a ZIP, like a DOCX). */
function unsupportedKindByLabel(lowerName: string, type: string): UnsupportedFormatKind | null {
  if (/\.(csv|xlsx|xls)$/.test(lowerName) || type === "text/csv") return "spreadsheet"
  if (lowerName.endsWith(".doc") || type === "application/msword") return "legacy_word"
  if (/\.(heic|heif)$/.test(lowerName) || type === "image/heic" || type === "image/heif") return "heic"
  return null
}

/**
 * Classify WHY a file failed CV detection — name and type first, then magic bytes.
 * Only called after `detectCVFile` returns null, so we know it's no form we read.
 */
export async function detectUnsupportedFormatKind(file: {
  name: string
  type: string
  slice: (start: number, end: number) => Blob
}): Promise<UnsupportedFormatKind> {
  const lower = file.name.toLowerCase()
  const byLabel = unsupportedKindByLabel(lower, file.type)
  if (byLabel) return byLabel
  const looksLinkedIn = lower.includes("linkedin") || lower.includes("dataexport")

  // ZIP by extension or MIME — check if it's a LinkedIn data export
  const isZipByName =
    lower.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  if (isZipByName) return looksLinkedIn ? "linkedin_data_zip" : "unknown"

  // Fall back to magic bytes
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    // ZIP magic: PK\x03\x04 (also matches DOCX, but detectCVFile already cleared those)
    if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      return looksLinkedIn ? "linkedin_data_zip" : "unknown"
    }
    // OLE compound file: Word 97-2003 .doc (and .xls)
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "legacy_word"
    // ISO media `ftyp` box naming a HEIF brand: an iPhone photo
    const brand = String.fromCharCode(...head.slice(4, 12))
    if (/^ftyp(heic|heix|hevc|mif1)$/.test(brand)) return "heic"
  } catch {
    // ignore — fall through to "unknown"
  }

  return "unknown"
}

const READ_FORMS = "PDF, Word, PowerPoint, a text file or a photo of your CV"

function unsupportedFormatMessage(kind: UnsupportedFormatKind): string {
  switch (kind) {
    case "linkedin_data_zip":
      return "That's LinkedIn's data archive. We need your profile PDF — open your profile → More → Save to PDF."
    case "spreadsheet":
      return `A spreadsheet isn't a CV. Upload the CV itself: ${READ_FORMS}.`
    case "legacy_word":
      return "That's an older Word file (.doc). Open it in Word or Google Docs, save it as PDF or DOCX, then upload that."
    case "heic":
      return "That's an iPhone HEIC photo. Take a screenshot of it, or share it as a JPEG, then upload that."
    default:
      return `We read ${READ_FORMS}.`
  }
}

/** Full pipeline: name → type → magic-bytes. Returns null if no signal hits. */
export async function detectCVFile(file: {
  name: string
  type: string
  slice: (start: number, end: number) => Blob
}): Promise<CVFileMime | null> {
  const lower = file.name.toLowerCase()
  const byName = detectCVFileTypeByName(lower)
  if (byName) return byName
  if (unsupportedKindByLabel(lower, file.type)) return null
  const byType = detectCVMimeByType(file.type)
  if (byType) return byType
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const byMagic = detectCVMimeByMagic(head)
    if (!byMagic) return null
    // DOCX shares the ZIP magic prefix (PK\x03\x04). Rule out explicit ZIP containers
    // so linkedin data exports and generic archives don't pass as "DOCX".
    if (byMagic === DOCX_MIME) {
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
      message: "This file appears empty. Pick your CV again.",
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
  if (file.size < CV_UPLOAD_MIN_BYTES && detected !== TEXT_MIME) {
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
