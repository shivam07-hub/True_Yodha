/**
 * list-markers — a bullet mark the upload copied from the person's own file.
 *
 * The parser copies bullets verbatim, so "▪ Built…" was stored and the page drew
 * its own mark in front of it: "• ▪ Built…", on the paper and in the PDF.
 * Uploads drop it since 5ad8f6cc (`cv_structured_shape._without_marker`). CVs
 * stored before that keep it until their person taps "Fix all" — nothing is
 * rewritten while they are away.
 *
 * Two implementations, one set of cases: `list-markers.cases.json`, read by a
 * test on each side, so the page cannot offer to clean what upload keeps, or
 * the other way round.
 */
import type { CVStructured } from "@/lib/api"

// A dash or asterisk counts only when a space follows it, so "–20% churn" and
// "*Nights* on call" keep their first character.
const LIST_MARKER =
  /^(?:[•‣⁃·§▪▫▸▹►▶◦●○■□◆◇❖➢➤✓✔]|[-–—*](?=\s))\s*/

/** The line with every leading copied marker removed. */
export function withoutMarker(line: string): string {
  let previous: string | null = null
  let out = line.trim()
  while (previous !== out) {
    previous = out
    out = out.replace(LIST_MARKER, "").trimStart()
  }
  return out
}

function marked(line: string): boolean {
  return withoutMarker(line) !== line.trim()
}

/** How many bullets and certifications carry a copied marker. */
export function markedLineCount(cv: CVStructured): number {
  const lines = [
    ...cv.experience.flatMap(e => e.bullets),
    ...cv.projects.flatMap(p => p.bullets),
    ...cv.certs,
  ]
  return lines.filter(marked).length
}

function clean(lines: string[]): string[] {
  return lines.map(withoutMarker).filter(line => line.length > 0)
}

/** The same CV with every copied marker gone. A line that was only a marker
 *  goes with it. Nothing else changes. */
export function stripCopiedMarkers(cv: CVStructured): CVStructured {
  return {
    ...cv,
    experience: cv.experience.map(e => ({ ...e, bullets: clean(e.bullets) })),
    projects: cv.projects.map(p => ({ ...p, bullets: clean(p.bullets) })),
    certs: clean(cv.certs),
  }
}
