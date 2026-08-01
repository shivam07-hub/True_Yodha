/**
 * CV artifact fidelity — the gate that guards the only object an employer reads.
 *
 * Myro's stated purpose is that a user comes here and leaves with a CV that gets
 * them hired. Everything else — score, matches, coins — is scaffolding to that.
 * Yet the scoring engine carried 100% coverage while the artifact's own content
 * had none, which is how a real user downloaded three CVs whose header read
 * `[REDACTED_CV_HEADER]`, whose PROFILE section had silently vanished, and whose
 * education line read `2025 – 2029Application`.
 *
 * The rule this pins: **nothing the user wrote may disappear between their CV
 * and the sheet we render.** Not the name, not a role, not a date, not a
 * location, not a bullet, not a section. If a field exists in `CVStructured` and
 * is not explicitly hidden, it must appear in the rendered artifact.
 *
 * Shape-driven, not person-driven: the fixture reproduces the structures that
 * actually broke (a long degree that wraps beside its date column, per-role
 * locations, multi-bullet roles) without carrying anyone's real CV into the repo.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { PdfPage, type PdfPageContact } from "../components/cv/builder/pdf-page"
import type { CVStructured } from "../lib/api"

const CONTACT: PdfPageContact = {
  name: "Ashwini Maurya",
  title: "Data Science Student",
  location: "",
  email: "user@example.com",
  phone: "+91 7300000000",
  linkedin: "linkedin.com/in/example",
}

const CV: CVStructured = {
  contact: undefined,
  summary:
    "BS Data Science student with hands-on experience in digital operations and analytics-driven content growth.",
  experience: [
    {
      role: "Multimedia Head",
      company: "Wayanad House, IIT Madras",
      dates: "07/2025 – Present",
      location: "Chennai, India",
      bullets: [
        "Edited 15+ videos, designed 30+ posters and thumbnails, and recorded live academic sessions.",
        "Ran the promotional calendar end to end.",
      ],
    },
    {
      role: "Video Editor",
      company: "Make My Social Media",
      dates: "02/2025 – 04/2025",
      location: "Delhi, India",
      bullets: [
        "Edited 20+ advertisement and brand promotion videos for Instagram, YouTube, and Facebook.",
        "Created engaging short-form content aligned with brand goals and audience preferences.",
      ],
    },
  ],
  projects: [],
  education: [
    {
      institution: "Indian Institute of Technology, Madras",
      // The long degree that wrapped around its own date column and produced
      // `2025 – 2029Application` in a real download.
      degree: "Bachelor of Science - BS, Data Science and Application",
      dates: "2025 – 2029",
      grade: "",
      location: "E-learning",
    },
  ],
  skills_line: "Python, SQL, NumPy, Pandas, Matplotlib, Scikit-learn, Git & GitHub",
  certs: ["Article Contest 2.0, Wayanad House (IITM)"],
}

function render(cv: CVStructured = CV, hidden = new Set<string>()): string {
  return renderToStaticMarkup(<PdfPage cv={cv} hidden={hidden} contact={CONTACT} />)
}

/** Rendered markup with tags stripped and entities decoded — what a reader (or
 *  an ATS) actually receives. `&` renders as `&amp;`, so a raw markup substring
 *  check would fail on "Git & GitHub" for a reason the user never sees. */
function renderedText(cv: CVStructured = CV): string {
  return render(cv)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/\s+/g, " ")
}

test("the user's name reaches the sheet", () => {
  assert.match(renderedText(), /Ashwini Maurya/)
})

test("no redaction marker can reach an artifact", () => {
  assert.doesNotMatch(render(), /REDACTED/i)
})

test("every experience role, company and date survives", () => {
  const text = renderedText()
  for (const role of CV.experience) {
    assert.ok(text.includes(role.role), `role missing: ${role.role}`)
    assert.ok(text.includes(role.company), `company missing: ${role.company}`)
    assert.ok(text.includes(role.dates), `dates missing: ${role.dates}`)
  }
})

test("every role location survives", () => {
  // Recruiters filter on location. `CVStructured.experience[].location` was
  // populated by the parser and then silently dropped by the composer.
  const text = renderedText()
  for (const role of CV.experience) {
    assert.ok(text.includes(role.location), `location missing: ${role.location}`)
  }
})

test("every bullet survives", () => {
  const text = renderedText()
  for (const role of CV.experience) {
    for (const bullet of role.bullets) {
      assert.ok(text.includes(bullet), `bullet missing: ${bullet.slice(0, 40)}…`)
    }
  }
})

test("education keeps institution, full degree, dates and location", () => {
  const text = renderedText()
  const edu = CV.education[0]
  assert.ok(text.includes(edu.institution), "institution missing")
  assert.ok(text.includes(edu.degree), "degree missing or truncated")
  assert.ok(text.includes(edu.dates), "dates missing")
  assert.ok(text.includes(edu.location), "education location missing")
})

test("a wrapping degree never interleaves with its date column", () => {
  // `2025 – 2029Application`: a flex row let the long left column wrap *around*
  // the right-aligned date, so the reading order spliced the date into the middle
  // of the degree. The date must not sit between two fragments of the degree.
  const text = renderedText()
  const degreeAt = text.indexOf(CV.education[0].degree)
  assert.ok(degreeAt >= 0, "degree not contiguous — it was split by another field")
})

test("summary and skills sections survive", () => {
  const text = renderedText()
  assert.ok(text.includes(CV.summary!), "summary missing")
  assert.ok(text.includes(CV.skills_line!), "skills line missing")
  assert.ok(text.includes(CV.certs[0]), "certification missing")
})

test("bullets carry a real marker character, not a CSS-drawn one", () => {
  // `list-style: disc` paints the marker outside the text layer, so an extracted
  // PDF cannot tell a new bullet from a wrapped continuation line — which is
  // exactly what an ATS reads.
  const markup = render()
  const markers = markup.match(/•/g) ?? []
  const bulletCount = CV.experience.reduce((n, r) => n + r.bullets.length, 0)
  assert.equal(markers.length, bulletCount, "every bullet needs a literal marker glyph")
})

test("hidden items are the only thing allowed to disappear", () => {
  const bulletsShown = (markup: string) =>
    CV.experience.flatMap(r => r.bullets).filter(b => markup.includes(b)).length
  assert.equal(bulletsShown(render()), 4)
})
