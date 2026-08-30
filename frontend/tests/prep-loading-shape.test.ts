import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

test("Prep list skeleton occupies the live workspace: title, rows, peek rail", () => {
  const skel = read("components/preparations/prep-skeleton.tsx")
  const list = read("components/preparations/prep-list.tsx")
  const bootstrap = read("components/loading/page-skeletons.tsx")
  const page = read("app/(authed)/preparations/page.tsx")

  assert.match(skel, /tm-intel-page prp-workspace-page/)
  assert.match(skel, /className="mc-workspace"/)
  assert.match(skel, /className="prp-row"/)
  assert.match(skel, /className="mc-peek-card"/)
  assert.match(skel, /className="prp-courses"/)
  assert.match(skel, /width:\s*34,\s*height:\s*34/)
  assert.match(skel, /FINLATICS_PROGRAMS/)
  assert.doesNotMatch(skel, /Loading your rooms/)
  assert.ok(skel.indexOf("mc-ws-rail") < skel.indexOf("mc-ws-main"))

  assert.match(list, /tm-intel-page prp-workspace-page/)
  assert.match(list, /className="mc-workspace"/)
  assert.match(list, /PrepSkeleton/)
  assert.doesNotMatch(list, /Loading your rooms/)
  assert.ok(list.indexOf("mc-ws-rail") < list.indexOf("mc-ws-main"))

  const train = read("components/preparations/training-card.tsx")
  const trainCss = read("components/preparations/training-card.css")
  assert.match(train, /className="prp-course-toggle tm-control-focus"/)
  assert.match(train, /className="prp-course-name"/)
  assert.match(train, /prp-course-blurb/)
  assert.match(train, /FINLATICS_APPLY_LABEL/)
  assert.doesNotMatch(train, /<a[^>]*className="prp-course[\s"]/)
  assert.match(trainCss, /\.prp-course:hover \.prp-course-panel/)
  assert.match(trainCss, /\.prp-course-name[\s\S]*font-size:\s*14\.5px/)
  assert.match(trainCss, /\.prp-course-name[\s\S]*font-weight:\s*700/)
  assert.match(trainCss, /\.prp-course-name[\s\S]*color:\s*var\(--tm-accent-text\)/)

  assert.match(bootstrap, /pathname\.startsWith\("\/preparations\/"\)/)
  assert.match(bootstrap, /PrepRoomSkeleton/)
  assert.match(bootstrap, /pathname\.startsWith\("\/preparations"\)/)
  assert.match(bootstrap, /PrepSkeleton/)

  assert.match(page, /PrepSkeleton/)
  assert.doesNotMatch(page, /if \(!ready\) return null/)
})

test("Prep room skeleton occupies the 860px reading column, not the list workspace", () => {
  const skel = read("components/preparations/prep-skeleton.tsx")
  const room = read("app/(authed)/preparations/[jobId]/page.tsx")

  const roomFn = skel.slice(skel.indexOf("export function PrepRoomSkeleton"))
  assert.match(roomFn, /className="prp-page/)
  assert.match(roomFn, /className="prp-room-head"/)
  assert.match(roomFn, /width:\s*40,\s*height:\s*40/)
  assert.doesNotMatch(roomFn, /prp-workspace/)
  assert.doesNotMatch(roomFn, /mc-workspace/)

  assert.match(room, /PrepRoomSkeleton/)
  assert.doesNotMatch(room, /return null/)
})
