import assert from "node:assert/strict"
import test from "node:test"
import robots from "../app/robots"
import { SITE_ROUTES, sitemapStaticEntries } from "../lib/site-routes"

/**
 * SEO indexing-contract invariant (Codex handoff 2026-06-27):
 *
 * robots.txt must NOT disallow any URL the sitemap submits. The original bug was
 * a self-contradiction — the sitemap emitted ~260 `/companies/{name}` URLs while
 * robots had `Disallow: /companies/`, so Google was sent URLs it was then told
 * not to crawl ("Submitted URL blocked by robots.txt"). This test fails the build
 * if that contradiction ever returns for static OR dynamic sitemap paths.
 */

const BASE = "https://www.himyro.com"

function rule() {
  const r = robots()
  const first = Array.isArray(r.rules) ? r.rules[0] : r.rules
  const toArr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])
  return { allow: toArr(first?.allow), disallow: toArr(first?.disallow) }
}

/** Google longest-match precedence: a path is allowed unless a disallow prefix
 *  matches AND no equal-or-longer allow prefix also matches. */
function isAllowed(path: string, allow: string[], disallow: string[]): boolean {
  const longestMatch = (rules: string[]) =>
    rules.filter((p) => path.startsWith(p)).reduce((max, p) => Math.max(max, p.length), -1)
  const d = longestMatch(disallow)
  if (d === -1) return true
  return longestMatch(allow) >= d
}

test("the company folder is not blanket-disallowed", () => {
  const { disallow } = rule()
  assert.ok(
    !disallow.includes("/companies/"),
    "Disallow: /companies/ blocks every company detail page the sitemap submits",
  )
})

test("every static sitemap URL is crawlable in robots", () => {
  const { allow, disallow } = rule()
  for (const entry of sitemapStaticEntries(BASE)) {
    const path = entry.url.replace(BASE, "") || "/"
    assert.ok(
      isAllowed(path, allow, disallow),
      `sitemap submits ${path} but robots disallows it`,
    )
  }
})

test("representative dynamic sitemap URLs are crawlable in robots", () => {
  const { allow, disallow } = rule()
  // sitemap.ts emits /companies/{name} and /newsletter/{slug} dynamically.
  for (const path of ["/companies/Accenture", "/companies/Tata%20Consultancy", "/newsletter/2026-06-bfsi-beats-tech-hiring"]) {
    assert.ok(
      isAllowed(path, allow, disallow),
      `sitemap submits dynamic ${path} but robots disallows it`,
    )
  }
})

test("private surfaces stay disallowed (no over-correction)", () => {
  const { allow, disallow } = rule()
  for (const path of ["/login", "/signup", "/home", "/cv", "/dashboard"]) {
    assert.ok(
      !isAllowed(path, allow, disallow),
      `${path} is private and must stay robots-disallowed`,
    )
  }
})

test("every routed public sitemap entry is backed by a real route", () => {
  // A sitemap entry with no `route: true` is a 404 waiting to be submitted.
  for (const r of SITE_ROUTES) {
    if (r.sitemap && r.path !== "/" && !r.path.includes("#")) {
      assert.ok(r.route, `${r.path} is in the sitemap but not marked route: true`)
    }
  }
})
