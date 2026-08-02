import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const heatmap = readFileSync("components/market/skill-intelligence-heatmap.tsx", "utf8")
const panel = readFileSync("components/market/skill-intelligence-panel.tsx", "utf8")
const tab = readFileSync("components/market/heatmap-tab.tsx", "utf8")
const page = readFileSync("app/(authed)/market/page.tsx", "utf8")
const jobsTab = readFileSync("components/market/jobs-tab.tsx", "utf8")

test("skill intelligence heatmap leads with followed-company personalization", () => {
  // Vocabulary lock (Signal Thread S1): "track" is what the engine does,
  // "follow" is what the user does. The rail label moved Tracked → Followed and
  // the "We track what skills companies are hiring for." line was dropped, both
  // deliberately. Asserting the new word AND the absence of the old one keeps
  // the lock enforced instead of merely re-pinning whatever the copy says now.
  assert.match(heatmap, /companies tracked/)
  assert.match(heatmap, /Followed companies/)
  assert.doesNotMatch(heatmap, /Tracked companies/, "user-side surfaces say 'followed', never 'tracked'")
  assert.match(heatmap, /Based on your CV skills/)
  assert.match(heatmap, /Personalise tracking/)
})

test("selected skill panel keeps learning and CV evidence actions visible", () => {
  assert.match(panel, /Skill Intelligence/)
  assert.match(panel, /Your CV evidence/)
  assert.match(panel, /Company demand/)
  assert.match(panel, /\/forge\?skill=/)
  assert.match(panel, /\/cv\?skill=/)
  assert.match(panel, /Practice/)
  assert.match(panel, /Improve CV proof/)
  assert.match(panel, /View jobs/)
})

test("heatmap tab uses real user skills and hands selected skills back to jobs", () => {
  assert.match(tab, /users\.mySkills/)
  assert.match(tab, /jobs\.analyticsForMe/)
  assert.match(tab, /trackedCompanyTotal/)
  // The handoff stopped being local component state: the heatmap moved to
  // /intel and the selected skill now travels as a URL param, so the facet
  // survives a reload and a cross-surface jump. `setJobSkillFacet(skill)` no
  // longer exists — the contract is read-from-URL, write-back-to-URL.
  assert.match(page, /searchParams\.get\("skill"\)/, "selected skill should be read off the URL")
  assert.match(page, /updateBrowse\(\{ skill \}\)/, "selecting a skill should write back to the URL")
  assert.match(jobsTab, /initialSkillFacet/)
})
