import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { runContentChecks, contentPenalty } from "../components/cv/builder/content-checks"
import { buildFixes } from "../components/cv/builder/fix-model"
import { didFix, passingVariants } from "../components/cv/builder/fix-verify"
import { buildIssues } from "../components/cv/builder/issue-model"
import { CHECK_EXPLAINERS } from "../components/cv/builder/content-check-explainers"
import type { CVStructured } from "../lib/api"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function cvWith(bullets: string[]): CVStructured {
  return {
    contact: { name: "A B", title: "GTM", email: "a@b.com", phone: "1", location: "X", linkedin: "" },
    summary: "",
    experience: [{ role: "BD Manager", company: "Capgemini", dates: "2024", location: "", bullets }],
    projects: [],
    education: [],
    certs: [],
    skills_line: "",
  } as unknown as CVStructured
}

// ── the guard that would have caught the shipped defect ──────────────────────

test("a Cut whose rewrite still contains the phrase is a miss, not a variant", () => {
  const line = "Delivered €500K+ revenue by shaping India Cloud leverage B2B GTM strategy."
  const cv = cvWith([line])
  const fixes = buildFixes(cv, runContentChecks(cv, new Set()))
  const cut = fixes.find(f => f.category === "buzzword")
  assert.ok(cut, "the buzzword check must raise a fix for this line")
  assert.ok(cut.offenders.some(o => o.toLowerCase() === "leverage"))

  // This is verbatim what the server returned on 2026-08-25: the original line.
  assert.equal(didFix(cut, line), false)
  assert.equal(didFix(cut, "Delivered €500K+ revenue by shaping India Cloud B2B GTM strategy."), true)

  const variants = [{ text: line, angle: "impact", label: "Impact" }]
  assert.deepEqual(passingVariants(cut, variants), [], "a no-op must never be offered")
})

test("a weak opener only has to leave the FRONT of the line", () => {
  const cv = cvWith(["Responsible for running 40 weekly demos for finance teams."])
  const fixes = buildFixes(cv, runContentChecks(cv, new Set()))
  const verb = fixes.find(f => f.category === "weak-verb")
  assert.ok(verb)
  assert.equal(didFix(verb, "Ran 40 weekly demos for finance teams."), true)
  assert.equal(didFix(verb, "Responsible for running 40 weekly demos."), false)
  // The words may survive mid-sentence — the check fires on the opener only.
  assert.equal(didFix(verb, "Ran 40 demos while responsible for the finance patch."), true)
})

test("a Quantify is closed only by a real number", () => {
  const cv = cvWith(["Connected with clients to understand their cloud service needs."])
  const fixes = buildFixes(cv, runContentChecks(cv, new Set()))
  const q = fixes.find(f => f.category === "unquantified")
  assert.ok(q)
  assert.equal(didFix(q, "Ran cloud discovery with clients across the region."), false)
  assert.equal(didFix(q, "Ran cloud discovery with 14 accounts, converting 6."), true)
})

// ── the invariant the single-scan refactor had to preserve ───────────────────

test("dismissing a fix hides the card and never returns its points", () => {
  const cv = cvWith([
    "Connected with clients to understand their cloud service needs.",
    "Responsible for running weekly demos.",
  ])
  const all = runContentChecks(cv, new Set())
  const dismissed = new Set([all[0].id])
  const open = all.filter(f => !dismissed.has(f.id))

  assert.ok(open.length < all.length, "the dismissal must remove a card")
  assert.equal(
    contentPenalty(all) > contentPenalty(open),
    true,
    "sanity: the filtered set is cheaper — which is exactly why the score must NOT read it",
  )
  // useCvDiagnosis computes `penalty` from allFindings for this reason.
  assert.match(read("components/cv/builder/use-cv-diagnosis.ts"), /penalty:\s*contentPenalty\(allFindings\)/)
})

// ── every row can explain itself without a network call ──────────────────────

test("every issue carries a free brief", () => {
  const cv = cvWith([
    "Connected with clients to understand their cloud service needs.",
    "Responsible for running weekly demos.",
  ])
  const fixes = buildFixes(cv, runContentChecks(cv, new Set()))
  const issues = buildIssues({
    cv,
    fixes,
    atsChecks: [{ label: "Summary section present", tag: "section headings", pass: false, detail: "Summary is empty", fix: "summary" }],
  })
  assert.ok(issues.length > 0)
  for (const i of issues) {
    assert.ok(i.brief, `${i.title} has no brief`)
    assert.ok(i.brief.reasons.length > 0, `${i.title} explains nothing`)
    // The reasons must not restate the title — three layers, no repetition.
    assert.ok(
      !i.brief.reasons.includes(i.title),
      `${i.title} repeats itself in its own brief`,
    )
  }
  // Content fixes additionally carry the authored before/after.
  for (const i of issues.filter(x => x.kind === "line")) {
    assert.ok(i.brief.example?.before && i.brief.example?.after, `${i.title} has no worked example`)
  }
})

test("every content check has authored copy and a worked example", () => {
  for (const [category, e] of Object.entries(CHECK_EXPLAINERS)) {
    assert.ok(e.reasons.length > 0, `${category} has no reasons`)
    assert.ok(e.example.before.trim(), `${category} has no before`)
    assert.ok(e.example.after.trim(), `${category} has no after`)
    assert.notEqual(e.example.before, e.example.after, `${category}'s example does not change anything`)
  }
})

// ── structural ratchets: these are the ones that rot silently ────────────────

/** Source with comments stripped. A ratchet that greps raw text counts its own
 *  rationale — the mistake ANTI_SLOP item 9 is the record of. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

test("the CV is scanned exactly once per change, in one place", () => {
  // Four call sites each ran their own full scan before 2026-08-25. Each was
  // individually memoised, which is exactly why nobody noticed.
  const renderPath = [
    "components/cv/builder/fix-model.ts",
    "components/cv/builder/cv-severity.ts",
    "components/cv/builder/issue-model.ts",
    "components/cv/builder/workstation-shell.tsx",
    "components/cv/builder/use-playground-model.ts",
  ]
  for (const path of renderPath) {
    assert.doesNotMatch(
      code(path),
      /runContentChecks/,
      `${path} must derive from the findings it is given, not scan the CV again`,
    )
  }
  assert.match(code("components/cv/builder/use-cv-diagnosis.ts"), /runContentChecks\(cv, hidden\)/)
})

test("the buzzword vocabulary is compiled once, not per bullet", () => {
  const src = code("components/cv/builder/content-checks.ts")
  assert.match(src, /const BUZZWORD_RE = compileVocab\(BUZZWORDS\)/)

  // The bug was O(vocab x units): a fresh pattern per phrase per bullet, 1,620
  // of them per scan. One compile survives inside the scan — recovering the
  // casing of a repeated phrase, which is O(repetition findings) and cannot be
  // hoisted because the phrase is what varies. Pinned at one so it can't regrow.
  const scan = src.slice(src.indexOf("export function runContentChecks"))
  assert.equal(
    (scan.match(/new RegExp/g) ?? []).length,
    1,
    "runContentChecks compiles patterns while scanning — hoist them to module scope",
  )
  assert.doesNotMatch(code("components/cv/builder/content-checks.ts").slice(
    src.indexOf("function phraseHits"),
    src.indexOf("function weakOpener"),
  ), /new RegExp/, "phraseHits must use the precompiled vocabulary")
})

test("opening a fix cannot start a model call", () => {
  // CvLineRewrite fires its request in a mount effect, so the ONLY guarantee
  // that expanding a fix is free is that it stays unmounted until asked.
  const src = read("components/cv/builder/cv-line-fix.tsx")
  const beforeAsked = src.slice(0, src.indexOf("if (!asked)"))
  assert.doesNotMatch(beforeAsked, /<CvLineRewrite/)
  assert.match(src, /if \(!asked\)/)
  assert.match(src, /setAsked\(true\)/)

  // And the rail's expand must not reach the rewrite at all.
  const queue = read("components/cv/builder/cv-issue-queue.tsx")
  assert.doesNotMatch(queue, /CvLineRewrite|useLineRewrite|makeFetcher/)
})

test("the rewrite is single-flighted and drops answers after unmount", () => {
  const src = read("components/cv/builder/use-line-rewrite.ts")
  assert.match(src, /if \(inFlight\.current\) return/)
  assert.match(src, /if \(!alive\.current\) return/)

  // The liveness ref must be RE-ARMED on mount. Initialising it at useRef and
  // only clearing it in the cleanup leaves it false forever after StrictMode's
  // mount -> cleanup -> mount, so every answer is discarded and the card sits
  // on "loading" for good. Caught in the browser, not by any of the above.
  assert.match(
    src,
    /useEffect\(\(\) => \{\s*alive\.current = true\s*return \(\) => \{ alive\.current = false \}/,
    "alive must be set true inside the mount effect, not only at useRef init",
  )
})

test("the fix travels with the rewrite request", () => {
  const src = read("components/cv/builder/rewrite-fetchers.ts")
  assert.match(src, /intent: intent \?\? undefined/)
  assert.match(src, /target_phrases: opts\.fix\?\.offenders \?\? \[\]/)
})
