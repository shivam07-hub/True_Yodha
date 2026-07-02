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
  assert.match(issueCta, /const href = `\/cv-preview\?role=\$\{encodeURIComponent\(role\)\}&utm_source=newsletter&utm_campaign=\$\{encodeURIComponent\(issueSlug\)\}`/)
  assert.doesNotMatch(issueCta, /const href = `\/signup\?role=/)
})
