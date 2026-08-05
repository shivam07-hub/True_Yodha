import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const frontendRoot = process.cwd()

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("the public landing leaves newsletter subscription to the newsletter page", () => {
  const landingPage = read("components/public/landing-page.tsx")
  const newsletterPage = read("app/newsletter/page.tsx")

  assert.doesNotMatch(landingPage, /newsletter\.subscribe|NewsletterStrip|lp-news-form/)
  assert.match(newsletterPage, /<EmailSubscribe compact \/>/)
})
