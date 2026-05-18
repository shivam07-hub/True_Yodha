import test from "node:test"
import assert from "node:assert/strict"

const cvCompose = await import("../lib/cv-compose.ts")
const { renderBaselineDisplayText } = cvCompose.renderBaselineDisplayText ? cvCompose : cvCompose.default

const structuredCv = {
  summary: "Backend engineer with production CV tooling experience.",
  education: [],
  experience: [
    {
      company: "Myro",
      role: "Software Engineer",
      dates: "2025 - Present",
      location: "",
      bullets: ["Built deterministic CV rendering for tailored job applications."],
    },
  ],
  projects: [],
  skills_line: "TypeScript, Python, Supabase",
  certs: [],
}

test("baseline display prefers persisted body text when present", () => {
  const text = renderBaselineDisplayText("Existing uploaded CV\n", structuredCv)

  assert.equal(text, "Existing uploaded CV\n")
})

test("baseline display renders structured CV when persisted body text is empty", () => {
  const text = renderBaselineDisplayText("", structuredCv)

  assert.match(text, /SUMMARY/)
  assert.match(text, /Backend engineer with production CV tooling experience\./)
  assert.match(text, /EXPERIENCE/)
  assert.match(text, /Built deterministic CV rendering/)
})

test("baseline display falls back to dash when neither source has visible text", () => {
  const text = renderBaselineDisplayText("", null)

  assert.equal(text, "—")
})
