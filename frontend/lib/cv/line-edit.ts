/**
 * line-edit — replace ONE line's text inside a structured CV.
 *
 * The projection model needs this because a reword on a job's paper belongs to
 * THAT job's working draft, not to the living master: JD phrasing that lands on
 * the master rides into every other tailored copy (the Oracle master-pollution
 * defect, CV Weave lock L3). The gesture is symmetric on purpose — the paper's
 * undo stack replays it as (newText, oldText).
 *
 * Matching is exact on trimmed text, first occurrence, in render order. No match
 * → null, and the caller leaves the CV alone rather than guessing which line the
 * user meant.
 */
import type { CVStructured } from "@/lib/api"

/** Sections a line edit may touch. Identity and education are shaped records,
 *  edited on their own surfaces — not free text on the paper. */
function replaceIn(list: string[], oldText: string, newText: string): string[] | null {
  const at = list.findIndex(b => b.trim() === oldText)
  if (at < 0) return null
  const next = [...list]
  next[at] = newText
  return next
}

/** The CV with `oldText` rewritten to `newText`, or null when the line is not on
 *  it. Never mutates the input. */
export function replaceLineText(
  cv: CVStructured,
  rawOld: string,
  rawNew: string,
): CVStructured | null {
  const oldText = (rawOld ?? "").trim()
  const newText = (rawNew ?? "").trim()
  if (!oldText || !newText || oldText === newText) return null

  if ((cv.summary ?? "").trim() === oldText) return { ...cv, summary: newText }

  for (let i = 0; i < cv.experience.length; i++) {
    const bullets = replaceIn(cv.experience[i].bullets ?? [], oldText, newText)
    if (bullets) {
      const experience = [...cv.experience]
      experience[i] = { ...experience[i], bullets }
      return { ...cv, experience }
    }
  }

  for (let i = 0; i < cv.projects.length; i++) {
    const bullets = replaceIn(cv.projects[i].bullets ?? [], oldText, newText)
    if (bullets) {
      const projects = [...cv.projects]
      projects[i] = { ...projects[i], bullets }
      return { ...cv, projects }
    }
  }

  if ((cv.skills_line ?? "").trim() === oldText) return { ...cv, skills_line: newText }

  const certs = replaceIn(cv.certs ?? [], oldText, newText)
  if (certs) return { ...cv, certs }

  return null
}

/** A role identified by what it IS, not where it sits. The job draft and the
 *  master can hold the same roles in different order (a paper reorder is a job
 *  projection), so an index from one is not an index into the other. */
export interface RoleRef {
  company: string
  role: string
}

export function roleRefAt(cv: CVStructured, index: number): RoleRef | null {
  const exp = cv.experience[index]
  return exp ? { company: exp.company ?? "", role: exp.role ?? "" } : null
}

function sameRole(a: RoleRef, b: RoleRef): boolean {
  const norm = (s: string) => s.trim().toLowerCase()
  return norm(a.company) === norm(b.company) && norm(a.role) === norm(b.role)
}

/** Append a remembered point to its role. Matches the role by identity and falls
 *  back to the last role when this CV does not hold it — a point the user just
 *  remembered is never dropped for want of a home. */
export function addBulletToRole(cv: CVStructured, ref: RoleRef, text: string): CVStructured {
  const line = (text ?? "").trim()
  if (!line || cv.experience.length === 0) return cv
  const at = cv.experience.findIndex(e =>
    sameRole({ company: e.company ?? "", role: e.role ?? "" }, ref))
  const target = at >= 0 ? at : cv.experience.length - 1
  const experience = [...cv.experience]
  experience[target] = {
    ...experience[target],
    bullets: [...(experience[target].bullets ?? []), line],
  }
  return { ...cv, experience }
}
