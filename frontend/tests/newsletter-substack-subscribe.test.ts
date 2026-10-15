import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { substackSubscribeHref } from "../lib/newsletter/substack-subscribe"

const frontendRoot = process.cwd()

test("an unset publication URL keeps the on-site subscribe box", () => {
  assert.equal(substackSubscribeHref(undefined), null)
  assert.equal(substackSubscribeHref(""), null)
  assert.equal(substackSubscribeHref("   "), null)
  const source = readFileSync(
    join(frontendRoot, "components/newsletter/email-subscribe.tsx"),
    "utf8",
  )
  assert.match(source, /substackSubscribeHref/)
  assert.match(source, /newsletter\.subscribe/)
  assert.match(source, /NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL/)
})

test("a configured publication sends the reader to that Substack list", () => {
  assert.equal(
    substackSubscribeHref("https://letters.example.com"),
    "https://letters.example.com/subscribe",
  )
  assert.equal(
    substackSubscribeHref("https://letters.example.com/"),
    "https://letters.example.com/subscribe",
  )
})

test("himyro.substack.com is not the Myro hiring list", () => {
  assert.equal(substackSubscribeHref("https://himyro.substack.com"), null)
  assert.equal(substackSubscribeHref("https://HIMYRO.substack.com/"), null)
})

test("a non-https publication URL is refused", () => {
  assert.throws(
    () => substackSubscribeHref("http://letters.example.com"),
    /https/,
  )
})
