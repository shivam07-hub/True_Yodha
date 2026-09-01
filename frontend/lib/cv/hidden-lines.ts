/**
 * Hidden projection — lines that left the paper, keyed so chrome can restore.
 */
import type { CVStructured } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"

export interface HiddenLine {
  iid: string
  text: string
}

export function collectHiddenLines(cv: CVStructured, hidden: Set<string>): HiddenLine[] {
  const out: HiddenLine[] = []
  const push = (iid: string, text: string) => {
    if (hidden.has(iid) && text.trim()) out.push({ iid, text })
  }
  if (cv.summary) push(itemId("summary", 0, cv.summary), cv.summary)
  cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
    push(itemId("exp_bullet", ei * 100 + bi, b), b)
  }))
  cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
    push(itemId("proj_bullet", pi * 100 + bi, b), b)
  }))
  if (cv.skills_line) push(itemId("skills_line", 0, cv.skills_line), cv.skills_line)
  cv.education.forEach((ed, i) => {
    const line = [ed.institution, ed.degree, ed.dates].filter(Boolean).join(" · ")
    push(itemId("edu", i, line), line)
  })
  cv.certs.forEach((c, i) => push(itemId("cert", i, c), c))
  return out
}

export function hiddenLineTexts(cv: CVStructured, hidden: Set<string>): Set<string> {
  return new Set(collectHiddenLines(cv, hidden).map(l => l.text))
}
