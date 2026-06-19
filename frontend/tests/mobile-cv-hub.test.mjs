import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const hub = readFileSync(new URL("../components/cv/mobile/mobile-cv-hub.tsx", import.meta.url), "utf8")
const editor = readFileSync(new URL("../components/cv/mobile/mobile-main-editor.tsx", import.meta.url), "utf8")
const bullets = readFileSync(new URL("../components/cv/mobile/mobile-bullet-list.tsx", import.meta.url), "utf8")
const exportLayout = readFileSync(new URL("../components/cv/mobile/mobile-cv-export-layout.tsx", import.meta.url), "utf8")
const editorCss = readFileSync(new URL("../components/cv/mobile/mobile-cv-editor.css", import.meta.url), "utf8")
const nav = readFileSync(new URL("../mobile/shell.tsx", import.meta.url), "utf8")
const versionFormat = readFileSync(new URL("../lib/cv/version-format.ts", import.meta.url), "utf8")
const autosave = readFileSync(new URL("../lib/hooks/use-master-autosave.ts", import.meta.url), "utf8")

test("mobile navigation exposes direct CV and Applications destinations", () => {
  assert.match(nav, /href: "\/cv\?view=cv"/)
  assert.match(nav, /href: "\/cv\?view=active"/)
  assert.match(nav, /label: "Applications"/)
})

test("CV Hub is document-first and keeps every tailored version reachable", () => {
  assert.match(hub, /<MobileDocumentPreview/)
  assert.match(hub, /> Edit CV</)
  assert.match(hub, /> Export</)
  assert.match(hub, /Your CVs/)
  assert.match(hub, /groupVersions\(versions, applications\)/)
})

test("focused editor exposes all structured sections and explicit bullet actions", () => {
  for (const section of ["contact", "summary", "experience", "projects", "skills", "education", "certifications"]) {
    assert.match(editor, new RegExp(`key: "${section}"`))
  }
  assert.match(bullets, /"Done" : "Edit"/)
  assert.match(bullets, /<BulletRewrite/)
  assert.match(editorCss, /font-size: 16px/)
})

test("mobile export uses visual templates, actionable ATS review, and explicit mark preference", () => {
  assert.match(exportLayout, /CV_TEMPLATES\.map/)
  assert.match(exportLayout, /checks passed/)
  assert.match(exportLayout, /Add Myro verification mark/)
  assert.match(exportLayout, /Download PDF/)
  assert.match(exportLayout, /Download DOCX/)
})

test("fresh and future timestamps cannot render negative relative time", () => {
  assert.match(versionFormat, /Math\.max\(0, Date\.now\(\) - t\)/)
  assert.match(versionFormat, /return "just now"/)
})

test("autosave updates Hub and preview query state immediately", () => {
  assert.match(autosave, /setQueryData\(dataKeys\.cvStructured\(\), next\)/)
})
