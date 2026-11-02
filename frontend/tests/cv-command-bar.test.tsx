/**
 * The CV entry page's command bar. Edit fills the paper width.
 * Download is the existing pair: PDF and DOCX.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CvCommandBar } from "../components/cv/builder/cv-command-bar"

const actions = {
  downloadPdf: () => {},
  downloadDocx: () => {},
  pdfBusy: false,
  docxBusy: false,
  docxError: null,
}

test("the bar names the CV, an Edit that can grow, and Download", () => {
  const html = renderToStaticMarkup(
    createElement(CvCommandBar, { title: "Main CV", onEdit: () => {}, actions }),
  )
  assert.match(html, /Main CV/)
  assert.match(html, />Edit</)
  assert.match(html, />Download</)
  assert.match(html, /aria-haspopup="menu"/)
})

test("a tailored copy keeps the company on its own line", () => {
  const html = renderToStaticMarkup(
    createElement(CvCommandBar, {
      title: "Manager, Deal Advisory",
      detail: "PwC Acceleration Centres",
      onEdit: () => {},
      actions,
    }),
  )
  assert.match(html, /Manager, Deal Advisory/)
  assert.match(html, /PwC Acceleration Centres/)
  assert.equal(html.includes("·"), false)
})

test("Download opens the two files the export page already builds", () => {
  const src = readFileSync(new URL("../components/cv/builder/cv-command-bar.tsx", import.meta.url), "utf8")
  assert.match(src, /Download PDF/)
  assert.match(src, /Download DOCX/)
})

test("a failed DOCX says so beside the control", () => {
  const html = renderToStaticMarkup(
    createElement(CvCommandBar, {
      title: "Main CV",
      onEdit: () => {},
      actions: { ...actions, docxError: "Couldn't build the DOCX. Tap Download DOCX to retry." },
    }),
  )
  assert.match(html, /role="alert"/)
  assert.match(html, /build the DOCX/)
})
