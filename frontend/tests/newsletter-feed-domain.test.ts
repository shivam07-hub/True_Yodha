import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(process.cwd(), "..")

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8")
}

test("newsletter feeds use the canonical himyro.com domain", () => {
  const generator = read("scripts/newsletter-feed.ts")
  const rss = read("frontend/public/newsletter/rss.xml")
  const jsonFeed = read("frontend/public/newsletter/feed.json")

  for (const source of [generator, rss, jsonFeed]) {
    assert.match(source, /https:\/\/www\.himyro\.com/)
    assert.doesNotMatch(source, /truemirror\.vercel\.app/)
  }
})
