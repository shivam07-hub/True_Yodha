import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const heatmap = readFileSync("components/market/skill-intelligence-heatmap.tsx", "utf8")
const panel = readFileSync("components/market/skill-intelligence-panel.tsx", "utf8")
const tab = readFileSync("components/market/heatmap-tab.tsx", "utf8")
const page = readFileSync("app/(authed)/market/page.tsx", "utf8")
const jobsTab = readFileSync("components/market/jobs-tab.tsx", "utf8")

test("skill intelligence heatmap leads with tracked-company personalization", () => {
  assert.match(heatmap, /We track what skills companies are hiring for\./)
  assert.match(heatmap, /companies tracked/)
  assert.match(heatmap, /Tracked companies/)
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
  assert.match(page, /setJobSkillFacet\(skill\)/)
  assert.match(jobsTab, /initialSkillFacet/)
})
