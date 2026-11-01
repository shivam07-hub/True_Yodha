import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("an issue carries one CTA, and it tailors a CV", () => {
  const issuePage = read("app/newsletter/[slug]/page.tsx")
  const issueCta = read("components/newsletter/issue-cta.tsx")
  const rail = read("components/newsletter/rail.tsx")

  assert.match(issuePage, /<IssueCta campaign=\{`issue-\$\{issueNum\}`\}/)
  for (const source of [issuePage, issueCta, rail]) {
    assert.doesNotMatch(source, /Myro Score/)
    assert.doesNotMatch(source, /cv-preview/)
  }

  // A first signup lands on /onboarding, the front door into the loop, so the
  // link needs no carried intent. The tags are what let signup count the issue.
  assert.match(
    issueCta,
    /`\/signup\?utm_source=newsletter&utm_medium=article&utm_campaign=\$\{encodeURIComponent\(campaign\)\}`/,
  )
  assert.match(issueCta, /isAuthed\s*\n?\s*\?\s*"\/market"/, "signed-in readers go to their jobs")
})

test("issue bodies carry no CTA of their own: the template owns it", () => {
  const dir = "content/newsletter/issues"
  for (const file of readdirSync(join(frontendRoot, dir))) {
    const body = read(join(dir, file)).split(/^---$/m).slice(2).join("---")
    assert.doesNotMatch(body, /himyro\.com\/signup|<NewsletterCTA|cv-preview/, file)
  }
})
