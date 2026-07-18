import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("..", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

test("AppShell owns CV upload lifecycle reconciliation across navigation", () => {
  const shell = read("components/app-shell.tsx")
  assert.match(shell, /CVUploadLifecycleObserver/)
})

test("CV page stops awaiting terminal analysis before releasing navigation", () => {
  const page = read("app/(authed)/cv/page.tsx")
  assert.match(page, /beginCVUpload/)
  assert.match(page, /CV_UPLOAD_PROGRESS_EVENT/)
  assert.match(page, /CV_UPLOAD_TERMINAL_EVENT/)
})

test("notification bell routes lifecycle rows through their durable action URL", () => {
  const bell = read("components/nav/notification-bell.tsx")
  assert.match(bell, /n\.action_url/)
  assert.match(bell, /cv_analysis/)
})
