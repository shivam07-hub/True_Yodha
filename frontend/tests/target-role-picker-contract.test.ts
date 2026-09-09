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
  // The evidence is the SKILLS now. A count of overlapping skills could not say
  // which, and it ranked by family size — see migration 20260909100000.
  assert.match(picker, /FamilySkills/)
  assert.doesNotMatch(picker, /e\.g\. Product Manager/)
})

test("every surface that chooses a role mounts the same picker", () => {
  for (const path of CHOOSING_SURFACES) {
    const source = read(path)
    assert.match(source, /RoleFamilyPicker/, `${path} must choose roles, never take them as free text`)
  }
})

test("a picker selection saves the family as both the title and the scope", () => {
  // `label` is the cluster's commonest job title. It names TWENTY families
  // "Custom Software Engineer", and it is not what the person chose — so
  // storing it left Settings, Practice and the score header showing a title
  // nobody picked. The family is the name on every surface.
  assert.match(mutation, /role_title: role\.family\.trim\(\)/)
  assert.match(mutation, /role_family: role\.family/)
  assert.doesNotMatch(mutation, /role\.label/, "the modal job title is back in the write path")
})

test("the pre-flight carries the family it resolved onto the order", () => {
  // Without this the title reaches `target_role_titles` and `derive()` keeps the
  // STORED family, because a family cannot be recovered from free text.
  assert.match(read("components/preflight/chip-group.tsx"), /onAdd\("role", role\.family, role\.family\)/)
  assert.match(read("components/preflight/use-order-turns.ts"), /role_family: roleFamily/)
})
