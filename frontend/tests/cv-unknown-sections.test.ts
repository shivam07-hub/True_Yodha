import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { unknownSections } from "../lib/cv-compose"

const PREVIOUS = `
LEADERSHIP ROLES
• Led the club

EXPERIENCE
Intern · Capgemini · 2020 – 2022
• Did the work.

CERTIFICATIONS & ACHIEVEMENTS
• AWS associate
`

describe("unknown CV sections", () => {
  it("keeps headings the seven keys cannot hold, in order", () => {
    const kept = unknownSections(PREVIOUS)
    assert.ok(kept.indexOf("LEADERSHIP ROLES") < kept.indexOf("CERTIFICATIONS & ACHIEVEMENTS"))
    assert.match(kept, /Led the club/)
    assert.match(kept, /AWS associate/)
    assert.equal(kept.includes("EXPERIENCE"), false)
    assert.equal(kept.includes("Did the work."), false)
  })
})
