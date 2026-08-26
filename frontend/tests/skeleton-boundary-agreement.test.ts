/**
 * A route boundary's skeleton must be the one its page renders.
 *
 * Next.js paints `loading.tsx` first, then the page mounts and paints its own
 * bootstrap skeleton. If those two are different components the user watches
 * one shape relayout into another — the "double loading screen". The second is
 * the only one shaped like where they are going, so the first is pure noise.
 *
 * Two branches disagreed for months and nothing caught it:
 *
 *   /home    boundary DashboardSkeleton -> page MarketSkeleton. /home is a
 *            retired redirect stub; the boundary painted the shape of a page
 *            that no longer exists.
 *   /skills  boundary SkillsSkeleton -> page PracticeSkeleton. /skills is the
 *            score map; nothing on it is a stat tile.
 *
 * tsc cannot see this — both sides are well-typed. Lint cannot see it — both
 * components are used. Only the pairing is wrong, so only a test that reads the
 * pairing can fail.
 *
 * Verified to fail: flipping the /skills branch back to SkillsSkeleton fails
 * this test.
 */
import { strict as assert } from "node:assert"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const ROOT = join(__dirname, "..")
const SKELETONS = join(ROOT, "components/loading/page-skeletons.tsx")

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

/** `if (pathname.startsWith("/x")) return <YSkeleton />` -> { "/x": "YSkeleton" } */
function routingTable(): Record<string, string> {
  const src = stripComments(readFileSync(SKELETONS, "utf8"))
  const body = src.slice(src.indexOf("export function skeletonForPath"))
  const table: Record<string, string> = {}
  for (const m of body.matchAll(
    /pathname\.startsWith\("([^"]+)"\)\)\s*return\s*<(\w+)\s*\/>/g,
  )) {
    table[m[1]] = m[2]
  }
  return table
}

/** Every `<XSkeleton />` a page renders, from its own source. */
function skeletonsRenderedBy(pageFile: string): Set<string> {
  const src = stripComments(readFileSync(pageFile, "utf8"))
  return new Set(Array.from(src.matchAll(/<(\w*Skeleton)\s*\/>/g), (m) => m[1]))
}

// Routes whose page.tsx sits directly under app/(authed)/<segment>/page.tsx.
// /cv is excluded here and asserted separately below: it has THREE destinations
// behind one pathname, so its agreement is "every boundary calls the same
// picker", not "one component matches one route".
const AUTHED = ["market", "intel", "skills", "practice", "preparations", "collections", "home"]

test("every route boundary paints the skeleton its page paints", () => {
  const table = routingTable()
  const mismatches: string[] = []

  for (const segment of AUTHED) {
    const route = `/${segment}`
    const boundary = table[route]
    if (!boundary) continue

    const page = join(ROOT, "app/(authed)", segment, "page.tsx")
    let rendered: Set<string>
    try {
      rendered = skeletonsRenderedBy(page)
    } catch {
      continue // no page.tsx at that exact path
    }
    if (rendered.size === 0) continue

    if (!rendered.has(boundary)) {
      mismatches.push(
        `${route}: boundary paints <${boundary} />, page paints ${[...rendered]
          .map((n) => `<${n} />`)
          .join(" or ")}`,
      )
    }
  }

  assert.deepEqual(mismatches, [], `\n  ${mismatches.join("\n  ")}\n`)
})

test("page-skeletons exports nothing that no one renders", () => {
  const src = readFileSync(SKELETONS, "utf8")
  const exported = Array.from(
    src.matchAll(/export function (\w*Skeleton)\(/g),
    (m) => m[1],
  )

  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx?|mjs)$/.test(entry.name)) files.push(full)
    }
  }
  for (const dir of ["app", "components", "lib"]) walk(join(ROOT, dir))

  const orphans = exported.filter((name) => {
    const pattern = new RegExp(`<${name}\\s*/>`)
    return !files.some((f) => {
      if (f === SKELETONS) {
        // Its own definition does not count; a render inside skeletonForPath does.
        const body = readFileSync(f, "utf8")
        const at = body.indexOf("export function skeletonForPath")
        return at >= 0 && pattern.test(body.slice(at))
      }
      return pattern.test(readFileSync(f, "utf8"))
    })
  })

  assert.deepEqual(
    orphans,
    [],
    `these skeletons are rendered nowhere: ${orphans.join(", ")}`,
  )
})

test("/cv boundaries all defer to the one route picker", () => {
  // /cv has three destinations behind one pathname — the library, the
  // workstation (?jobId / ?edit=1) and the export document. f00bf6fd made
  // loading.tsx and the page agree on the workstation and left the other two
  // open, which is how a baseline-shaped skeleton kept flashing between two
  // workstation-shaped ones. CVRouteSkeleton is the single answer; nothing on
  // this route may reach into page-skeletons for a different one.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) {
        const src = stripComments(readFileSync(full, "utf8"))
        if (/from "@\/components\/loading\/page-skeletons"/.test(src)) {
          offenders.push(full.slice(ROOT.length + 1))
        }
      }
    }
  }
  walk(join(ROOT, "app/(authed)/cv"))

  assert.deepEqual(
    offenders,
    [],
    `these /cv files import a generic page skeleton instead of a CV mirror: ${offenders.join(", ")}`,
  )
})

test("every CV destination has exactly one mirror", () => {
  const picker = join(
    ROOT,
    "components/loading/route-loading/skeleton-mirrors/cv-route-skeleton.tsx",
  )
  const src = stripComments(readFileSync(picker, "utf8"))
  for (const mirror of ["CVBaselineSkeleton", "CVWorkstationSkeleton", "CVExportSkeleton"]) {
    assert.ok(
      new RegExp(`<${mirror}\\s*/>`).test(src),
      `CVRouteSkeleton never returns <${mirror} /> — a destination lost its shape`,
    )
  }
})
