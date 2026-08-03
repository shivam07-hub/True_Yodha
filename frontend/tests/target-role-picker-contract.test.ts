import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const component = readFileSync(
  resolve(process.cwd(), "components/target-role/target-roles-chips.tsx"),
  "utf8",
)
const mutation = readFileSync(
  resolve(process.cwd(), "lib/hooks/use-edit-target-role.ts"),
  "utf8",
)

test("target-role editing selects a verified corpus family", () => {
  assert.match(component, /onboarding\.roleFamilies/)
  assert.match(component, /Search roles in live jobs/)
  assert.match(component, /matching skills/)
  assert.doesNotMatch(component, /e\.g\. Product Manager/)
})

test("a picker selection saves its title and family together", () => {
  assert.match(mutation, /role_title: role\.label\.trim\(\)/)
  assert.match(mutation, /role_family: role\.family/)
})
