import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()

function read(path: string) {
  return readFileSync(join(frontendRoot, path), "utf8")
}

test("login modal avoids explanatory saved-work subtitles", () => {
  const source = read("components/auth/signup-modal.tsx")

  assert.doesNotMatch(source, /Pick up where you left off/)
  assert.doesNotMatch(source, /CV versions, scores, and saved jobs/)
  assert.doesNotMatch(source, /Right where you left it/)
})

test("returning-user auth surfaces stay form-first", () => {
  const loginPage = read("app/login/page.tsx")
  const signupModal = read("components/auth/signup-modal.tsx")

  assert.doesNotMatch(loginPage, /subtitle=/)
  assert.doesNotMatch(loginPage, /SampleReadout/)
  assert.match(signupModal, /\{!isLogin && \(\s*<aside/)
  assert.doesNotMatch(signupModal, /Your hub/)
})

test("signup auth copy stays short before the user acts", () => {
  const signupPage = read("app/signup/signup-route.tsx")
  const signupModal = read("components/auth/signup-modal.tsx")

  assert.doesNotMatch(signupPage, /One account, everything/)
  assert.doesNotMatch(signupModal, /One account, everything/)
  assert.doesNotMatch(signupModal, /live job descriptions and score it 0-100 across 10 career domains/)
  assert.doesNotMatch(signupModal, /One master CV branches into tailored copies per role/)
  assert.doesNotMatch(signupModal, /Myro tells you which skills to close/)
})

test("cv prerequisite copy avoids long explanations before the action", () => {
  const cvPage = read("app/(authed)/cv/page.tsx")
  const requiresCv = read("components/empty/RequiresCV.tsx")
  const marketPage = read("app/(authed)/market/page.tsx")

  assert.doesNotMatch(cvPage, /32,000\+ recognized skill types/)
  assert.doesNotMatch(requiresCv, /domain scoring, gap detection, and skill-by-skill progression insights/)
  assert.doesNotMatch(requiresCv, /Once parsing completes, this page will show your domain gaps and progression plan/)
  assert.doesNotMatch(marketPage, /skill-to-company heatmap personalization/)
  assert.doesNotMatch(marketPage, /personalized demand mapping/)
})
