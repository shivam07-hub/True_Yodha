# ADR-0020 — CV Artifact WYSIWYG Contract

Date: 2026-07-03
Status: accepted

## Context

On 2026-07-03 a new user (IIM Lucknow MBA — exactly the trust-sensitive
audience) uploaded a well-formatted CV, got a clean parse (`cv_structured`
perfect in the DB), tapped the one-tap "Download CV" button, and received a
visibly mangled 2-page PDF: skills exploded one-per-line with orphan `•`
glyphs, raw PDF-extraction line breaks preserved mid-sentence, `₹` rendered as
`■` tofu, and section headers indistinguishable from body text.

Root cause was architectural, not a bug in any one function. Two renderers
produced the same artifact ("my CV as a PDF"):

1. **WYSIWYG path** — `PdfPage` (`.cvb-pdf-page`) React sheet → outerHTML →
   `POST /cv/export-pdf` → headless Chromium with the shared, test-synced
   sheet stylesheet. Byte-faithful to the preview.
2. **Legacy plain-text path** — `resolveMasterText` preferred
   `CVVersion.body_text` (which, for baselines, is the RAW extraction text —
   see CONTEXT.md · CV Version) → `POST /cv/download-pdf` → reportlab
   re-parsing plain text line-by-line with Helvetica (WinAnsi: no `₹`).

The one-tap `DownloadCVButton` (onboarding score reveal, /cv surfaces) used
path 2. The user downloaded something no surface ever previewed. The plain-text
renderer was **shallow**: its interface ("hand me plain text") pushed all
formatting knowledge onto callers, and its input contract silently accepted
provenance text as render input.

## Decision

**Every user-facing CV artifact is rendered from what the user previews.**

- **PDF**: exactly one path — the rendered `PdfPage` sheet's outerHTML through
  `POST /cv/export-pdf` (Chromium), via the `exportSheetPdf` seam
  (`frontend/lib/cv/sheet-pdf.ts`). Client fallback: the browser's native
  Save-as-PDF of the same on-screen sheet (`printCvPage`). Surfaces without a
  visible sheet (one-tap buttons) mount `PdfPage` hidden and export the same
  DOM.
- **DOCX**: the structured projection of the same visible sections
  (`selectVisibleCV` → `POST /cv/export-docx`), sharing the hidden-items set
  with the sheet so PDF and DOCX cannot diverge.
- **`body_text` is provenance, never render input.** For baselines it is the
  raw upload extraction; it exists for auditability and re-parsing, not for
  producing artifacts.
- **Plain-text re-parsing renderers are forbidden.** `/cv/download-pdf` and
  `backend/app/services/cv_pdf.py` (reportlab) are deleted; reportlab is out
  of requirements. Do not reintroduce a renderer that reconstructs structure
  from flat text with heuristics.

Guards:

- `backend/tests/test_cv_artifact_golden.py` pins the failure shape: `₹`
  survives both renderers, skills line stays one paragraph/line, bullets are
  never split at extraction positions, and the legacy route stays deleted.
- `backend/tests/test_cv_pdf_html.py` keeps the sheet stylesheet + Geist fonts
  byte-synced between frontend and backend.

## Consequences

- One renderer to improve: templates, fonts, spacing, new sections reach every
  download surface (playground export, master panel, onboarding one-tap)
  automatically.
- The one-tap download now requires a structured CV (`cv_structured`). As of
  2026-07-03, 0 of 364 `cv_versions` rows lack it; a version without
  renderable structure disables the button rather than downgrading to a
  mangled artifact.
- Server render unavailability degrades to the browser's native print of the
  same sheet (still WYSIWYG) where a sheet is visible, or a retryable error on
  hidden-sheet surfaces — never to a different renderer.
