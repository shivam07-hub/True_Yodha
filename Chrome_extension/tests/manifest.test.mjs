import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.json"), "utf8"))
const popupJs = readFileSync(join(root, "src", "popup.js"), "utf8")

describe("manifest", () => {
  // 0.2.5 swapped options_page for the background worker by accident: every
  // Settings button calls openOptionsPage(), which rejects without it.
  it("declares the options page the popup's Settings buttons open", () => {
    assert.match(popupJs, /openOptionsPage\(\)/)
    assert.equal(manifest.options_page, "options.html")
    assert.ok(existsSync(join(root, "public", manifest.options_page)))
  })

  it("runs the form walk in the background worker", () => {
    assert.equal(manifest.background?.service_worker, "src/background.js")
    assert.equal(manifest.background?.type, "module")
  })
})
