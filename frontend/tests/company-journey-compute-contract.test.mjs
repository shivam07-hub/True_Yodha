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
  assert.match(client, /enabled: showSkillIntelligence/)
  assert.match(client, /enabled: showPostingNotes/)
  assert.match(client, /onClick=\{\(\) => setShowSkillIntelligence\(true\)\}/)
  assert.match(client, /onClick=\{\(\) => setShowPostingNotes\(true\)\}/)
  assert.doesNotMatch(client, /requestIdleCallback|pointerdown|scroll/)
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
