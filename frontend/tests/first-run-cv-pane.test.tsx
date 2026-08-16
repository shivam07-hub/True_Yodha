import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { FirstRunCvPaper } from "../components/onboarding/first-run-cv-pane"
import type { CVStructured } from "../lib/api"

const cv: CVStructured = {
  contact: {
    name: "Shivam Pathak",
    title: "IT Sales and Marketing",
    email: "shivam@example.com",
    phone: "",
    location: "Gurgaon",
    linkedin: "",
  },
  summary: "One short paragraph about who you are.",
  education: [],
  experience: [{
    company: "Capgemini GCC Growth",
    role: "GTM Business Development Manager",
    dates: "2024 — Present",
    location: "",
    bullets: ["Led a team of 20+ campus SPOCS across India"],
  }],
  projects: [],
  skills_line: "Team Leadership, Business Development",
  certs: [],
}

test("the onboarding CV paper prints the parsed roles and bullets", () => {
  const markup = renderToStaticMarkup(<FirstRunCvPaper cv={cv} />)

  assert.match(markup, /Shivam Pathak/)
  assert.match(markup, /GTM Business Development Manager/)
  assert.match(markup, /Capgemini GCC Growth/)
  assert.match(markup, /Led a team of 20\+ campus SPOCS across India/)
  assert.match(markup, /Team Leadership, Business Development/)
})
