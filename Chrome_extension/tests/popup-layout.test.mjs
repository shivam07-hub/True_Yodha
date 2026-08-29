import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const popupHtml = readFileSync(join(root, "public", "popup.html"), "utf8")
const styles = readFileSync(join(root, "src", "styles.css"), "utf8")

describe("review layout", () => {
  it("puts the job description in the empty review pane, not in the field stack", () => {
    const fieldsAt = popupHtml.indexOf('class="review-fields"')
    const paneAt = popupHtml.indexOf('class="review-jd"')
    const jdAt = popupHtml.indexOf('id="job-description"')
    assert.ok(fieldsAt > 0 && paneAt > fieldsAt, "review pane follows the field stack")
    assert.ok(jdAt > paneAt, "job description lives inside the review pane")
    const fieldStack = popupHtml.slice(fieldsAt, paneAt)
    assert.doesNotMatch(fieldStack, /id="job-description"/)
  })
})

describe("azure brand tokens", () => {
  it("uses the live ash/azure ramp, not the retired navy/teal UI palette", () => {
    assert.match(styles, /--tm-bg:\s*#161a1c/)
    assert.match(styles, /--tm-interactive:\s*#4fc7f6/)
    assert.match(styles, /--tm-brand:\s*#00f5d4/)
    assert.doesNotMatch(styles, /--tm-bg:\s*#050a18/)
    assert.doesNotMatch(styles, /--tm-accent:\s*#00f5d4/)
    assert.doesNotMatch(styles, /rgba\(0,\s*245,\s*212/)
  })
})
