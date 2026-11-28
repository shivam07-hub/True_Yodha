"use client"

/**
 * PrepShell — the one Preparations screen (Unified Prep v2, artboard 2b).
 *
 * `/preparations` and `/preparations/[jobId]` are the SAME screen: the rail
 * lists every room, the main column is the open one. The list route opens the
 * room that most wants attention rather than showing a menu — a stage-grouped
 * index of rooms was a second place to read the same state the pips now carry.
 *
 * One ladder read serves both columns, so the rail and the room can never
 * disagree about which step a job is on.
 *
 * Switching rooms is a STATE change, not a route change. Both routes render
 * this one component off one cached read, so a `<Link>` to
 * `/preparations/[jobId]` bought nothing and cost everything: an RSC round trip
 * for a payload that renders the same tree, behind a `loading.tsx` whose
 * skeleton is the WHOLE page — so clicking a room in the rail tore the rail
 * down and put it back seconds later. A rail click `history.pushState`s the
 * room's URL, which App Router treats as shallow, and the room is READ BACK
 * from `usePathname` — Next 14.2 moves it on pushState and on Back. The URL is
 * the only copy: one kept in state went stale after a shallow push, and a Link
 * to `/preparations` then moved the address bar but not the screen.
 *
 * A Finlatics programme opens in the main column the same way, from either
 * state of the rail. It is a pick, not a place: no URL of its own, and any room
 * the user opens (click, Back, a link in) closes it.
 */

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { emitLoopStep, jobs as jobsApi, preparations, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useCareerSkillPath } from "@/lib/hooks/use-career-skill-path"
import { PrepSkeleton } from "./prep-skeleton"
import { PrepRail } from "./prep-rail"
import { PrepRoom } from "./prep-room"
import { RoleRoom } from "./role-room"
import { ROLE_ROOM_ID, isRoleRoom, roleRoom } from "./role-room-model"
import { NoRoomsDoor, TrainingDetail, shelfRows } from "./training-shelf"
import { furthestBehind, ladderOrder, liveRoomCount, roomFromUrl, roomStage } from "./prep-model"
import "@/app/(authed)/home/mission-control.css"

/** The room the list route opens: the first still-workable one, hottest first. */
function openByDefault(ordered: ApplicationResponse[]): string | null {
  const live = ordered.find((app) => roomStage(app.status) !== "closed")
  return (live ?? ordered[0])?.job_id ?? null
}

export function PrepShell({ token }: { token: string }) {
  // `?step=N` comes from a cross-room link and opens that card in the room.
  const chosen = roomFromUrl(usePathname(), useSearchParams().toString())
  // The Finlatics programme in the main column. With no rooms, null follows the
  // best match; with rooms, null means the room shows. A pick holds even when
  // the match lands later.
  const [programId, setProgramId] = React.useState<string | null>(null)
  // Any room the URL moves to — a rail click, Back, a link in — closes it.
  React.useEffect(() => {
    setProgramId(null)
  }, [chosen.jobId, chosen.step])

  function openRoom(href: string) {
    // The room already in the URL does not move it, and must still close a pick.
    setProgramId(null)
    // Shallow (Next 14.2 supports history.pushState for this) — the URL stays
    // deep-linkable and Back still works, with no RSC fetch and no remount.
    window.history.pushState(null, "", href)
    window.scrollTo({ top: 0 })
  }

  function openProgram(nextProgramId: string) {
    setProgramId(nextProgramId)
    // At ≤980px the main column stacks above the rail, so the top is the detail.
    window.scrollTo({ top: 0 })
  }

  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  // Independent of the applications read: the rail paints its rooms as soon as
  // the tracker answers, and the pips fill in when the ladder does. A room list
  // that waits for both would be blank for the slower of the two.
  const ladderQ = useQuery({
    queryKey: dataKeys.prepLadder(),
    queryFn: () => preparations.ladder(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  // The target role's band: the role room's whole read, and with no job room
  // the Finlatics match. Same query key as the Skill path block, so no second
  // request.
  const skillPathQ = useCareerSkillPath()
  const role = roleRoom(skillPathQ.data)

  const apps = appsQ.data ?? []
  const ordered = ladderOrder(apps)
  const noJobRooms = ordered.length === 0
  // Default: the hottest job room, else the target-role room (ONE_PREP P1).
  const selectedId = chosen.jobId ?? openByDefault(ordered) ?? (role ? ROLE_ROOM_ID : null)
  const roleOpen = isRoleRoom(selectedId)
  const app = roleOpen ? null : ordered.find((a) => a.job_id === selectedId) ?? null
  const room = ladderQ.data?.rooms.find((r) => r.job_id === selectedId)
  const totals = ladderQ.data?.totals
  // No room of any kind: the Finlatics shelf is the whole screen, as before.
  const shelfOnly = noJobRooms && !role && !chosen.jobId
  // With job rooms the ladder matched the programmes to their gaps; without,
  // the skill path matched them to the target band.
  const training = shelfRows(noJobRooms ? skillPathQ.data?.training : ladderQ.data?.training)
  const picked = training.find((row) => row.program.id === programId)
    ?? (shelfOnly ? training[0] : null)
  const behind = totals
    ? furthestBehind(
        (ladderQ.data?.rooms ?? []).filter((r) => r.job_id !== selectedId),
        totals.bottleneck_step,
      )
    : null

  // One `room_opened` per room per visit — the rail click, a link in, or the
  // room the list route opened. ONE_PREP §8: who reaches a room at all.
  const openedRoom = picked ? null : roleOpen ? (role ? ROLE_ROOM_ID : null) : app?.job_id ?? null
  const counted = React.useRef(new Set<string>())
  React.useEffect(() => {
    if (!openedRoom || counted.current.has(openedRoom)) return
    counted.current.add(openedRoom)
    emitLoopStep(token, "room_opened", openedRoom, isRoleRoom(openedRoom) ? "role" : "job")
  }, [openedRoom, token])

  if (appsQ.isLoading) return <PrepSkeleton />
  // With no job room the role room opens once the path answers. The skeleton
  // holds until then, so the shelf never flashes in front of a room.
  if (noJobRooms && !chosen.jobId && skillPathQ.isLoading) return <PrepSkeleton />

  return (
    <div className="tm-intel-page prp-workspace-page">
      <div className="mc-workspace">
        <PrepRail
          token={token}
          apps={ordered}
          ladder={ladderQ.data}
          // An open programme owns the main column, so no room reads as open.
          selectedJobId={picked ? null : selectedId}
          live={liveRoomCount(apps)}
          onOpenRoom={openRoom}
          role={role}
          shelf={noJobRooms ? training : null}
          programId={picked?.program.id ?? null}
          onOpenProgram={openProgram}
        />
        <div className="mc-ws-main">
          {picked ? (
            <>
              {shelfOnly ? <NoRoomsDoor /> : null}
              <TrainingDetail row={picked} />
            </>
          ) : roleOpen ? (
            role ? (
              <RoleRoom key={role.title} room={role} initialStep={chosen.step} />
            ) : skillPathQ.isLoading ? null : (
              <div className="prp-empty">
                <Link href="/onboarding">Pick your target role</Link>
              </div>
            )
          ) : app ? (
            <PrepRoom
              token={token}
              app={app}
              room={room}
              totals={totals}
              behind={behind}
              onOpenRoom={openRoom}
              initialStep={chosen.step}
            />
          ) : chosen.jobId ? (
            <div className="prp-empty">
              This room doesn&rsquo;t exist — the job isn&rsquo;t in your pipeline.{" "}
              <Link href="/preparations">Back to Preparations</Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
