import test from "node:test"
import assert from "node:assert/strict"

import {
  CV_UPLOAD_ACCEPT,
  CV_UPLOAD_MAX_BYTES,
  CV_UPLOAD_MIN_BYTES,
  DOCX_MIME,
  JPEG_MIME,
  PDF_MIME,
  PNG_MIME,
  PPTX_MIME,
  TEXT_MIME,
  WEBP_MIME,
  detectCVFile,
  detectCVFileTypeByName,
  detectCVMimeByMagic,
  detectCVMimeByType,
  detectUnsupportedFormatKind,
  ensureCVExtension,
  preflightCVUploadFile,
} from "../lib/cv-file-detect"

// Minimal File stand-in for node:test — Blob shape with .name + .type fields.
function fakeFile(opts: { name: string; type: string; bytes?: Uint8Array }) {
  const bytes = opts.bytes ?? new Uint8Array()
  return {
    name: opts.name,
    type: opts.type,
    slice(start: number, end: number) {
      const sliced = bytes.slice(start, end)
      return {
        async arrayBuffer() { return sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength) },
      } as unknown as Blob
    },
  }
}

test("detectCVFileTypeByName resolves common extensions case-insensitively", () => {
  assert.equal(detectCVFileTypeByName("resume.pdf"), PDF_MIME)
  assert.equal(detectCVFileTypeByName("Resume.PDF"), PDF_MIME)
  assert.equal(detectCVFileTypeByName("CV.docx"), DOCX_MIME)
  assert.equal(detectCVFileTypeByName("cv.png"), PNG_MIME)
  assert.equal(detectCVFileTypeByName("Scan.JPEG"), JPEG_MIME)
  assert.equal(detectCVFileTypeByName("cv.gif"), null)
  assert.equal(detectCVFileTypeByName("cv"), null)
})

test("detectCVMimeByType matches only the canonical MIME strings the backend reads", () => {
  assert.equal(detectCVMimeByType(PDF_MIME), PDF_MIME)
  assert.equal(detectCVMimeByType(DOCX_MIME), DOCX_MIME)
  assert.equal(detectCVMimeByType("application/octet-stream"), null)
  assert.equal(detectCVMimeByType(""), null)
})

test("detectCVMimeByMagic identifies each readable form by header bytes", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  assert.equal(detectCVMimeByMagic(pdf), PDF_MIME)
  assert.equal(detectCVMimeByMagic(docx), DOCX_MIME)
  assert.equal(detectCVMimeByMagic(jpeg), JPEG_MIME)
  assert.equal(detectCVMimeByMagic(gif), null)
  assert.equal(detectCVMimeByMagic(new Uint8Array([0x25, 0x50])), null)  // too short
})

test("ensureCVExtension appends the canonical ext when missing", () => {
  assert.equal(ensureCVExtension("resume", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("resume.pdf", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("resume.bin", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("CV", DOCX_MIME), "CV.docx")
  assert.equal(ensureCVExtension("", PDF_MIME), "cv.pdf")
  assert.equal(ensureCVExtension("IMG_2041", JPEG_MIME), "IMG_2041.jpg")
})

test("detectCVFile — phone-storage upload: filename + correct MIME both signal PDF", async () => {
  const file = fakeFile({ name: "resume.pdf", type: PDF_MIME })
  assert.equal(await detectCVFile(file), PDF_MIME)
})

test("detectCVFile — Google Drive: extensionless + octet-stream → magic-bytes recovers", async () => {
  const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
  const file = fakeFile({ name: "Untitled document", type: "application/octet-stream", bytes: pdfHead })
  assert.equal(await detectCVFile(file), PDF_MIME)
})

test("detectCVFile — Drive serving DOCX as application/octet-stream", async () => {
  const docxHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
  const file = fakeFile({ name: "share-12abc", type: "application/octet-stream", bytes: docxHead })
  assert.equal(await detectCVFile(file), DOCX_MIME)
})

test("detectCVFile — a phone photo of a CV is a CV (the backend transcribes it)", async () => {
  const jpgHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const file = fakeFile({ name: "IMG_2041.jpg", type: "image/jpeg", bytes: jpgHead })
  assert.equal(await detectCVFile(file), JPEG_MIME)
})

test("detectCVFile — slides and text files by name", async () => {
  assert.equal(await detectCVFile(fakeFile({ name: "Asha CV.pptx", type: "" })), PPTX_MIME)
  assert.equal(await detectCVFile(fakeFile({ name: "cv.txt", type: "" })), TEXT_MIME)
  assert.equal(await detectCVFile(fakeFile({ name: "cv.md", type: "" })), TEXT_MIME)
})

test("detectCVFile — screenshots shared without a name, by magic bytes", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  assert.equal(await detectCVFile(fakeFile({ name: "shared", type: "application/octet-stream", bytes: png })), PNG_MIME)
  assert.equal(await detectCVFile(fakeFile({ name: "shared", type: "application/octet-stream", bytes: webp })), WEBP_MIME)
})

test("detectCVFile — a spreadsheet's ZIP bytes never pass as a Word file", async () => {
  const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
  const file = fakeFile({ name: "skills.xlsx", type: "", bytes: zipHead })
  assert.equal(await detectCVFile(file), null)
})

test("every picker offers the camera and each form the backend reads", () => {
  for (const form of [".pdf", ".docx", ".pptx", ".txt", ".jpg", ".png", ".webp", "image/*"]) {
    assert.ok(CV_UPLOAD_ACCEPT.split(",").includes(form), form)
  }
})

test("detectCVFile — extensionless file with correct MIME (Drive happy path)", async () => {
  const file = fakeFile({ name: "shared-cv", type: PDF_MIME })
  assert.equal(await detectCVFile(file), PDF_MIME)
})

test("preflightCVUploadFile rejects empty files before network upload", async () => {
  const file = fakeFile({ name: "resume.pdf", type: PDF_MIME, bytes: new Uint8Array() })
  ;(file as unknown as { size: number }).size = 0
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "empty_file")
})

// The 76-byte stub Drive/OneDrive hand the picker for a file that is not downloaded
// locally. It carries a real .pdf name, a real PDF mime and real %PDF magic bytes, so
// every format check passes it. Two users uploaded the identical stub; one retried six
// times and never scored.
test("preflightCVUploadFile rejects a cloud-placeholder PDF that passes every format check", async () => {
  const file = fakeFile({ name: "resume.pdf", type: PDF_MIME, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) })
  ;(file as unknown as { size: number }).size = 76
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "placeholder_file")
    assert.match(result.message, /cloud shortcut/)
  }
})

// The floor may only judge things that claim to be a CV. A tiny spreadsheet is still a
// spreadsheet, and telling its owner to "download it again" would send them nowhere.
test("preflightCVUploadFile still names the format when a non-CV file is under the floor", async () => {
  const file = fakeFile({ name: "Positions.csv", type: "text/csv" })
  ;(file as unknown as { size: number }).size = 512
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "unsupported_format")
})

test("preflightCVUploadFile accepts a real CV just above the floor", async () => {
  const file = fakeFile({ name: "resume.pdf", type: PDF_MIME, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) })
  ;(file as unknown as { size: number }).size = CV_UPLOAD_MIN_BYTES
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, true)
})

test("preflightCVUploadFile rejects files above max bytes", async () => {
  const file = fakeFile({ name: "resume.pdf", type: PDF_MIME, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) })
  ;(file as unknown as { size: number }).size = CV_UPLOAD_MAX_BYTES + 1
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "file_too_large")
})

test("preflightCVUploadFile returns normalized name + mime for valid files", async () => {
  const file = fakeFile({ name: "resume", type: PDF_MIME, bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) })
  ;(file as unknown as { size: number }).size = 4096
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.mime, PDF_MIME)
    assert.equal(result.safeName, "resume.pdf")
  }
})

// ── detectUnsupportedFormatKind ──────────────────────────────────────────────

test("detectUnsupportedFormatKind: CSV by extension → spreadsheet", async () => {
  const file = fakeFile({ name: "Skills.csv", type: "text/csv" })
  assert.equal(await detectUnsupportedFormatKind(file), "spreadsheet")
})

test("detectUnsupportedFormatKind: XLSX by extension → spreadsheet", async () => {
  const file = fakeFile({ name: "data.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  assert.equal(await detectUnsupportedFormatKind(file), "spreadsheet")
})

test("detectUnsupportedFormatKind: .doc by extension → legacy_word", async () => {
  const file = fakeFile({ name: "Resume 2019.doc", type: "application/msword" })
  assert.equal(await detectUnsupportedFormatKind(file), "legacy_word")
})

test("detectUnsupportedFormatKind: HEIC by extension → heic", async () => {
  const file = fakeFile({ name: "IMG_0042.HEIC", type: "image/heic" })
  assert.equal(await detectUnsupportedFormatKind(file), "heic")
})

test("detectUnsupportedFormatKind: ZIP named linkedin → linkedin_data_zip", async () => {
  const file = fakeFile({ name: "Basic_LinkedInDataExport_05-28-2026.zip", type: "application/zip" })
  assert.equal(await detectUnsupportedFormatKind(file), "linkedin_data_zip")
})

test("detectUnsupportedFormatKind: ZIP with no linkedin in name → unknown", async () => {
  const file = fakeFile({ name: "archive.zip", type: "application/zip" })
  assert.equal(await detectUnsupportedFormatKind(file), "unknown")
})

test("detectUnsupportedFormatKind: ZIP magic bytes + linkedin in name → linkedin_data_zip", async () => {
  const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])
  const file = fakeFile({ name: "linkedin-export", type: "application/octet-stream", bytes: zipHead })
  assert.equal(await detectUnsupportedFormatKind(file), "linkedin_data_zip")
})

test("detectUnsupportedFormatKind: OLE magic bytes with no extension → legacy_word", async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  const file = fakeFile({ name: "attachment", type: "application/octet-stream", bytes: ole })
  assert.equal(await detectUnsupportedFormatKind(file), "legacy_word")
})

test("detectUnsupportedFormatKind: HEIF ftyp box with no extension → heic", async () => {
  const heic = new Uint8Array([0, 0, 0, 0x18, ...Array.from("ftypheic", (c) => c.charCodeAt(0))])
  const file = fakeFile({ name: "photo", type: "application/octet-stream", bytes: heic })
  assert.equal(await detectUnsupportedFormatKind(file), "heic")
})

// ── preflightCVUploadFile: tailored rejection copy ───────────────────────────

test("preflightCVUploadFile: LinkedIn zip gets tailored message", async () => {
  const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
  const file = fakeFile({ name: "Basic_LinkedInDataExport.zip", type: "application/zip", bytes: zipHead })
  ;(file as unknown as { size: number }).size = 1024
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "unsupported_format")
    assert.equal(result.unsupportedKind, "linkedin_data_zip")
    assert.match(result.message, /Save to PDF/)
  }
})

test("preflightCVUploadFile: a screenshot of a CV goes through under its own type", async () => {
  const jpgHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const file = fakeFile({ name: "cv-screenshot", type: "image/jpeg", bytes: jpgHead })
  ;(file as unknown as { size: number }).size = 240_000
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.mime, JPEG_MIME)
    assert.equal(result.safeName, "cv-screenshot.jpg")
  }
})

test("preflightCVUploadFile: a short text CV under 1KB is not a cloud shortcut", async () => {
  const file = fakeFile({ name: "cv.txt", type: "text/plain" })
  ;(file as unknown as { size: number }).size = 640
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, true)
})

test("preflightCVUploadFile: an iPhone HEIC photo says how to send it", async () => {
  const file = fakeFile({ name: "IMG_0042.heic", type: "image/heic" })
  ;(file as unknown as { size: number }).size = 2_400_000
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.unsupportedKind, "heic")
    assert.match(result.message, /JPEG/)
  }
})

test("preflightCVUploadFile: CSV gets tailored message", async () => {
  const file = fakeFile({ name: "Positions.csv", type: "text/csv" })
  ;(file as unknown as { size: number }).size = 512
  const result = await preflightCVUploadFile(file as unknown as File)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, "unsupported_format")
    assert.equal(result.unsupportedKind, "spreadsheet")
    assert.match(result.message, /photo of your CV/)
  }
})
