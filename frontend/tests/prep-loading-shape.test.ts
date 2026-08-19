import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

test("Prep list skeleton occupies the live workspace: title, rows, peek rail", () => {
  const skel = read("components/preparations/prep-skeleton.tsx")
  const list = read("components/preparations/prep-list.tsx")
  const css = read("components/preparations/preparations.css")
  const bootstrap = read("components/loading/page-skeletons.tsx")
  const page = read("app/(authed)/preparations/page.tsx")

  assert.match(skel, /tm-intel-page prp-workspace-page/)
  assert.match(skel, /mc-workspace prp-workspace/)
  assert.match(skel, /className="prp-row"/)
  assert.match(skel, /className="mc-peek-card"/)
  assert.match(skel, /className="mc-peek-gap prp-train-row"/)
  assert.match(skel, /width:\s*34,\s*height:\s*34/)
  assert.match(skel, /FINLATICS_PROGRAMS/)
  assert.doesNotMatch(skel, /Loading your rooms/)

  assert.match(list, /tm-intel-page prp-workspace-page/)
  assert.match(list, /mc-workspace prp-workspace/)
  assert.match(list, /PrepSkeleton/)
  assert.doesNotMatch(list, /Loading your rooms/)

  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) 248px/)

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
