import test from "node:test"
import assert from "node:assert/strict"

import { proofTier, countProof, PROOF_TIER_COPY } from "../lib/cv/skill-proof"

// ── none: the tier that must never be wrong ───────────────────────────────────

test("none: empty or missing evidence", () => {
  assert.equal(proofTier("", "Data Science"), "none")
  assert.equal(proofTier("   ", "Data Science"), "none")
  assert.equal(proofTier(null, "Data Science"), "none")
  assert.equal(proofTier(undefined, "Data Science"), "none")
})

test("none: evidence is an echo of the skill name (the 566-row prod bug)", () => {
  // Verbatim rows sampled from prod user_skills.
  assert.equal(proofTier("Data Science", "Data Science"), "none")
  assert.equal(proofTier("Channel Management", "Channel Management"), "none")
  assert.equal(proofTier("Power BI", "Power BI"), "none")
  assert.equal(proofTier("Time Management", "Time Management"), "none")
})

test("none: echo survives case and punctuation drift", () => {
  assert.equal(proofTier("Data analysis", "Data Analysis"), "none")
  assert.equal(proofTier("creativity", "Creativity"), "none")
  assert.equal(proofTier("  Content editing. ", "Content Editing"), "none")
})

test("none: taxonomy parentheses are our vocabulary, not the candidate's", () => {
  assert.equal(proofTier("Python", "Python (Programming Language)"), "none")
  assert.equal(proofTier("Git", "Git (Version Control System)"), "none")
})

test("none: a lone qualifier is not a claim about work", () => {
  assert.equal(proofTier("Python (Learning)", "Python (Programming Language)"), "none")
  assert.equal(proofTier("Tally ERP 9", "Tally ERP"), "none")
})

// ── listed: real CV text that evidences naming, not doing ─────────────────────

test("listed: labelled keyword lines", () => {
  assert.equal(proofTier("Tools: Git, VS Code", "VS Code"), "listed")
  assert.equal(proofTier("Programming: C, C++, Java, Python", "C++ (Programming Language)"), "listed")
  assert.equal(proofTier("SOFT SKILLS: Problem Solving", "Problem Solving"), "listed")
  assert.equal(proofTier("Soft Skills: Teamwork", "Teamwork"), "listed")
})

test("listed: section-header fragments and separator lists", () => {
  assert.equal(proofTier("Skills\nPresentation", "Presentation Design"), "listed")
  assert.equal(proofTier("Git & GitHub", "Github"), "listed")
})

test("listed: a slice of the CV's own skills paragraph is exact provenance", () => {
  const line = "Python, SQL (Snowflake), Google Analytics, PowerPoint, Excel"
  // Reads like prose, but it demonstrably came out of the skills list.
  assert.equal(proofTier("Google Analytics", "Google Analytics", line), "listed")
  assert.equal(proofTier("SQL (Snowflake)", "SQL (Programming Language)", line), "listed")
})

test("listed: thin fragments stay listed — understating proof is the safe error", () => {
  assert.equal(proofTier("Used VBA", "Microsoft Excel"), "listed")
  assert.equal(proofTier("Tools & Technologies", "Github"), "listed")
})

// ── proven: a real line of work ───────────────────────────────────────────────

test("proven: achievement bullets", () => {
  assert.equal(
    proofTier("Edited 20+ advertisement and brand promotion videos", "Video Editing"),
    "proven",
  )
  assert.equal(
    proofTier(
      "Drove Finlatics' growth in India by developing the sales funnel for the simulator platform",
      "Business Development",
    ),
    "proven",
  )
  assert.equal(
    proofTier("Led a team of 20+ campus SPOCS to drive campus presence", "Team Leadership"),
    "proven",
  )
  assert.equal(
    proofTier(
      "Led Platform Transformation & reduced platform maintenance spend by ~30% through shifting from legacy to Azure infrastructure",
      "Data Engineering",
    ),
    "proven",
  )
})

test("proven: an action verb carries a short line", () => {
  assert.equal(proofTier("Developed React components", "React.js (Javascript Library)"), "proven")
})

test("proven: substantive description without a listed verb", () => {
  assert.equal(proofTier("Life Sciences partnership mapping", "Strategic Partnership"), "proven")
  assert.equal(
    proofTier("Analysed supply chain, production workflow", "Supply Chain Management"),
    "proven",
  )
})

test("a skills-line match downgrades what would otherwise read as proven", () => {
  const evidence = "Developed React components"
  assert.equal(proofTier(evidence, "React.js (Javascript Library)"), "proven")
  assert.equal(
    proofTier(evidence, "React.js (Javascript Library)", "Developed React components, Node"),
    "listed",
  )
})

// ── regressions caught by running the classifier over 70 real prod rows ───────

test("a bullet's opening verb outranks its commas", () => {
  // These were being demoted to `listed` purely because a rich bullet contains
  // two commas — understating real proof.
  assert.equal(
    proofTier(
      "Created user manuals, training guides, and process documentation for global stakeholders",
      "Technical Writing",
    ),
    "proven",
  )
  assert.equal(
    proofTier(
      "Executed audience engagement campaigns through campus outreach, promotional content, and direct communication strategies.",
      "Audience Management",
    ),
    "proven",
  )
  assert.equal(
    proofTier(
      "Oversaw logistics, timelines, and on-ground operations for performances, including national-level events.",
      "Event Planning",
    ),
    "proven",
  )
  assert.equal(
    proofTier("Designed Social Media Posts for Instagram, LinkedIn, Facebook, etc.", "Social Media Marketing"),
    "proven",
  )
})

test("the CV admitting it is a mention is believed over sentence shape", () => {
  // Reads like prose, scored as proof on prod. It says "listed" out loud.
  assert.equal(proofTier("Communication listed in Soft Skills", "Communication"), "listed")
  assert.equal(
    proofTier(
      "Passionate B.Tech student with a keen interest in content creation and social media marketing",
      "Social Media Marketing",
    ),
    "listed",
  )
  assert.equal(proofTier("mastering advanced technical frameworks in SEM", "Search Engine Marketing"), "listed")
})

test("familiarity claims about the skill itself stay unproven", () => {
  assert.equal(proofTier("Skilled in Email Marketing", "Email Marketing"), "none")
  assert.equal(proofTier("Familiar with Prompt Engineering", "Prompt Engineering"), "none")
  assert.equal(proofTier("Microsoft Excel (basic)", "Microsoft Excel"), "none")
})

// ── aggregate ─────────────────────────────────────────────────────────────────

test("countProof buckets a mixed set", () => {
  const skills = [
    { name: "Video Editing", evidence: "Edited 20+ advertisement and brand promotion videos" },
    { name: "Data Science", evidence: "Data Science" },
    { name: "Teamwork", evidence: "Soft Skills: Teamwork" },
    { name: "Power BI", evidence: null },
  ]
  const counts = countProof(skills, (s) => ({ evidence: s.evidence, name: s.name }))
  assert.deepEqual(counts, { proven: 1, listed: 1, none: 2 })
})

test("every tier has user-facing copy", () => {
  for (const tier of ["proven", "listed", "none"] as const) {
    assert.ok(PROOF_TIER_COPY[tier].label.length > 0)
    assert.ok(PROOF_TIER_COPY[tier].note.length > 0)
  }
})
