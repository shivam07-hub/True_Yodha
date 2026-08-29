import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const picker = read("components/target-role/role-family-picker.tsx")
const mutation = read("lib/hooks/use-edit-target-role.ts")

/** Every surface that lets someone choose the work they want. Adding one here
 *  without mounting the shared picker is the drift this file exists to stop:
 *  Myro Search took roles as FREE TEXT for months, so 34 users ended up with a
 *  title they could see and a `target_roles` scoping key nobody could fix. */
const CHOOSING_SURFACES = [
  "components/target-role/target-roles-chips.tsx",
  "components/preflight/chip-group.tsx",
]

test("the role picker offers verified corpus families", () => {
  assert.match(picker, /onboarding\.roleFamilies/)
  assert.match(picker, /Search roles in live jobs/)
  assert.match(picker, /matching skills/)
  assert.doesNotMatch(picker, /e\.g\. Product Manager/)
})

test("every surface that chooses a role mounts the same picker", () => {
  for (const path of CHOOSING_SURFACES) {
    const source = read(path)
    assert.match(source, /RoleFamilyPicker/, `${path} must choose roles, never take them as free text`)
  }
})

test("a picker selection saves its title and family together", () => {
  assert.match(mutation, /role_title: role\.label\.trim\(\)/)
  assert.match(mutation, /role_family: role\.family/)
})

test("the pre-flight carries the family it resolved onto the order", () => {
  // Without this the title reaches `target_role_titles` and `derive()` keeps the
  // STORED family, because a family cannot be recovered from free text.
  assert.match(read("components/preflight/chip-group.tsx"), /onAdd\("role", role\.label, role\.family\)/)
  assert.match(read("components/preflight/use-order-turns.ts"), /role_family: roleFamily/)
})
