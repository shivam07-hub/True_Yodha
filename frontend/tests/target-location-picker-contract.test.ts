import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

const picker = read("components/target-location/location-picker.tsx")
const catalog = read("lib/location-catalog.ts")

/** Every surface that lets someone choose WHERE they want to work. Adding one
 *  here without the shared matcher is the drift this file exists to stop:
 *  Myro Search took cities as FREE TEXT, so typing produced Cancel/Add and no
 *  list, and "Gurgaon" could not find the corpus name "Gurugram". */
const CHOOSING_SURFACES = [
  "components/preflight/slot-group.tsx",
  "components/settings-modal.tsx",
  "components/onboarding/location-choice.tsx",
]

test("the location picker offers the live job-city catalog", () => {
  assert.match(picker, /jobs\.analytics/)
  assert.match(picker, /suggestLocations/)
  assert.match(picker, /extras/)
  assert.doesNotMatch(picker, /SayPad/)
})

test("aliases live in one matcher, not per surface", () => {
  assert.match(catalog, /gurgaon: "Gurugram"/)
  assert.match(catalog, /bangalore: "Bengaluru"/)
})

test("every surface that chooses a location uses the shared matcher", () => {
  for (const path of CHOOSING_SURFACES) {
    const source = read(path)
    assert.match(
      source,
      /suggestLocations|locationMatches|LocationPicker/,
      `${path} must choose cities from the corpus, never take them as unmatched free text`,
    )
  }
})
