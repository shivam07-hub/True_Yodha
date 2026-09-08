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
 * down and put it back seconds later. The room is chosen here and the URL is
 * corrected with `history.pushState`, which App Router treats as shallow. Deep
 * links, refresh and Back all still work; only the wait is gone.
 */

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { jobs as jobsApi, preparations, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { PrepSkeleton } from "./prep-skeleton"
import { PrepRail } from "./prep-rail"
import { PrepRoom } from "./prep-room"
import { furthestBehind, ladderOrder, liveRoomCount, roomStage } from "./prep-model"
import "@/app/(authed)/home/mission-control.css"

/** The room the list route opens: the first still-workable one, hottest first. */
function openByDefault(ordered: ApplicationResponse[]): string | null {
  const live = ordered.find((app) => roomStage(app.status) !== "closed")
  return (live ?? ordered[0])?.job_id ?? null
}

/** The job id `/preparations/[jobId]` names, or null on the list route. Read
 *  back off the URL after a Back/Forward, which is the only way this component
 *  hears about a shallow entry it pushed itself. */
function jobIdFromPath(pathname: string): string | null {
  const match = /^\/preparations\/([^/?#]+)/.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}

export function PrepShell({
  token,
  jobId = null,
  step = null,
}: {
  token: string
  jobId?: string | null
  /** `?step=N` from a cross-room link — opens that card in the room. */
  step?: number | null
}) {
  // Seeded by the route, then owned here. A room switch never re-enters Next's
  // router, so this is the only thing that moves.
  const [chosen, setChosen] = React.useState<{ jobId: string | null; step: number | null }>(
    { jobId, step },
  )
  // A real navigation INTO this screen (Collections, a notification, the loop
  // bar) still arrives as a prop change, and must win over what was chosen here.
  React.useEffect(() => { setChosen({ jobId, step }) }, [jobId, step])
  // Back/Forward across rooms we pushed ourselves: the router never re-renders
  // for a shallow entry, so the URL is the only source left.
  React.useEffect(() => {
    function onPop() {
      setChosen({ jobId: jobIdFromPath(window.location.pathname), step: null })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  function openRoom(nextJobId: string, href: string, nextStep: number | null = null) {
    setChosen({ jobId: nextJobId, step: nextStep })
    // Shallow (Next 14.2 supports history.pushState for this) — the URL stays
    // deep-linkable and Back still works, with no RSC fetch and no remount.
    window.history.pushState(null, "", href)
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

  if (appsQ.isLoading) return <PrepSkeleton />

  const apps = appsQ.data ?? []
  const ordered = ladderOrder(apps)
  const selectedId = chosen.jobId ?? openByDefault(ordered)
  const app = ordered.find((a) => a.job_id === selectedId) ?? null
  const room = ladderQ.data?.rooms.find((r) => r.job_id === selectedId)
  const totals = ladderQ.data?.totals
  const behind = totals
    ? furthestBehind(
        (ladderQ.data?.rooms ?? []).filter((r) => r.job_id !== selectedId),
        totals.bottleneck_step,
      )
    : null

  return (
    <div className="tm-intel-page prp-workspace-page">
      <div className="mc-workspace">
        <PrepRail
          token={token}
          apps={ordered}
          ladder={ladderQ.data}
          selectedJobId={selectedId}
          live={liveRoomCount(apps)}
          onOpenRoom={openRoom}
        />
        <div className="mc-ws-main">
          {app ? (
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
          ) : (
            <div className="prp-empty">
              Nothing to prep yet.{" "}
              <Link href="/collections">Apply to a job in Collections</Link> and its
              room opens here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
