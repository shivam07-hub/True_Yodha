/**
 * Spec #66 L7 (Q8): an upload that carried a landing pick opens on the gap —
 * the role's skills this CV shows and lacks, the lines the playground would
 * rewrite, and the live jobs within reach — before the playground. Seeing the
 * jobs asks for an account; fixing the CV does not (Q9).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import type { CVStructured } from "@/lib/api"
import { flaggedLines } from "@/components/public/cv-preview/flagged-lines"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function cv(bullets: string[][], summary: string | null = null): CVStructured {
  return {
    summary,
    education: [],
    experience: bullets.map((lines, i) => ({ title: `Role ${i}`, company: "Acme", dates: "2024", location: "", bullets: lines })),
    projects: [],
    skills_line: null,
    certs: [],
  } as unknown as CVStructured
}

test("the rewrite row quotes the first flagged line and counts the other lines once", () => {
  const out = flaggedLines(
    cv([
      ["Built weekly SQL sales reports for 12 regional managers", "Responsible for handling reports for the sales team"],
      ["Responsible for various synergy-driven initiatives", "Helped with things"],
    ]),
  )
  assert.ok(out)
  assert.equal(out.first, "Responsible for handling reports for the sales team")
  // Line 3 carries two findings (weak opener + buzzword): one line, not two.
  assert.ok(out.more >= 1)
  const lines = new Set(["Responsible for various synergy-driven initiatives", "Helped with things"])
  assert.ok(out.more <= lines.size)
})

test("a CV the playground would not touch has no rewrite line", () => {
  assert.equal(flaggedLines(cv([])), null)
})

test("the score carries the landing pick, and the gap opens before the playground", () => {
  const page = read("app/cv-preview/page.tsx")
  const api = read("lib/api.ts")
  assert.match(page, /publicCv\.scorePreview\(file, readPick\(\)\)/)
  assert.match(page, /publicCv\.scorePreview\(\{ text \}, readPick\(\)\)/)
  assert.match(page, /params\.get\("role"\)/)
  assert.match(page, /params\.get\("level"\)/)
  assert.match(api, /form\.append\("role", pick\.role\)/)
  assert.match(api, /if \(pick\.level\) form\.append\("level", pick\.level\)/)
  // Gap first; the playground mounts once opened and stays, so edits survive a look back.
  assert.match(page, /target && onGap \? \(\s*<RoleGap/)
  assert.match(page, /!onGap \|\| fixOpened/)
  assert.match(page, /<div hidden=\{onGap\}>/)
  assert.match(page, /onBack=\{target \? \(\) => showView\("gap"\) : undefined\}/)
  assert.match(page, /targetRole=\{target \? roleLabel\(target\.family\) : null\}/)
})

test("seeing the jobs is the sign-up door; fixing the CV is free", () => {
  const page = read("app/cv-preview/page.tsx")
  const gap = read("components/public/cv-preview/role-gap.tsx")
  assert.match(page, /onJobs=\{\(\) => signup\.open\(\{ surface: "manual", source: "cv_preview_reach" \}\)\}/)
  assert.match(page, /onFix=\{\(\) => showView\("fix"\)\}/)
  assert.match(gap, /within reach today/)
  assert.match(gap, /each names 2\+ of your skills/)
  // No reach, no jobs button: the free fix leads.
  assert.match(gap, /\{reach > 0 \? <Button onClick=\{onJobs\}>/)
  assert.match(gap, /variant=\{reach > 0 \? "outline" : "solid"\}/)
  // A level with no live listing says nothing rather than "0 of 0".
  assert.match(gap, /\{target\.jobs > 0 \? \(/)
  for (const kind of ["matched", "rewrite", "missing"]) assert.match(gap, new RegExp(`data-kind="${kind}"`))
})

test("playground rewrites aim at the picked role", () => {
  const playground = read("components/public/cv-preview/public-playground.tsx")
  assert.match(playground, /role: targetRole \|\| contact\.title \|\| null/)
  assert.match(playground, /onBack=\{onBack \?\? \(\(\) => router\.push\("\/"\)\)\}/)
})
