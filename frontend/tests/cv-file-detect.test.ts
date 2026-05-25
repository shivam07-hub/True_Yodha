import test from "node:test"
import assert from "node:assert/strict"

import {
  CV_UPLOAD_MAX_BYTES,
  DOCX_MIME,
  PDF_MIME,
  detectCVFile,
  detectCVFileTypeByName,
  detectCVMimeByMagic,
  detectCVMimeByType,
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
  assert.equal(detectCVFileTypeByName("cv.png"), null)
  assert.equal(detectCVFileTypeByName("cv"), null)
})

test("detectCVMimeByType matches only canonical PDF/DOCX MIME strings", () => {
  assert.equal(detectCVMimeByType(PDF_MIME), PDF_MIME)
  assert.equal(detectCVMimeByType(DOCX_MIME), DOCX_MIME)
  assert.equal(detectCVMimeByType("application/octet-stream"), null)
  assert.equal(detectCVMimeByType(""), null)
})

test("detectCVMimeByMagic identifies PDF and DOCX by header bytes", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])
  const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  assert.equal(detectCVMimeByMagic(pdf), PDF_MIME)
  assert.equal(detectCVMimeByMagic(docx), DOCX_MIME)
  assert.equal(detectCVMimeByMagic(garbage), null)
  assert.equal(detectCVMimeByMagic(new Uint8Array([0x25, 0x50])), null)  // too short
})

test("ensureCVExtension appends the canonical ext when missing", () => {
  assert.equal(ensureCVExtension("resume", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("resume.pdf", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("resume.bin", PDF_MIME), "resume.pdf")
  assert.equal(ensureCVExtension("CV", DOCX_MIME), "CV.docx")
  assert.equal(ensureCVExtension("", PDF_MIME), "cv.pdf")
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

test("detectCVFile — image file rejected at every layer", async () => {
  const jpgHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const file = fakeFile({ name: "selfie.jpg", type: "image/jpeg", bytes: jpgHead })
  assert.equal(await detectCVFile(file), null)
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
