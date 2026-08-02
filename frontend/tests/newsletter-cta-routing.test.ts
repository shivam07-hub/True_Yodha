import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("newsletter score CTAs send users to the free CV preview before signup", () => {
  const issuePage = read("app/newsletter/[slug]/page.tsx")
  const issueCta = read("components/newsletter/issue-cta.tsx")

  assert.match(issuePage, /Get my free Myro Score/)
  assert.match(issuePage, /href=\{`\/cv-preview\?utm_source=newsletter&utm_campaign=\$\{encodeURIComponent\(issue\.slug\)\}`\}/)
  assert.doesNotMatch(issuePage, /href=\{`\/signup\?utm_source=newsletter/)

  assert.match(issueCta, /Get my free Myro Score/)
  // The CTA became auth-aware (authed readers already have a CV + score, so
  // they go to /skills rather than the anon scorer). The tracked anon URL is
  // still the contract — it just moved into the ternary's else branch, which
  // is what pinned this assertion to `const href = \`/cv-preview...\``.
  assert.match(issueCta, /`\/cv-preview\?role=\$\{encodeURIComponent\(role\)\}&utm_source=newsletter&utm_campaign=\$\{encodeURIComponent\(issueSlug\)\}`/)
  assert.match(issueCta, /isAuthed\s*\n?\s*\?\s*"\/skills"/, "authed readers should skip the anon scorer")
  assert.doesNotMatch(issueCta, /const href = `\/signup\?role=/)
})
