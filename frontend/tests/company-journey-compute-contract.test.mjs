import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(new URL("../app/companies/[slug]/page.tsx", import.meta.url), "utf8")
const client = readFileSync(
  new URL("../components/companies/company-jobs-client.tsx", import.meta.url),
  "utf8",
)
const comments = readFileSync(
  new URL("../components/comments/comment-thread.tsx", import.meta.url),
  "utf8",
)

test("company first render spends compute only on crawlable J0 truth", () => {
  assert.match(page, /getCompanyJobs\(companyName\)/)
  assert.match(page, /getCompanyNotes\(companyName\)/)
  assert.doesNotMatch(page, /getCompanySkillIntelligence/)
  assert.doesNotMatch(page, /getPostingNotes/)
})

test("secondary company signals require specific user intent", () => {
  const skillDemand = readFileSync(
    new URL("../components/companies/company-skill-demand-panel.tsx", import.meta.url),
    "utf8",
  )
  const postingNotes = readFileSync(
    new URL("../components/companies/company-posting-notes-panel.tsx", import.meta.url),
    "utf8",
  )
  assert.match(skillDemand, /enabled: showSkillIntelligence/)
  assert.match(skillDemand, /onClick=\{\(\) => setShowSkillIntelligence\(true\)\}/)
  assert.match(postingNotes, /enabled: showPostingNotes/)
  assert.match(postingNotes, /onClick=\{\(\) => setShowPostingNotes\(true\)\}/)
  assert.doesNotMatch(skillDemand, /requestIdleCallback|pointerdown|scroll/)
  assert.doesNotMatch(postingNotes, /requestIdleCallback|pointerdown|scroll/)
  assert.doesNotMatch(client, /requestIdleCallback|pointerdown|scroll/)
})

test("company skill demand uses the public read and a brand retry CTA", () => {
  const skillDemand = readFileSync(
    new URL("../components/companies/company-skill-demand-panel.tsx", import.meta.url),
    "utf8",
  )
  assert.match(skillDemand, /publicRead/)
  assert.match(skillDemand, /variant="solid"[\s\S]*Try again/)
  assert.match(skillDemand, /No skill-demand snapshot is available yet/)
  assert.match(client, /CompanySkillDemandPanel/)
  assert.match(client, /publicRead/)
  assert.match(page, /publicRead/)
})

test("the public company journey observes auth without requiring it", () => {
  assert.match(client, /useSession\(\)/)
  assert.doesNotMatch(client, /useAuth\(\)/)
})

test("anonymous comments reuse the server seed", () => {
  assert.match(comments, /refetchOnMount: false/)
  assert.match(comments, /if \(!initialData \|\| !token/)
  assert.doesNotMatch(comments, /initialDataUpdatedAt: 0/)
})
