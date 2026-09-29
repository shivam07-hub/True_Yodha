/**
 * The core loop's hand-off: tailor → download → apply. On 2026-09-29, 10 of 12
 * CVs tailored in the last 30 days never got an Apply click, and 5 of those
 * jobs have since closed. The editor kept Apply as a ghost after the download,
 * so the step that came next was the quietest thing on screen.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { PlaygroundHeader } from "../components/cv/builder/playground-header"

type Extra = { secondaryLeads?: boolean; secondaryDisabled?: boolean; lead?: boolean }

function render({ secondaryLeads, secondaryDisabled, lead }: Extra): string {
  return renderToStaticMarkup(
    <PlaygroundHeader
      jobTitle="Data Analyst"
      company="Acme"
      reqCount={4}
      ready={72}
      delta={0}
      canApply
      applyHint="Download this CV"
      saveState=""
      primaryLabel="Download CV"
      secondaryLabel="Apply"
      onSecondary={() => {}}
      secondaryDisabled={secondaryDisabled}
      secondaryLeads={secondaryLeads}
      leadLabel={lead ? "Tailor with Mentor" : undefined}
      onLead={lead ? () => {} : undefined}
      onBack={() => {}}
      onReqPill={() => {}}
      onApply={() => {}}
      onDownload={() => {}}
    />,
  )
}

/** The label of every button carrying the one accent. */
function accented(markup: string): string[] {
  return [...markup.matchAll(/class="cvb-v2-applybtn"[^>]*>([^<]+)/g)].map(m => m[1].trim())
}

test("before a download, Download carries the one accent", () => {
  assert.deepEqual(accented(render({})), ["Download CV"])
})

test("once the downloaded file is this sheet, Apply carries it", () => {
  assert.deepEqual(accented(render({ secondaryLeads: true })), ["Apply"])
})

test("after a download Apply outranks the Mentor door too — one accent, never two", () => {
  assert.deepEqual(accented(render({ lead: true })), ["Tailor with Mentor"])
  assert.deepEqual(accented(render({ lead: true, secondaryLeads: true })), ["Apply"])
})

test("a disabled Apply (no link yet) never takes the accent", () => {
  assert.deepEqual(accented(render({ secondaryLeads: true, secondaryDisabled: true })), ["Download CV"])
})

test("the editor hands Apply the accent only while the sheet matches the file", () => {
  const view = readFileSync(new URL("../components/cv/builder/playground-view.tsx", import.meta.url), "utf8")
  assert.match(view, /secondaryLeads=\{downloadedSheet === sheetKey && !!applyHref\}/)
  // The key is built from every input PdfPage draws, the headings included.
  assert.match(view, /cv, Array\.from\(hiddenItems\)\.sort\(\), sectionOrder, sectionTitles, pdfContact, m\.company,/)
  // Both download surfaces record the sheet they exported, captured before the await.
  assert.match(view, /const exported = sheetKey/)
  assert.equal(view.match(/setDownloadedSheet\(exported\)/g)?.length, 2)
})
